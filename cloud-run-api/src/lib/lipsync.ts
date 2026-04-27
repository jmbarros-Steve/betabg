/**
 * Lip-sync via Sync Labs 2.0 on Replicate (sync/lipsync-2).
 *
 * Used post-Kling for templates where a person speaks (talking_head,
 * testimonial, lifestyle_ugc). Sync takes a SILENT video + an audio file
 * and returns a video with the actor's mouth synchronized to the audio.
 *
 * Important: Sync 2.0 returns video WITHOUT audio mixed in — only the mouth
 * shape is altered. The caller still needs to mux the narration (and music)
 * into the final mp4 (handled by mergeVideoStudio in lib/video-merge.ts).
 *
 * Replicate model: `sync/lipsync-2` (official Sync Labs publisher).
 *   - latest_version verified 2026-04-24: 3190ef7dc0cbca29458d0032c032ef140a840087141cf10333e8d19a213f9194
 *   - input shape: { video: uri, audio: uri, sync_mode?, temperature?, active_speaker? }
 *   - sync_mode default 'loop' is fine — narration matches video duration in our pipeline.
 *
 * Note: requested model was Sync 1.6, but Replicate only exposes Sync's 2.0
 * model under sync/lipsync-2 (verified via /v1/models/sync/lipsync,
 * sync/lipsync-1.6, lucataco/sync-1.6, chenxwh/sync-lipsync — all 404).
 * 2.0 is the same vendor (sync.so), newer architecture, ~$0.30 per video.
 *
 * Fallback: if sync/lipsync-2 fails (e.g. quota, model offline), the caller
 * is expected to skip lip-sync and proceed straight to FFmpeg merge so the
 * actor still gets audio (mouth just won't be synced).
 */

import { runReplicatePrediction, ReplicateError } from './replicate.js';

// Verified 2026-04-24 against /v1/models/sync/lipsync-2.
const SYNC_MODEL = 'sync/lipsync-2';
const SYNC_VERSION = '3190ef7dc0cbca29458d0032c032ef140a840087141cf10333e8d19a213f9194';

export interface LipSyncOptions {
  videoUrl: string;
  audioUrl: string;
  /** Wall-clock timeout in ms. Default 4 min. */
  timeoutMs?: number;
}

export class LipSyncError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LipSyncError';
  }
}

/**
 * Run Sync 2.0 lip-sync. Throws on failure (caller decides fallback).
 * Returns the URL of the lip-synced mp4 (still SILENT — audio must be re-muxed).
 */
export async function runLipSync(opts: LipSyncOptions): Promise<string> {
  const { videoUrl, audioUrl, timeoutMs = 240_000 } = opts;
  if (!videoUrl) throw new LipSyncError('videoUrl is required');
  if (!audioUrl) throw new LipSyncError('audioUrl is required');

  let output: string | string[];
  try {
    output = await runReplicatePrediction<
      Record<string, unknown>,
      string | string[]
    >({
      model: SYNC_MODEL,
      version: SYNC_VERSION,
      input: {
        video: videoUrl,
        audio: audioUrl,
        // sync_mode 'loop' keeps the audio playing for the full video duration
        // if narration is shorter; 'cut_off' would truncate the video. Loop is
        // the safer default since our narrations are ~5-9s and Kling is 10s.
        sync_mode: 'loop',
        temperature: 0.5,
        active_speaker: false,
      },
      timeoutMs,
      preferWaitSeconds: 55,
      pollIntervalMs: 4_000,
    });
  } catch (err) {
    const msg =
      err instanceof ReplicateError
        ? err.message
        : (err as Error)?.message || 'unknown';
    throw new LipSyncError(`Sync prediction failed: ${msg}`, err);
  }

  const url =
    typeof output === 'string'
      ? output
      : Array.isArray(output)
        ? output[0]
        : null;
  if (!url || typeof url !== 'string') {
    throw new LipSyncError('Sync returned no output URL');
  }
  return url;
}

/**
 * Templates where the actor visibly speaks → lip-sync improves quality.
 * Other templates (hero_shot, product_reveal, macro_detail, before_after,
 * unboxing) usually have voiceover OVER product shots, so syncing makes no
 * sense and we skip Sync to save $0.30/video.
 */
export function templateNeedsLipSync(
  template: string | undefined | null,
): boolean {
  if (!template) return false;
  return ['talking_head', 'testimonial', 'lifestyle_ugc'].includes(template);
}
