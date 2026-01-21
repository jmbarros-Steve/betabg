import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CampaignData {
  campaign_id: string;
  campaign_name: string;
  platform: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  total_conversion_value: number;
  avg_ctr: number;
  avg_cpc: number;
  avg_cpm: number;
  avg_roas: number;
}

interface Recommendation {
  campaign_id: string;
  connection_id: string;
  platform: string;
  recommendation_type: string;
  recommendation_text: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// Industry benchmarks for e-commerce
const BENCHMARKS = {
  meta: {
    ctr: 0.9, // 0.9%
    cpc: 1.2, // $1.20
    cpm: 11.0, // $11
    roas: 3.0, // 3x
    conversion_rate: 2.5, // 2.5%
  },
  google: {
    ctr: 3.17, // 3.17%
    cpc: 2.69, // $2.69
    cpm: 3.12, // $3.12
    roas: 4.0, // 4x
    conversion_rate: 3.75, // 3.75%
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { connection_id, campaign_id } = await req.json();
    
    if (!connection_id) {
      return new Response(
        JSON.stringify({ error: 'Missing connection_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify ownership
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id, platform, client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch campaign metrics (last 30 days aggregated)
    let query = supabase
      .from('campaign_metrics')
      .select('*')
      .eq('connection_id', connection_id)
      .gte('metric_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id);
    }

    const { data: metricsData, error: metricsError } = await query;

    if (metricsError || !metricsData || metricsData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No campaign metrics found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Aggregate metrics by campaign
    const campaignMap = new Map<string, CampaignData>();
    
    for (const row of metricsData) {
      const key = row.campaign_id;
      const existing = campaignMap.get(key) || {
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        platform: row.platform,
        total_spend: 0,
        total_impressions: 0,
        total_clicks: 0,
        total_conversions: 0,
        total_conversion_value: 0,
        avg_ctr: 0,
        avg_cpc: 0,
        avg_cpm: 0,
        avg_roas: 0,
        days: 0,
      };

      existing.total_spend += Number(row.spend) || 0;
      existing.total_impressions += Number(row.impressions) || 0;
      existing.total_clicks += Number(row.clicks) || 0;
      existing.total_conversions += Number(row.conversions) || 0;
      existing.total_conversion_value += Number(row.conversion_value) || 0;
      (existing as any).days += 1;

      campaignMap.set(key, existing);
    }

    // Calculate averages
    for (const [key, campaign] of campaignMap) {
      campaign.avg_ctr = campaign.total_impressions > 0 
        ? (campaign.total_clicks / campaign.total_impressions) * 100 
        : 0;
      campaign.avg_cpc = campaign.total_clicks > 0 
        ? campaign.total_spend / campaign.total_clicks 
        : 0;
      campaign.avg_cpm = campaign.total_impressions > 0 
        ? (campaign.total_spend / campaign.total_impressions) * 1000 
        : 0;
      campaign.avg_roas = campaign.total_spend > 0 
        ? campaign.total_conversion_value / campaign.total_spend 
        : 0;
    }

    const campaigns = Array.from(campaignMap.values());
    const recommendations: Recommendation[] = [];

    // Generate rule-based recommendations first
    for (const campaign of campaigns) {
      const benchmark = BENCHMARKS[campaign.platform as keyof typeof BENCHMARKS] || BENCHMARKS.meta;
      
      // Low CTR
      if (campaign.avg_ctr < benchmark.ctr * 0.7 && campaign.total_impressions > 1000) {
        recommendations.push({
          campaign_id: campaign.campaign_id,
          connection_id,
          platform: campaign.platform,
          recommendation_type: 'low_ctr',
          recommendation_text: `El CTR de "${campaign.campaign_name}" es ${campaign.avg_ctr.toFixed(2)}%, muy por debajo del benchmark (${benchmark.ctr}%). Considera mejorar el creative o la segmentación.`,
          priority: campaign.avg_ctr < benchmark.ctr * 0.5 ? 'high' : 'medium',
        });
      }

      // High CPC
      if (campaign.avg_cpc > benchmark.cpc * 1.5 && campaign.total_clicks > 50) {
        recommendations.push({
          campaign_id: campaign.campaign_id,
          connection_id,
          platform: campaign.platform,
          recommendation_type: 'high_cpc',
          recommendation_text: `El CPC de "${campaign.campaign_name}" es $${campaign.avg_cpc.toFixed(2)}, ${((campaign.avg_cpc / benchmark.cpc - 1) * 100).toFixed(0)}% más alto que el benchmark. Revisa las keywords o audiencias.`,
          priority: campaign.avg_cpc > benchmark.cpc * 2 ? 'high' : 'medium',
        });
      }

      // Low ROAS
      if (campaign.avg_roas < 2 && campaign.total_spend > 100) {
        recommendations.push({
          campaign_id: campaign.campaign_id,
          connection_id,
          platform: campaign.platform,
          recommendation_type: 'low_roas',
          recommendation_text: `El ROAS de "${campaign.campaign_name}" es ${campaign.avg_roas.toFixed(2)}x, por debajo del breakeven. Considera pausar o reestructurar esta campaña.`,
          priority: campaign.avg_roas < 1 ? 'critical' : 'high',
        });
      }

      // High ROAS - opportunity to scale
      if (campaign.avg_roas > benchmark.roas * 1.5 && campaign.total_spend > 50) {
        recommendations.push({
          campaign_id: campaign.campaign_id,
          connection_id,
          platform: campaign.platform,
          recommendation_type: 'scale_opportunity',
          recommendation_text: `🚀 "${campaign.campaign_name}" tiene ROAS de ${campaign.avg_roas.toFixed(2)}x. Considera aumentar el presupuesto para escalar.`,
          priority: 'high',
        });
      }

      // High CPM
      if (campaign.avg_cpm > benchmark.cpm * 1.5 && campaign.total_impressions > 5000) {
        recommendations.push({
          campaign_id: campaign.campaign_id,
          connection_id,
          platform: campaign.platform,
          recommendation_type: 'high_cpm',
          recommendation_text: `El CPM de "${campaign.campaign_name}" es $${campaign.avg_cpm.toFixed(2)}, lo que indica audiencia saturada o muy competida. Prueba nuevas audiencias.`,
          priority: 'medium',
        });
      }

      // No conversions but spending
      if (campaign.total_conversions === 0 && campaign.total_spend > 100) {
        recommendations.push({
          campaign_id: campaign.campaign_id,
          connection_id,
          platform: campaign.platform,
          recommendation_type: 'no_conversions',
          recommendation_text: `⚠️ "${campaign.campaign_name}" ha gastado $${campaign.total_spend.toFixed(0)} sin conversiones. Revisa el tracking o pausa la campaña.`,
          priority: 'critical',
        });
      }
    }

  // Use AI for deeper analysis if API key available and we have significant data
  if (lovableApiKey && campaigns.length > 0) {
    try {
      // Fetch training data for context
      const { data: trainingExamples } = await supabase
        .from('steve_training_examples')
        .select('*')
        .eq('is_active', true)
        .limit(10);

      const { data: positiveFeedback } = await supabase
        .from('steve_training_feedback')
        .select('original_recommendation, improved_recommendation, feedback_notes')
        .eq('feedback_rating', 'positive')
        .limit(10);

      const { data: negativeFeedback } = await supabase
        .from('steve_training_feedback')
        .select('original_recommendation, improved_recommendation, feedback_notes')
        .eq('feedback_rating', 'negative')
        .not('improved_recommendation', 'is', null)
        .limit(10);

      const aiRecommendations = await getAIRecommendations(
        campaigns, 
        lovableApiKey,
        trainingExamples || [],
        positiveFeedback || [],
        negativeFeedback || []
      );
      recommendations.push(...aiRecommendations.map(r => ({
        ...r,
        connection_id,
      })));
    } catch (e) {
      console.error('AI recommendation error:', e);
    }
  }

    // Save recommendations (clear old ones first for these campaigns)
    if (recommendations.length > 0) {
      const campaignIds = [...new Set(recommendations.map(r => r.campaign_id))];
      
      // Delete old recommendations for these campaigns
      await supabase
        .from('campaign_recommendations')
        .delete()
        .eq('connection_id', connection_id)
        .in('campaign_id', campaignIds);

      // Insert new recommendations
      const { error: insertError } = await supabase
        .from('campaign_recommendations')
        .insert(recommendations);

      if (insertError) {
        console.error('Insert recommendations error:', insertError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        recommendations_count: recommendations.length,
        recommendations
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getAIRecommendations(
  campaigns: CampaignData[], 
  apiKey: string,
  trainingExamples: Array<{ scenario_description: string; correct_analysis: string; incorrect_analysis: string | null }>,
  positiveFeedback: Array<{ original_recommendation: string; improved_recommendation: string | null; feedback_notes: string | null }>,
  negativeFeedback: Array<{ original_recommendation: string; improved_recommendation: string | null; feedback_notes: string | null }>
): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];

  // Prepare campaign summary for AI
  const campaignSummary = campaigns.map(c => ({
    name: c.campaign_name,
    platform: c.platform,
    spend: c.total_spend.toFixed(2),
    impressions: c.total_impressions,
    clicks: c.total_clicks,
    conversions: c.total_conversions,
    revenue: c.total_conversion_value.toFixed(2),
    ctr: c.avg_ctr.toFixed(2),
    cpc: c.avg_cpc.toFixed(2),
    roas: c.avg_roas.toFixed(2),
  }));

  // Build training context
  let trainingContext = '';
  
  if (trainingExamples.length > 0) {
    trainingContext += '\n\nEJEMPLOS DE ANÁLISIS CORRECTOS:\n';
    for (const ex of trainingExamples.slice(0, 5)) {
      trainingContext += `- Escenario: ${ex.scenario_description}\n  Análisis correcto: ${ex.correct_analysis}\n`;
      if (ex.incorrect_analysis) {
        trainingContext += `  NO decir: ${ex.incorrect_analysis}\n`;
      }
    }
  }

  if (positiveFeedback.length > 0) {
    trainingContext += '\n\nRECOMENDACIONES QUE FUNCIONARON BIEN:\n';
    for (const fb of positiveFeedback.slice(0, 5)) {
      trainingContext += `- "${fb.original_recommendation}"${fb.feedback_notes ? ` (Nota: ${fb.feedback_notes})` : ''}\n`;
    }
  }

  if (negativeFeedback.length > 0) {
    trainingContext += '\n\nRECOMENDACIONES A MEJORAR (aprende de estos errores):\n';
    for (const fb of negativeFeedback.slice(0, 5)) {
      trainingContext += `- Original: "${fb.original_recommendation}"\n  Mejor versión: "${fb.improved_recommendation}"\n`;
    }
  }

  const prompt = `Analiza estas campañas publicitarias y da 1-2 recomendaciones estratégicas por campaña que tenga oportunidades de mejora. Enfócate en optimización de presupuesto, segmentación y creativos.
${trainingContext}

Campañas actuales a analizar:
${JSON.stringify(campaignSummary, null, 2)}

Responde SOLO con un JSON array con este formato:
[{"campaign_name": "...", "recommendation": "...", "priority": "low|medium|high"}]`;

  try {
    const response = await fetch('https://jnqivntlkemzcpomkvwv.supabase.co/functions/v1/ai-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Eres un experto en publicidad digital y optimización de campañas. Responde siempre en español.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error('AI API error:', await response.text());
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const aiRecs = JSON.parse(jsonMatch[0]);
      
      for (const rec of aiRecs) {
        const campaign = campaigns.find(c => c.campaign_name === rec.campaign_name);
        if (campaign) {
          recommendations.push({
            campaign_id: campaign.campaign_id,
            connection_id: '', // Will be filled by caller
            platform: campaign.platform,
            recommendation_type: 'ai_insight',
            recommendation_text: `💡 ${rec.recommendation}`,
            priority: rec.priority || 'medium',
          });
        }
      }
    }
  } catch (e) {
    console.error('AI parsing error:', e);
  }

  return recommendations;
}