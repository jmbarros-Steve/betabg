/**
 * Audio Transcriber — Downloads WhatsApp audio from Twilio and transcribes with OpenAI Whisper.
 *
 * Twilio provides MediaUrl0 for audio messages. We download, convert to buffer,
 * and send to Whisper API for Spanish transcription.
 *
 * Requires: OPENAI_API_KEY env var
 * Supported formats: audio/ogg, audio/mpeg, audio/amr, audio/mp4, audio/wav
 */

const SUPPORTED_AUDIO_TYPES = [
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/amr',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
  'audio/aac',
];

// Map content type to file extension for Whisper
const EXTENSION_MAP: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/amr': 'amr',
  'audio/mp4': 'mp4',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/aac': 'aac',
};

export function isSupportedAudio(contentType: string): boolean {
  return SUPPORTED_AUDIO_TYPES.some(t => contentType.startsWith(t));
}

/**
 * Download audio from Twilio URL and transcribe with Whisper.
 * Returns the transcribed text, or null if it fails.
 */
export async function transcribeAudio(
  mediaUrl: string,
  contentType: string,
): Promise<string | null> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn('[audio-transcriber] OPENAI_API_KEY not configured, skipping transcription');
    return null;
  }

  try {
    // 1. Download audio from Twilio (authenticated with Twilio creds)
    const twilioSid = process.env.TWILIO_ACCOUNT_SID || '';
    const twilioToken = process.env.TWILIO_AUTH_TOKEN || '';
    const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');

    const audioRes = await fetch(mediaUrl, {
      headers: { Authorization: authHeader },
    });

    if (!audioRes.ok) {
      console.error(`[audio-transcriber] Failed to download audio: ${audioRes.status}`);
      return null;
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    // Limit: skip files > 25MB (Whisper limit)
    if (audioBuffer.length > 25 * 1024 * 1024) {
      console.warn('[audio-transcriber] Audio too large (>25MB), skipping');
      return null;
    }

    // 2. Build multipart form for Whisper API
    const ext = EXTENSION_MAP[contentType] || 'ogg';
    const filename = `audio.${ext}`;

    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: contentType }), filename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'es'); // Spanish
    formData.append('response_format', 'text');

    // 3. Send to Whisper API
    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error(`[audio-transcriber] Whisper API error ${whisperRes.status}: ${errText}`);
      return null;
    }

    const transcription = (await whisperRes.text()).trim();

    if (!transcription || transcription.length < 2) {
      console.warn('[audio-transcriber] Empty transcription');
      return null;
    }

    console.log(`[audio-transcriber] Transcribed ${audioBuffer.length} bytes → ${transcription.length} chars`);
    return transcription;
  } catch (err: any) {
    console.error('[audio-transcriber] Error:', err.message);
    return null;
  }
}
