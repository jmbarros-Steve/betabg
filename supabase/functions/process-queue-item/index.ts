import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CHUNK_SIZE = 50000;
const SYSTEM_PROMPT = `Eres un experto en performance marketing para e-commerce. Analiza el siguiente contenido y extrae TODAS las reglas accionables, estrategias y tácticas mencionadas. Para cada regla genera un JSON con: titulo (nombre corto y descriptivo de la regla, máximo 60 caracteres), contenido (la regla completa con los pasos numerados, clara y accionable), categoria (clasifica en una de estas categorías EXACTAS: brief, seo, keywords, meta, meta_ads, google, shopify, klaviyo, anuncios, buyer_persona). Si una regla aplica a múltiples categorías, elige la más relevante. Responde SOLO con un array JSON válido sin markdown ni backticks.`;

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
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (res.ok) {
      const html = await res.text();
      const captionMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])/);
      if (captionMatch) {
        let captionTracks: Array<{ baseUrl: string; languageCode: string }> = [];
        try {
          captionTracks = JSON.parse(captionMatch[1]);
        } catch {}

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
                .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n/g, ' ').trim(),
              )
              .filter(Boolean);
            if (texts.length > 0) return texts.join(' ');
          }
        }
      }
    }
  } catch {}

  const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN');
  if (APIFY_TOKEN) {
    const apifyRes = await fetch(
      `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url: `https://www.youtube.com/watch?v=${videoId}` }],
          maxCrawlPages: 1,
          outputFormats: ['markdown'],
        }),
      }
    );

    if (apifyRes.ok) {
      const items = await apifyRes.json();
      const markdown = items?.[0]?.text || items?.[0]?.markdown || '';
      if (markdown && markdown.length > 200) return markdown;
    }
  }

  throw new Error('No se pudo extraer transcripción del video');
}

async function extractUrlContent(url: string): Promise<string> {
  const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN');
  if (APIFY_TOKEN) {
    const apifyRes = await fetch(
      `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url }],
          maxCrawlPages: 1,
          outputFormats: ['markdown'],
        }),
      }
    );

    if (apifyRes.ok) {
      const items = await apifyRes.json();
      const markdown = items?.[0]?.text || items?.[0]?.markdown || '';
      if (markdown && markdown.length > 100) return markdown;
    }
  }

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);

  const html = await res.text();
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50000);
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

async function extractRulesFromChunk(text: string, apiKey: string): Promise<Array<{ titulo: string; contenido: string; categoria: string }>> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Analiza el siguiente contenido y extrae todas las reglas accionables:\n\n${text}` }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error: ${res.status} - ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const rawText = data.content?.[0]?.text?.trim() || '[]';
  const jsonText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(jsonText);
  return Array.isArray(parsed) ? parsed : (parsed.entradas || parsed.rules || []);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let queueId: string | null = null;

  try {
    const { queueId: inputQueueId } = await req.json();
    if (!inputQueueId) {
      return new Response(JSON.stringify({ error: 'queueId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    queueId = inputQueueId;

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: item, error: fetchErr } = await supabase
      .from('learning_queue')
      .select('*')
      .eq('id', queueId)
      .single();

    if (fetchErr || !item) throw new Error('Queue item not found');

    await supabase.from('learning_queue').update({ status: 'processing', error_message: null }).eq('id', queueId);

    let extractedText = '';
    switch (item.source_type) {
      case 'youtube': {
        const videoId = extractVideoId(item.source_content);
        if (!videoId) throw new Error('Invalid YouTube URL or video ID');
        extractedText = await extractYouTubeTranscript(videoId);
        break;
      }
      case 'url':
        extractedText = await extractUrlContent(item.source_content);
        break;
      case 'pdf':
      case 'document':
      case 'text':
        extractedText = item.source_content;
        break;
      default:
        throw new Error(`Unsupported source type: ${item.source_type}`);
    }

    if (!extractedText?.trim()) throw new Error('No se pudo extraer contenido de la fuente');

    const chunks = splitIntoChunks(extractedText, CHUNK_SIZE);
    const allRules: Array<{ titulo: string; contenido: string; categoria: string }> = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkRules = await extractRulesFromChunk(chunks[i], ANTHROPIC_API_KEY);
      allRules.push(...chunkRules);
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 1200));
    }

    if (allRules.length === 0) throw new Error('No rules extracted from content');

    // ── Deduplicate within extracted rules (normalize: lowercase, no accents) ──
    const normalize = (s: string) =>
      (s || '').toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const seen = new Set<string>();
    const uniqueRules = allRules.filter(r => {
      const key = `${normalize(r.titulo)}::${normalize(r.categoria)}`;
      if (!r.titulo || !r.contenido || !r.categoria || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ── Deduplicate against existing steve_knowledge ──
    const { data: existingRules } = await supabase
      .from('steve_knowledge')
      .select('titulo');

    const existingTitles = new Set(
      (existingRules || []).map((r: { titulo: string }) => normalize(r.titulo))
    );

    const newRules = uniqueRules.filter(r => !existingTitles.has(normalize(r.titulo)));

    if (newRules.length === 0) {
      await supabase.from('learning_queue').update({
        status: 'completed',
        rules_extracted: 0,
        processed_at: new Date().toISOString(),
        error_message: 'Todas las reglas extraídas ya existían en la base de conocimiento',
      }).eq('id', queueId);

      return new Response(JSON.stringify({ status: 'completed', queueId, rulesSaved: 0, skippedDuplicates: uniqueRules.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const inserts = newRules.map(r => ({
      categoria: r.categoria,
      titulo: r.titulo.slice(0, 80),
      contenido: r.contenido,
      activo: true,
      orden: 99,
      source_id: queueId,
    }));

    const { error: insertErr } = await supabase.from('steve_knowledge').insert(inserts);
    if (insertErr) throw new Error(`Failed to save rules: ${insertErr.message}`);

    await supabase.from('learning_queue').update({
      status: 'completed',
      rules_extracted: inserts.length,
      processed_at: new Date().toISOString(),
      transcription: null,
      error_message: null,
    }).eq('id', queueId);

    return new Response(JSON.stringify({ status: 'completed', queueId, rulesSaved: inserts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

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

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
