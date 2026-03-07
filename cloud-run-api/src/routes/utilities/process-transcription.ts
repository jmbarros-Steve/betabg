import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const CHUNK_SIZE = 50000;
const SYSTEM_PROMPT = `Eres un experto en performance marketing para e-commerce. Analiza el siguiente contenido y extrae TODAS las reglas accionables, estrategias y tácticas mencionadas. Para cada regla genera un JSON con: titulo (nombre corto y descriptivo de la regla, máximo 60 caracteres), contenido (la regla completa con los pasos numerados, clara y accionable), categoria (clasifica en una de estas categorías EXACTAS: brief, seo, keywords, meta, meta_ads, google, shopify, klaviyo, anuncios, buyer_persona). Si una regla aplica a múltiples categorías, elige la más relevante. Responde SOLO con un array JSON válido sin markdown ni backticks.`;

function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

async function extractRulesFromChunk(
  text: string,
  chunkIndex: number,
  totalChunks: number,
  apiKey: string,
): Promise<Array<{ titulo: string; contenido: string; categoria: string }>> {
  const chunkLabel = totalChunks > 1
    ? `[Parte ${chunkIndex + 1} de ${totalChunks}] `
    : '';

  const truncationNote = text.length >= CHUNK_SIZE && chunkIndex === totalChunks - 1
    ? '\n\n[Transcripción truncada — se analizó hasta este punto del video]'
    : '';

  const userText = `${chunkLabel}Analiza el siguiente contenido y extrae todas las reglas accionables:\n\n${text}${truncationNote}`;

  console.log(`[Chunk ${chunkIndex + 1}/${totalChunks}] Sending ${text.length} chars to Claude...`);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userText }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[Chunk ${chunkIndex + 1}] Claude error: ${res.status} - ${errText.slice(0, 200)}`);
    throw new Error(`Anthropic API error on chunk ${chunkIndex + 1}: ${res.status}`);
  }

  const data: any = await res.json();
  const rawText = data.content[0].text.trim();
  const jsonText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(jsonText);
    const rules = Array.isArray(parsed) ? parsed : (parsed.entradas || parsed.rules || []);
    console.log(`[Chunk ${chunkIndex + 1}] Extracted ${rules.length} rules`);
    return rules;
  } catch {
    console.error(`[Chunk ${chunkIndex + 1}] JSON parse failed, raw: ${jsonText.slice(0, 300)}`);
    return [];
  }
}

export async function processTranscription(c: Context) {
  try {
  const { queueId } = await c.req.json();
  if (!queueId) {
    return c.json({ error: 'queueId is required' }, 400);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.error('[process-transcription] ANTHROPIC_API_KEY not configured');
    return c.json({ error: 'Error interno del servidor' }, 500);
  }

  const supabase = getSupabaseAdmin();

  const { data: item, error: fetchErr } = await supabase
    .from('learning_queue')
    .select('*')
    .eq('id', queueId)
    .single();

  if (fetchErr || !item) {
    console.error('[process-transcription] Queue item not found:', queueId, fetchErr?.message);
    return c.json({ error: 'Queue item not found' }, 404);
  }

  if (!item.transcription) {
    console.error('[process-transcription] No transcription found for queue item:', queueId);
    return c.json({ error: 'No transcription found for this queue item' }, 400);
  }

  await supabase.from('learning_queue').update({ status: 'processing' }).eq('id', queueId);

  const transcription = item.transcription as string;
  console.log(`[process-transcription] Processing ${transcription.length} chars for queue ${queueId}`);

  const chunks = splitIntoChunks(transcription, CHUNK_SIZE);
  console.log(`[process-transcription] Split into ${chunks.length} chunk(s)`);

  const allRules: Array<{ titulo: string; contenido: string; categoria: string }> = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      const chunkRules = await extractRulesFromChunk(chunks[i], i, chunks.length, ANTHROPIC_API_KEY);
      allRules.push(...chunkRules);
    } catch (err) {
      console.error(`[process-transcription] Chunk ${i + 1} failed:`, err);
    }

    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log(`[process-transcription] Total rules extracted: ${allRules.length}`);

  if (allRules.length === 0) {
    console.error('[process-transcription] No rules extracted from any chunk');
    return c.json({ error: 'No se pudieron extraer reglas del contenido.' }, 500);
  }

  // Deduplicate by titulo
  const seen = new Set<string>();
  const uniqueRules = allRules.filter(r => {
    const key = r.titulo.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[process-transcription] Unique rules after dedup: ${uniqueRules.length}`);

  const inserts = uniqueRules.map(r => ({
    categoria: r.categoria,
    titulo: r.titulo.slice(0, 80),
    contenido: r.contenido,
    activo: true,
    orden: 99,
    source_id: queueId,
  }));

  const { error: insertErr } = await supabase.from('steve_knowledge').insert(inserts);
  if (insertErr) {
    console.error('[process-transcription] Failed to save rules:', insertErr);
    return c.json({ error: 'Error guardando las reglas.' }, 500);
  }

  await supabase.from('learning_queue').update({
    status: 'completed',
    rules_extracted: uniqueRules.length,
    processed_at: new Date().toISOString(),
    transcription: null,
  }).eq('id', queueId);

  console.log(`[process-transcription] Done. ${uniqueRules.length} rules saved.`);

  return c.json({
    rules: uniqueRules,
    saved: true,
    queueId,
    chunksProcessed: chunks.length,
  });
  } catch (err: any) {
    console.error('[process-transcription]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
