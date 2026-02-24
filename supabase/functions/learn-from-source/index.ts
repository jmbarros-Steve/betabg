import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { sourceType, content, title, queueId } = await req.json();

    if (!sourceType || !content?.trim()) {
      return new Response(JSON.stringify({ error: 'sourceType and content are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Duplicate check ──
    if (!queueId) {
      const { data: existing } = await supabase
        .from('learning_queue')
        .select('id, status')
        .eq('source_content', content.trim())
        .in('status', ['pending', 'processing'])
        .limit(1);

      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ status: 'duplicate', queueId: existing[0].id, message: 'Este contenido ya está en la cola' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    let resolvedQueueId = queueId as string | undefined;

    if (resolvedQueueId) {
      const { error: updateErr } = await supabase
        .from('learning_queue')
        .update({
          source_type: sourceType,
          source_content: content.slice(0, 2000),
          source_title: title || null,
          status: 'processing',
          error_message: null,
          processed_at: null,
          rules_extracted: null,
        })
        .eq('id', resolvedQueueId);

      if (updateErr) throw new Error(`Failed to update queue item: ${updateErr.message}`);
    } else {
      const { data: queueRow, error: insertErr } = await supabase
        .from('learning_queue')
        .insert({
          source_type: sourceType,
          source_content: content.slice(0, 2000),
          source_title: title || null,
          status: 'pending',
        })
        .select('id')
        .single();

      if (insertErr || !queueRow?.id) {
        throw new Error(`Failed to create queue item: ${insertErr?.message || 'unknown error'}`);
      }

      resolvedQueueId = queueRow.id;

      const { error: statusErr } = await supabase
        .from('learning_queue')
        .update({ status: 'processing' })
        .eq('id', resolvedQueueId);

      if (statusErr) throw new Error(`Failed to set queue item processing: ${statusErr.message}`);
    }

    return new Response(JSON.stringify({ status: 'processing', queueId: resolvedQueueId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
