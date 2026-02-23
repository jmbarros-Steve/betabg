import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractVideoId(input: string): string | null {
  // Accepts full URLs or plain video IDs
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
  // Fetch the YouTube page and extract caption track URL from embedded JSON
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`Failed to fetch YouTube page: ${res.status}`);

  const html = await res.text();

  // Find captionTracks in the page JSON
  const captionMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])/);
  if (!captionMatch) {
    throw new Error('No captions found for this video. Try uploading the transcript as text instead.');
  }

  let captionTracks: Array<{ baseUrl: string; languageCode: string; name?: { simpleText?: string } }>;
  try {
    captionTracks = JSON.parse(captionMatch[1]);
  } catch {
    throw new Error('Failed to parse caption tracks from YouTube page.');
  }

  if (!captionTracks.length) {
    throw new Error('No caption tracks available for this video.');
  }

  // Prefer Spanish, then English, then first available
  const preferred = captionTracks.find(t => t.languageCode === 'es')
    || captionTracks.find(t => t.languageCode === 'en')
    || captionTracks[0];

  // Fetch the XML transcript
  const captionRes = await fetch(preferred.baseUrl);
  if (!captionRes.ok) throw new Error(`Failed to fetch captions: ${captionRes.status}`);

  const xml = await captionRes.text();

  // Extract text from <text> elements, decode HTML entities
  const texts = [...xml.matchAll(/<text[^>]*>(.*?)<\/text>/gs)]
    .map(m => m[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, ' ')
      .trim()
    )
    .filter(Boolean);

  if (!texts.length) throw new Error('Transcript is empty.');

  return texts.join(' ');
}

async function extractUrlContent(url: string): Promise<string> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');

  if (FIRECRAWL_API_KEY) {
    // Use Firecrawl for better extraction
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
      if (markdown && markdown.length > 100) return markdown;
    }
  }

  // Fallback: simple fetch + strip HTML
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteveBot/1.0)' },
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);

  const html = await res.text();
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50000);
}

// ── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { sourceType, content, autoSave = false, title } = await req.json();

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

    // Insert queue record
    const { data: queueRow, error: queueErr } = await supabase
      .from('learning_queue')
      .insert({
        source_type: sourceType,
        source_content: content.slice(0, 2000), // truncate for storage
        source_title: title || null,
        status: 'processing',
      })
      .select('id')
      .single();

    const queueId = queueRow?.id;

    // ── Step 1: Extract text based on source type ────────────────────────────
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
        // For PDF, send base64 content directly to Claude as a document
        // We'll handle this specially in the Claude call below
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

    // ── Step 2: Send to Claude for rule extraction ───────────────────────────
    const systemPrompt = `Eres un experto en performance marketing para e-commerce. Analiza el siguiente contenido y extrae TODAS las reglas accionables, estrategias y tácticas mencionadas. Para cada regla genera un JSON con: titulo (nombre corto y descriptivo de la regla, máximo 60 caracteres), contenido (la regla completa con los pasos numerados, clara y accionable), categoria (clasifica en una de estas categorías EXACTAS: brief, seo, keywords, meta, meta_ads, google, shopify, klaviyo, anuncios, buyer_persona). Si una regla aplica a múltiples categorías, elige la más relevante. Si el contenido no es sobre marketing/e-commerce, extrae lo que puedas y clasifica en la categoría más cercana. Responde SOLO con un array JSON válido sin markdown ni backticks.`;

    // Build messages array
    const userContent: any[] = [];

    if (sourceType === 'pdf') {
      // Send PDF as document to Claude
      userContent.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: content,
        },
      });
      userContent.push({
        type: 'text',
        text: 'Analiza este documento PDF y extrae todas las reglas accionables de marketing/e-commerce.',
      });
    } else {
      // Truncate to avoid token limits
      const truncated = extractedText.slice(0, 40000);
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
      throw new Error(`Anthropic API error: ${anthropicRes.status} - ${errText}`);
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData.content[0].text.trim();

    // Parse JSON response — strip markdown fences if present
    const jsonText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    let rules: Array<{ titulo: string; contenido: string; categoria: string }>;

    try {
      const parsed = JSON.parse(jsonText);
      // Handle both array and { entradas: [...] } formats
      rules = Array.isArray(parsed) ? parsed : (parsed.entradas || parsed.rules || []);
    } catch {
      throw new Error('Failed to parse Claude response as JSON');
    }

    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error('No rules extracted from content');
    }

    // ── Step 3: Optionally save to steve_knowledge ──────────────────────────
    let saved = false;
    if (autoSave) {
      const inserts = rules.map(r => ({
        categoria: r.categoria,
        titulo: r.titulo.slice(0, 80),
        contenido: r.contenido,
        activo: true,
        orden: 99,
      }));

      const { error: insertErr } = await supabase.from('steve_knowledge').insert(inserts);
      if (insertErr) {
        console.error('Failed to save rules:', insertErr);
      } else {
        saved = true;
      }
    }

    // Update queue record
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
    console.error('learn-from-source error:', err);

    // Try to update queue record with error
    try {
      const { sourceType, content } = await req.clone().json().catch(() => ({}));
      if (sourceType) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        // Best effort — update latest pending record
        await supabase.from('learning_queue')
          .update({
            status: 'error',
            error_message: err instanceof Error ? err.message : 'Unknown error',
            processed_at: new Date().toISOString(),
          })
          .eq('status', 'processing')
          .order('created_at', { ascending: false })
          .limit(1);
      }
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
