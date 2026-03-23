import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { query, categoryId } = await req.json();

    // If categoryId provided, get category details + attributes
    if (categoryId) {
      const [catRes, attrRes] = await Promise.all([
        fetch(`https://api.mercadolibre.com/categories/${categoryId}`),
        fetch(`https://api.mercadolibre.com/categories/${categoryId}/attributes`),
      ]);

      const category = catRes.ok ? await catRes.json() : null;
      const attributes = attrRes.ok ? await attrRes.json() : [];

      return new Response(
        JSON.stringify({
          category: category ? {
            id: category.id,
            name: category.name,
            path: (category.path_from_root || []).map((p: any) => p.name).join(' > '),
            pathFromRoot: category.path_from_root || [],
          } : null,
          attributes: (attributes || []).map((attr: any) => ({
            id: attr.id,
            name: attr.name,
            required: attr.tags?.required || false,
            type: attr.value_type,
            values: (attr.values || []).slice(0, 100).map((v: any) => ({
              id: v.id,
              name: v.name,
            })),
            allowedUnits: attr.allowed_units || null,
            tooltip: attr.tooltip,
          })),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search categories by keyword
    if (!query) {
      return new Response(JSON.stringify({ error: 'query or categoryId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const searchRes = await fetch(
      `https://api.mercadolibre.com/sites/MLC/domain_discovery/search?q=${encodeURIComponent(query)}`
    );

    if (!searchRes.ok) {
      // Fallback to category predictor
      const predictRes = await fetch(
        `https://api.mercadolibre.com/sites/MLC/category_predictor/predict?title=${encodeURIComponent(query)}`
      );
      if (predictRes.ok) {
        const predicted = await predictRes.json();
        if (predicted.id) {
          const catDetailRes = await fetch(`https://api.mercadolibre.com/categories/${predicted.id}`);
          const catDetail = catDetailRes.ok ? await catDetailRes.json() : null;
          return new Response(
            JSON.stringify({
              categories: [{
                id: predicted.id,
                name: predicted.name,
                domain: null,
                path: catDetail ? (catDetail.path_from_root || []).map((p: any) => p.name).join(' > ') : '',
              }],
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      return new Response(JSON.stringify({ categories: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const domains = await searchRes.json();

    // Get category IDs from domains
    const categories: any[] = [];
    for (const domain of (domains || []).slice(0, 10)) {
      if (domain.category_id) {
        categories.push({
          id: domain.category_id,
          name: domain.category_name,
          domain: domain.domain_name,
          path: '',
        });
      }
    }

    return new Response(
      JSON.stringify({ categories }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[ml-search-categories] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
