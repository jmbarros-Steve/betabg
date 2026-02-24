import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractVideoId(input: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return null;
}

async function extractYouTubeTranscript(videoId: string): Promise<string> {
  console.log(`[YouTube] Attempting caption extraction for video: ${videoId}`);

  // Method 1: Try extracting from YouTube page HTML
  try {
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });

    if (res.ok) {
      const html = await res.text();
      const captionMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])/);

      if (captionMatch) {
        let captionTracks: Array<{ baseUrl: string; languageCode: string }>;
        try {
          captionTracks = JSON.parse(captionMatch[1]);
        } catch {
          console.log('[YouTube] Failed to parse caption tracks JSON');
          captionTracks = [];
        }

        if (captionTracks.length > 0) {
          const preferred = captionTracks.find(t => t.languageCode === 'es')
            || captionTracks.find(t => t.languageCode === 'en')
            || captionTracks[0];

          const captionRes = await fetch(preferred.baseUrl);
          if (captionRes.ok) {
            const xml = await captionRes.text();
            const texts = [...xml.matchAll(/<text[^>]*>(.*?)<\/text>/gs)]
              .map(m => m[1]
                .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n/g, ' ').trim()
              )
              .filter(Boolean);

            if (texts.length > 0) {
              console.log(`[YouTube] Caption extraction successful: ${texts.length} segments`);
              return texts.join(' ');
            }
          }
        }
      }
    }
  } catch (e) {
    console.log(`[YouTube] Caption method failed: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  // Method 2: InnerTube API
  console.log('[YouTube] No captions found, trying alternative methods...');
  try {
    const innertubeRes = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } },
        params: btoa(`\n\x0b${videoId}`)
      }),
    });

    if (innertubeRes.ok) {
      const data = await innertubeRes.json();
      const segments = data?.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer
        ?.body?.transcriptBodyRenderer?.cueGroups;
      
      if (segments && segments.length > 0) {
        const text = segments
          .map((g: any) => g?.transcriptCueGroupRenderer?.cues?.[0]?.transcriptCueRenderer?.cue?.simpleText || '')
          .filter(Boolean)
          .join(' ');
        
        if (text.length > 50) {
          console.log(`[YouTube] InnerTube transcript successful: ${text.length} chars`);
          return text;
        }
      }
    }
  } catch (e) {
    console.log(`[YouTube] InnerTube method failed: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  // Method 3: Whisper transcription
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (OPENAI_API_KEY) {
    console.log('[YouTube] Attempting audio download + Whisper transcription...');
    try {
      const cobaltRes = await fetch('https://api.cobalt.tools/', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          downloadMode: 'audio',
          audioFormat: 'mp3',
          audioBitrate: '96',
        }),
      });

      if (cobaltRes.ok) {
        const cobaltData = await cobaltRes.json();
        const audioUrl = cobaltData?.url;

        if (audioUrl) {
          console.log(`[YouTube] Audio URL obtained, downloading...`);
          const audioRes = await fetch(audioUrl);

          if (audioRes.ok) {
            const audioBlob = await audioRes.blob();
            console.log(`[YouTube] Audio downloaded: ${(audioBlob.size / 1024 / 1024).toFixed(1)} MB`);

            if (audioBlob.size <= 25 * 1024 * 1024) {
              const formData = new FormData();
              formData.append('file', audioBlob, 'audio.mp3');
              formData.append('model', 'whisper-1');
              formData.append('language', 'es');

              const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
                body: formData,
              });

              if (whisperRes.ok) {
                const whisperData = await whisperRes.json();
                if (whisperData.text && whisperData.text.length > 50) {
                  console.log(`[YouTube] Whisper transcription successful: ${whisperData.text.length} chars`);
                  return whisperData.text;
                }
              } else {
                const errText = await whisperRes.text();
                console.log(`[YouTube] Whisper API error: ${whisperRes.status} - ${errText.slice(0, 200)}`);
              }
            } else {
              console.log(`[YouTube] Audio too large for Whisper: ${(audioBlob.size / 1024 / 1024).toFixed(1)} MB`);
            }
          }
        }
      } else {
        console.log(`[YouTube] Cobalt API returned ${cobaltRes.status}`);
      }
    } catch (e) {
      console.log(`[YouTube] Whisper fallback failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  // Method 4: Firecrawl
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (FIRECRAWL_API_KEY) {
    console.log('[YouTube] Attempting Firecrawl page scraping as last resort...');
    try {
      const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}`, formats: ['markdown'] }),
      });

      if (fcRes.ok) {
        const fcData = await fcRes.json();
        const markdown = fcData.data?.markdown;
        if (markdown && markdown.length > 200) {
          console.log(`[YouTube] Firecrawl fallback successful: ${markdown.length} chars`);
          return markdown;
        }
      }
    } catch (e) {
      console.log(`[YouTube] Firecrawl fallback failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  throw new Error(
    'No se pudieron extraer subtítulos de este video. El video puede no tener subtítulos disponibles. ' +
    'Intenta: 1) Copiar la transcripción manualmente desde YouTube, o 2) Subir el contenido como texto.'
  );
}

async function extractUrlContent(url: string): Promise<string> {
  console.log(`[URL] Extracting content from: ${url}`);
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');

  if (FIRECRAWL_API_KEY) {
    try {
      const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formats: ['markdown'] }),
      });

      if (fcRes.ok) {
        const fcData = await fcRes.json();
        const markdown = fcData.data?.markdown;
        if (markdown && markdown.length > 100) {
          console.log(`[URL] Firecrawl extraction successful: ${markdown.length} chars`);
          return markdown;
        }
      }
    } catch (e) {
      console.log(`[URL] Firecrawl failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteveBot/1.0)' },
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);

  const html = await res.text();
  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50000);

  console.log(`[URL] HTML fallback extraction: ${cleaned.length} chars`);
  return cleaned;
}

// ── Main ─────────────────────────────────────────────────────────────────────
// Phase 1: Extract content and save transcription to learning_queue.
// Phase 2 (process-transcription) handles Claude chunking.
// For short content (<=50k chars), we do everything in one shot for speed.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let queueId: string | null = null;

  try {
    const { sourceType, content, autoSave = false, title } = await req.json();
    console.log(`[Step 0] sourceType: ${sourceType}, contentLength: ${content?.length || 0}, autoSave: ${autoSave}`);

    if (!sourceType || !content?.trim()) {
      return new Response(JSON.stringify({ error: 'sourceType and content are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Step 1: Create queue record
    const { data: queueRow, error: queueErr } = await supabase
      .from('learning_queue')
      .insert({
        source_type: sourceType,
        source_content: content.slice(0, 2000),
        source_title: title || null,
        status: 'processing',
      })
      .select('id')
      .single();

    if (queueErr) console.error('[Step 1] Queue insert error:', queueErr);
    queueId = queueRow?.id || null;
    console.log(`[Step 1] Queue record: ${queueId}`);

    // Step 2: Extract text
    console.log(`[Step 2] Extracting content...`);
    let extractedText: string;
    let isPdf = false;

    switch (sourceType) {
      case 'youtube': {
        const videoId = extractVideoId(content.trim());
        if (!videoId) throw new Error('Invalid YouTube URL or video ID');
        extractedText = await extractYouTubeTranscript(videoId);
        break;
      }
      case 'url':
        extractedText = await extractUrlContent(content.trim());
        break;
      case 'pdf':
        extractedText = content.trim(); // base64
        isPdf = true;
        break;
      case 'text':
        extractedText = content.trim();
        break;
      default:
        throw new Error(`Unsupported source type: ${sourceType}`);
    }

    const textLength = isPdf ? 0 : extractedText.length;
    console.log(`[Step 2] Extracted: ${isPdf ? 'PDF (base64)' : `${textLength} chars`}`);

    // ── Decision: short content → process inline; long → save & defer ──
    const MAX_INLINE_CHARS = 50000;
    const needsChunking = !isPdf && textLength > MAX_INLINE_CHARS;

    if (needsChunking) {
      // Save transcription and return immediately — frontend will call process-transcription
      console.log(`[Step 3] Content too long (${textLength} chars), saving transcription for chunked processing...`);

      if (queueId) {
        await supabase.from('learning_queue').update({
          transcription: extractedText,
          status: 'transcribed',
        }).eq('id', queueId);
      }

      return new Response(JSON.stringify({
        status: 'transcribed',
        queueId,
        textLength,
        message: `Transcripción guardada (${textLength} caracteres). Se procesará en chunks.`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Short content: process inline (original flow) ──
    console.log('[Step 3] Short content, processing inline with Claude...');

    const systemPrompt = `Eres un experto en performance marketing para e-commerce. Analiza el siguiente contenido y extrae TODAS las reglas accionables, estrategias y tácticas mencionadas. Para cada regla genera un JSON con: titulo (nombre corto y descriptivo de la regla, máximo 60 caracteres), contenido (la regla completa con los pasos numerados, clara y accionable), categoria (clasifica en una de estas categorías EXACTAS: brief, seo, keywords, meta, meta_ads, google, shopify, klaviyo, anuncios, buyer_persona). Si una regla aplica a múltiples categorías, elige la más relevante. Si el contenido no es sobre marketing/e-commerce, extrae lo que puedas y clasifica en la categoría más cercana. Responde SOLO con un array JSON válido sin markdown ni backticks.`;

    const userContent: any[] = [];

    if (isPdf) {
      userContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: content },
      });
      userContent.push({
        type: 'text',
        text: 'Analiza este documento PDF y extrae todas las reglas accionables de marketing/e-commerce.',
      });
    } else {
      userContent.push({
        type: 'text',
        text: `Analiza el siguiente contenido y extrae todas las reglas accionables:\n\n${extractedText}`,
      });
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API error: ${anthropicRes.status} - ${errText.slice(0, 200)}`);
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData.content[0].text.trim();

    // Parse rules
    const jsonText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    let rules: Array<{ titulo: string; contenido: string; categoria: string }>;

    try {
      const parsed = JSON.parse(jsonText);
      rules = Array.isArray(parsed) ? parsed : (parsed.entradas || parsed.rules || []);
    } catch {
      throw new Error('Failed to parse Claude response as JSON');
    }

    if (!Array.isArray(rules) || rules.length === 0) throw new Error('No rules extracted from content');

    console.log(`[Step 4] Parsed ${rules.length} rules`);

    // Save rules
    let saved = false;
    if (autoSave) {
      const inserts = rules.map(r => ({
        categoria: r.categoria,
        titulo: r.titulo.slice(0, 80),
        contenido: r.contenido,
        activo: true,
        orden: 99,
        source_id: queueId || null,
      }));

      const { error: insertErr } = await supabase.from('steve_knowledge').insert(inserts);
      if (!insertErr) saved = true;
      else console.error('[Step 5] Failed to save rules:', insertErr);
    }

    // Update queue
    if (queueId) {
      await supabase.from('learning_queue').update({
        status: 'completed',
        rules_extracted: rules.length,
        processed_at: new Date().toISOString(),
      }).eq('id', queueId);
    }

    return new Response(JSON.stringify({ rules, saved, queueId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('learn-from-source error:', errorMessage);

    if (queueId) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        await supabase.from('learning_queue').update({
          status: 'error',
          error_message: errorMessage,
          processed_at: new Date().toISOString(),
        }).eq('id', queueId);
      } catch {}
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
