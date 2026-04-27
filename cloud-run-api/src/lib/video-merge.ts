/**
 * Brief Estudio — Fase 2: FFmpeg merge for video + narration + music.
 *
 * Cloud Run runtime ships with `ffmpeg` (installed via Dockerfile apt-get).
 * This helper:
 *   1. Validates ffmpeg is on PATH.
 *   2. Downloads inputs (mp4, optional narration mp3, optional music mp3) to
 *      `/tmp/<uuid>.<ext>`.
 *   3. Builds an ffmpeg command depending on which audio sources are present
 *      (4 modes — see comments inline). Music is ducked under narration when
 *      both are present (sidechaincompress).
 *   4. Uploads the resulting mp4 to Supabase Storage `client-assets` and
 *      returns the public URL + size.
 *   5. Cleans up `/tmp` regardless of success/failure.
 *
 * NOT idempotent — each call re-uploads. Caller should pick a deterministic
 * `outputPath` per creative if it cares about idempotency.
 *
 * Memory note: a 10s 1080p mp4 is ~25MB on disk + ~8MB combined audio.
 * FFmpeg streams these so peak RAM is ~40-60MB. Cloud Run service should be
 * provisioned with at least 1GB to leave headroom for concurrent merges.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSupabaseAdmin } from './supabase.js';

export interface MergeOptions {
  videoUrl: string;
  narrationUrl?: string | null;
  musicTrackUrl?: string | null;
  videoDurationSec: number;
  /** Storage path under the `client-assets` bucket (e.g. `videos/<id>/merged-<uuid>.mp4`). */
  outputPath: string;
  /** Music volume 0-1 (default 0.25 when narration present, 0.8 when music-only). */
  musicVolumeDuck?: number;
  musicVolumeOnly?: number;
}

export interface MergeResult {
  url: string;
  size_bytes: number;
  command_label: string;
}

/**
 * Validate that ffmpeg is installed and on PATH. Returns the resolved binary
 * (or 'ffmpeg' if `which` failed but spawn might still find it). Throws when
 * ffmpeg is definitely not available.
 */
export async function ensureFfmpegAvailable(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      reject(
        new Error(
          `ffmpeg not available on PATH (${err.message}). Install via Dockerfile: apt-get install -y ffmpeg`,
        ),
      );
    });
    child.on('close', (code) => {
      if (code === 0) resolve('ffmpeg');
      else
        reject(
          new Error(
            `ffmpeg invocation failed (exit ${code}). stderr: ${stderr.slice(0, 200)}`,
          ),
        );
    });
  });
}

/** Streamed download to a local file. Returns the absolute path. */
async function downloadToTmp(url: string, dir: string, ext: string): Promise<string> {
  const path = join(dir, `${randomUUID()}.${ext}`);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(120_000),
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`download failed ${res.status} for ${url.slice(0, 80)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await import('node:fs').then((fs) => fs.promises.writeFile(path, buf));
  return path;
}

interface RunFfmpegResult {
  code: number;
  stderr: string;
}

function runFfmpeg(args: string[], timeoutMs = 240_000): Promise<RunFfmpegResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      // Limit stderr buffer to last ~16KB to avoid memory blowup on long encodes.
      if (stderr.length > 16 * 1024) stderr = stderr.slice(-16 * 1024);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) {
        reject(new Error(`ffmpeg killed after ${timeoutMs}ms timeout`));
        return;
      }
      resolve({ code: code ?? -1, stderr });
    });
  });
}

/**
 * Build the ffmpeg arg list based on which inputs we have.
 *
 * Cases:
 *   A) narration + music → ducked sidechain mix
 *   B) narration only    → pad narration to video duration, mux on top
 *   C) music only        → loop+trim+fade music to video duration
 *
 * When neither is present the caller should NOT call this helper.
 */
function buildFfmpegArgs(opts: {
  videoPath: string;
  narrationPath: string | null;
  musicPath: string | null;
  outPath: string;
  videoDurationSec: number;
  musicVolumeDuck: number;
  musicVolumeOnly: number;
}): { args: string[]; label: string } {
  const {
    videoPath,
    narrationPath,
    musicPath,
    outPath,
    videoDurationSec,
    musicVolumeDuck,
    musicVolumeOnly,
  } = opts;

  // Common output args. We keep video stream copy (no re-encode) and encode
  // audio as AAC at 128kbps for Meta/IG compatibility. -shortest aligns to
  // the shortest stream which we have already padded/clipped to videoDuration.
  const tail = [
    '-map',
    '0:v',
    '-map',
    '[a]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-shortest',
    '-movflags',
    '+faststart',
    '-y',
    outPath,
  ];

  const fadeOutStart = Math.max(0.1, videoDurationSec - 1);

  if (narrationPath && musicPath) {
    // Case A — narration + music with sidechain ducking.
    // [1] = narration (input 1), [2] = music (input 2)
    //  - apad to whole_dur ensures narration covers full video timeline (silent tail).
    //  - aloop + atrim makes music a fixed-length bed.
    //  - sidechaincompress with narration as the trigger pulls music down whenever voice plays.
    //  - amix combines the ducked music + narration.
    const filter = [
      `[1]apad=whole_dur=${videoDurationSec.toFixed(3)}[narr]`,
      `[2]aloop=-1:size=2e+09,atrim=duration=${videoDurationSec.toFixed(3)},volume=${musicVolumeDuck.toFixed(2)},afade=in:d=0.5,afade=out:st=${fadeOutStart.toFixed(3)}:d=1[mus]`,
      `[mus][narr]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=250[ducked_mus]`,
      `[narr][ducked_mus]amix=inputs=2:duration=longest:dropout_transition=0[a]`,
    ].join('; ');
    return {
      label: 'narration+music+ducking',
      args: [
        '-i',
        videoPath,
        '-i',
        narrationPath,
        '-i',
        musicPath,
        '-filter_complex',
        filter,
        ...tail,
      ],
    };
  }

  if (narrationPath) {
    // Case B — narration only.
    const filter = `[1]apad=whole_dur=${videoDurationSec.toFixed(3)}[a]`;
    return {
      label: 'narration-only',
      args: [
        '-i',
        videoPath,
        '-i',
        narrationPath,
        '-filter_complex',
        filter,
        ...tail,
      ],
    };
  }

  if (musicPath) {
    // Case C — music only.
    const filter = `[1]aloop=-1:size=2e+09,atrim=duration=${videoDurationSec.toFixed(3)},volume=${musicVolumeOnly.toFixed(2)},afade=in:d=0.5,afade=out:st=${fadeOutStart.toFixed(3)}:d=1[a]`;
    return {
      label: 'music-only',
      args: [
        '-i',
        videoPath,
        '-i',
        musicPath,
        '-filter_complex',
        filter,
        ...tail,
      ],
    };
  }

  // Unreachable — caller should not invoke us with no audio.
  throw new Error('mergeVideoStudio called with neither narration nor music');
}

/**
 * Main entry point: merges video + optional narration + optional music into a
 * single mp4 and uploads to Supabase Storage.
 */
export async function mergeVideoStudio(opts: MergeOptions): Promise<MergeResult> {
  const {
    videoUrl,
    narrationUrl,
    musicTrackUrl,
    videoDurationSec,
    outputPath,
    musicVolumeDuck = 0.25,
    musicVolumeOnly = 0.8,
  } = opts;

  if (!videoUrl) throw new Error('videoUrl is required');
  if (!narrationUrl && !musicTrackUrl) {
    throw new Error('Nothing to merge — no narrationUrl and no musicTrackUrl');
  }
  if (!Number.isFinite(videoDurationSec) || videoDurationSec <= 0) {
    throw new Error(`invalid videoDurationSec: ${videoDurationSec}`);
  }

  await ensureFfmpegAvailable();

  // Create a unique scratch dir so concurrent merges don't collide.
  const dir = await mkdtemp(join(tmpdir(), 'steve-merge-'));
  try {
    const videoPath = await downloadToTmp(videoUrl, dir, 'mp4');
    const narrationPath = narrationUrl ? await downloadToTmp(narrationUrl, dir, 'mp3') : null;
    const musicPath = musicTrackUrl ? await downloadToTmp(musicTrackUrl, dir, 'mp3') : null;

    const outPath = join(dir, `out-${randomUUID()}.mp4`);
    const built = buildFfmpegArgs({
      videoPath,
      narrationPath,
      musicPath,
      outPath,
      videoDurationSec,
      musicVolumeDuck,
      musicVolumeOnly,
    });

    console.log(`[video-merge] running ffmpeg (${built.label}, dur=${videoDurationSec}s)`);
    const result = await runFfmpeg(built.args);
    if (result.code !== 0) {
      throw new Error(
        `ffmpeg exited with code ${result.code}. tail: ${result.stderr.slice(-400)}`,
      );
    }

    const stats = await stat(outPath);
    if (stats.size <= 0) {
      throw new Error('ffmpeg produced an empty mp4');
    }

    const bytes = await readFile(outPath);
    const supabase = getSupabaseAdmin();
    const { error: upErr } = await supabase.storage
      .from('client-assets')
      .upload(outputPath, bytes, { contentType: 'video/mp4', upsert: true });
    if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);
    const { data: pub } = supabase.storage.from('client-assets').getPublicUrl(outputPath);

    return {
      url: pub.publicUrl,
      size_bytes: stats.size,
      command_label: built.label,
    };
  } finally {
    // Best-effort cleanup. Failure here is logged but never thrown.
    rm(dir, { recursive: true, force: true }).catch((err) => {
      console.warn('[video-merge] tmp cleanup failed:', err?.message);
    });
  }
}
