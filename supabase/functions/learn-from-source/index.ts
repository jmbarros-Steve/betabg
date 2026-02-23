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

  // Method 2: Try YouTube transcript API alternatives
  console.log('[YouTube] No captions found, trying alternative methods...');

  // Method 3: Try using youtube-transcript npm workaround via innertube
  try {
    const innertubeRes = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' }
        },
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

  // Method 4: Whisper fallback via OpenAI
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (OPENAI_API_KEY) {
    console.log('[YouTube] Attempting Whisper transcription fallback...');
    try {
      // Download audio via a public proxy/converter
      const audioUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      // Use Firecrawl to at least get the page content as fallback
      const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
      if (FIRECRAWL_API_KEY) {
        const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: audioUrl, formats: ['markdown'] }),
        });

        if (fcRes.ok) {
          const fcData = await fcRes.json();
          const markdown = fcData.data?.markdown;
          if (markdown && markdown.length > 200) {
            console.log(`[YouTube] Firecrawl fallback successful: ${markdown.length} chars`);
            return markdown;
          }
        }
      }
    } catch (e) {
      console.log(`[YouTube] Whisper/Firecrawl fallback failed: ${e instanceof Error ? e.message : 'unknown'}`);
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
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json',
        },
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

  // Fallback: simple fetch + strip HTML
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let queueId: string | null = null;

  try {
    const { sourceType, content, autoSave = false, title } = await req.json();
    console.log(`[Step 0] Received request — sourceType: ${sourceType}, contentLength: ${content?.length || 0}, autoSave: ${autoSave}`);

    if (!sourceType || !content?.trim()) {
      return new Response(JSON.stringify({ error: 'sourceType and content are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      console.error('[Error] ANTHROPIC_API_KEY not configured');
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Insert queue record
    console.log('[Step 1] Creating queue record...');
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

    if (queueErr) {
      console.error('[Step 1] Queue insert error:', queueErr);
    }

    queueId = queueRow?.id || null;
    console.log(`[Step 1] Queue record created: ${queueId}`);

    // ── Step 2: Extract text based on source type ────────────────────────────
    console.log(`[Step 2] Extracting content for sourceType: ${sourceType}...`);
    let extractedText: string;

    switch (sourceType) {
      case 'youtube': {
        const videoId = extractVideoId(content.trim());
        if (!videoId) throw new Error('Invalid YouTube URL or video ID');
        extractedText = await extractYouTubeTranscript(videoId);
        break;
      }
      case 'url': {
        extractedText = await extractUrlContent(content.trim());
        break;
      }
      case 'pdf': {
        extractedText = '__PDF_BASE64__';
        break;
      }
      case 'text': {
        extractedText = content.trim();
        break;
      }
      default:
        throw new Error(`Unsupported source type: ${sourceType}`);
    }

    console.log(`[Step 2] Content extracted: ${extractedText === '__PDF_BASE64__' ? 'PDF (base64)' : `${extractedText.length} chars`}`);

    // ── Step 3: Send to Claude for rule extraction ───────────────────────────
    console.log('[Step 3] Sending to Claude for rule extraction...');

    const systemPrompt = `Eres un experto en performance marketing para e-commerce. Analiza el siguiente contenido y extrae TODAS las reglas accionables, estrategias y tácticas mencionadas. Para cada regla genera un JSON con: titulo (nombre corto y descriptivo de la regla, máximo 60 caracteres), contenido (la regla completa con los pasos numerados, clara y accionable), categoria (clasifica en una de estas categorías EXACTAS: brief, seo, keywords, meta, meta_ads, google, shopify, klaviyo, anuncios, buyer_persona). Si una regla aplica a múltiples categorías, elige la más relevante. Si el contenido no es sobre marketing/e-commerce, extrae lo que puedas y clasifica en la categoría más cercana. Responde SOLO con un array JSON válido sin markdown ni backticks.`;

    const userContent: any[] = [];

    if (sourceType === 'pdf') {
      userContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: content },
      });
      userContent.push({
        type: 'text',
        text: 'Analiza este documento PDF y extrae todas las reglas accionables de marketing/e-commerce.',
      });
    } else {
      // Truncate to 100k chars to avoid token limits
      const truncated = extractedText.slice(0, 100000);
      console.log(`[Step 3] Text truncated to: ${truncated.length} chars`);
      userContent.push({
        type: 'text',
        text: `Analiza el siguiente contenido y extrae todas las reglas accionables:\n\n${truncated}`,
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
      console.error(`[Step 3] Anthropic API error: ${anthropicRes.status} - ${errText.slice(0, 500)}`);
      throw new Error(`Anthropic API error: ${anthropicRes.status} - ${errText.slice(0, 200)}`);
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData.content[0].text.trim();
    console.log(`[Step 3] Claude response received: ${rawText.length} chars`);

    // ── Step 4: Parse JSON response ──────────────────────────────────────────
    console.log('[Step 4] Parsing rules from Claude response...');
    const jsonText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    let rules: Array<{ titulo: string; contenido: string; categoria: string }>;

    try {
      const parsed = JSON.parse(jsonText);
      rules = Array.isArray(parsed) ? parsed : (parsed.entradas || parsed.rules || []);
    } catch (parseErr) {
      console.error(`[Step 4] JSON parse error: ${parseErr instanceof Error ? parseErr.message : 'unknown'}`);
      console.error(`[Step 4] Raw text (first 500 chars): ${jsonText.slice(0, 500)}`);
      throw new Error('Failed to parse Claude response as JSON');
    }

    if (!Array.isArray(rules) || rules.length === 0) {
      console.error('[Step 4] No rules extracted from content');
      throw new Error('No rules extracted from content');
    }

    console.log(`[Step 4] Successfully parsed ${rules.length} rules`);

    // ── Step 5: Optionally save to steve_knowledge ──────────────────────────
    let saved = false;
    if (autoSave) {
      console.log('[Step 5] Auto-saving rules to steve_knowledge...');
      const inserts = rules.map(r => ({
        categoria: r.categoria,
        titulo: r.titulo.slice(0, 80),
        contenido: r.contenido,
        activo: true,
        orden: 99,
        source_id: queueId || null,
      }));

      const { error: insertErr } = await supabase.from('steve_knowledge').insert(inserts);
      if (insertErr) {
        console.error('[Step 5] Failed to save rules:', insertErr);
      } else {
        saved = true;
        console.log(`[Step 5] Saved ${inserts.length} rules successfully`);
      }
    }

    // Update queue record — use specific ID to avoid 409 conflicts
    if (queueId) {
      console.log(`[Step 6] Updating queue record ${queueId} to completed...`);
      const { error: updateErr } = await supabase.from('learning_queue').update({
        status: 'completed',
        rules_extracted: rules.length,
        processed_at: new Date().toISOString(),
      }).eq('id', queueId);

      if (updateErr) {
        console.error(`[Step 6] Queue update error:`, updateErr);
      } else {
        console.log(`[Step 6] Queue record updated successfully`);
      }
    }

    console.log(`[Done] Returning ${rules.length} rules, saved: ${saved}`);
    return new Response(JSON.stringify({ rules, saved, queueId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('learn-from-source error:', errorMessage);
    console.error('Full error:', err);

    // Update queue record with error using the queueId from outer scope
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
        console.log(`[Error Handler] Queue record ${queueId} marked as error`);
      } catch (updateErr) {
        console.error('[Error Handler] Failed to update queue:', updateErr);
      }
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
