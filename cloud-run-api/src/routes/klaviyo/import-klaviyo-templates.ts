import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function importKlaviyoTemplates(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'No authorization header' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { connectionId } = body;

    if (!connectionId) {
      return c.json({ error: 'connectionId required' }, 400);
    }

    // Verify connection ownership
    const { data: conn } = await supabase
      .from('platform_connections')
      .select('api_key_encrypted, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'klaviyo')
      .single();

    if (!conn?.api_key_encrypted) {
      return c.json({ error: 'No Klaviyo connection found' }, 404);
    }

    const clientData = (conn as any).clients as { user_id: string; client_user_id: string | null };
    if (clientData.user_id !== user!.id && clientData.client_user_id !== user!.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const { data: decryptedKey } = await supabase.rpc('decrypt_platform_token', {
      encrypted_token: conn.api_key_encrypted
    });

    const apiKey = decryptedKey as string;
    const headers = {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'accept': 'application/json',
      'revision': '2024-10-15',
    };

    // PASO 1: Paginar TODAS las plantillas (Klaviyo devuelve viejas primero)
    let allTemplates: any[] = [];
    let nextUrl: string | null = 'https://a.klaviyo.com/api/templates/';
    let pageCount = 0;

    while (nextUrl) {
      const resp = await fetch(nextUrl, { headers });
      if (!resp.ok) {
        const errText = await resp.text();
        console.log(`Templates page error: ${resp.status}`, errText);
        break;
      }

      const data: any = await resp.json();
      const pageTemplates = data.data || [];
      allTemplates = [...allTemplates, ...pageTemplates];
      pageCount++;

      console.log(`Page ${pageCount}: ${pageTemplates.length} templates (total: ${allTemplates.length})`);

      nextUrl = data.links?.next || null;
      if (nextUrl) await new Promise(r => setTimeout(r, 300));
    }

    console.log(`Total templates in Klaviyo: ${allTemplates.length}`);

    // PASO 2: Ordenar por fecha (updated o created) descendente y tomar top 10
    const sorted = allTemplates.sort((a: any, b: any) => {
      const dateA = new Date(a.attributes?.updated || a.attributes?.created || '1970-01-01').getTime();
      const dateB = new Date(b.attributes?.updated || b.attributes?.created || '1970-01-01').getTime();
      return dateB - dateA;
    });
    const top10 = sorted.slice(0, 10);

    console.log('Top 10 (most recent by date):');
    top10.forEach((t: any) => console.log(`  "${t.attributes?.name}" - created: ${t.attributes?.created} - updated: ${t.attributes?.updated}`));

    // PASO 3: Traer HTML de cada una
    const templates = [];
    for (const t of top10) {
      try {
        const detailResp = await fetch(`https://a.klaviyo.com/api/templates/${t.id}/`, { headers });
        if (detailResp.ok) {
          const detail: any = await detailResp.json();
          const html = detail.data?.attributes?.html || '';
          const colorMatches = html.match(/#[0-9a-fA-F]{6}/g) || [];
          const uniqueColors = [...new Set(colorMatches)].slice(0, 10);

          templates.push({
            id: t.id,
            name: detail.data?.attributes?.name || t.attributes?.name || 'Sin nombre',
            html,
            text: detail.data?.attributes?.text || '',
            hasHtml: html.length > 0,
            htmlLength: html.length,
            created: t.attributes?.created,
            updated: t.attributes?.updated,
            extractedColors: uniqueColors,
          });
          console.log(`"${t.attributes?.name}": ${html.length} chars`);
        } else {
          const errText = await detailResp.text();
          console.log(`Template ${t.id} detail error: ${detailResp.status}`, errText);
        }
      } catch (e: any) {
        console.log(`Error fetching template ${t.id}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 300));
    }

    return c.json({
      templates,
      total_in_klaviyo: allTemplates.length,
      showing: templates.length,
    });

  } catch (error: any) {
    console.error('Import Klaviyo templates error:', error);
    return c.json({ error: error.message }, 500);
  }
}
