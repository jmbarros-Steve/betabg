import { callApi } from '@/lib/api';
import type {
  ReportData,
  AIInsight,
  StrategySection,
  BundleRecommendation,
  CampaignPlan,
  EmailFlowPlan,
  Projection,
} from './report-types';

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CL')}`;
}

/**
 * Generate rule-based insights from report data.
 * Mirrors SmartInsightsPanel logic — instant, no API cost.
 */
function generateRuleBasedInsights(data: ReportData): AIInsight[] {
  const insights: AIInsight[] = [];
  const { kpi, profitLoss, shopify } = data;
  const marginRate = profitLoss.grossProfit / (profitLoss.netRevenue || 1);
  const breakEvenRoas = marginRate > 0 ? 1 / marginRate : 3.33;

  // 1. Profitability
  if (kpi.revenue > 0 && kpi.adSpend > 0 && breakEvenRoas > 0) {
    if (kpi.roas >= breakEvenRoas) {
      const margin = ((kpi.roas - breakEvenRoas) / breakEvenRoas * 100).toFixed(0);
      insights.push({
        title: 'Operacion rentable',
        message: `Tu ROAS (${kpi.roas.toFixed(1)}x) esta ${margin}% sobre tu punto de equilibrio (${breakEvenRoas.toFixed(1)}x). Estas ganando dinero con tu publicidad.`,
        action: 'Puedes considerar aumentar tu inversion publicitaria gradualmente para escalar.',
      });
    } else {
      insights.push({
        title: 'Publicidad bajo el punto de equilibrio',
        message: `Tu ROAS (${kpi.roas.toFixed(1)}x) esta por debajo del minimo necesario (${breakEvenRoas.toFixed(1)}x). Estas perdiendo dinero por cada peso invertido en ads.`,
        action: 'Revisa tus campanas: pausa las de bajo rendimiento y concentra presupuesto en las que mejor convierten.',
      });
    }
  }

  // 2. Abandoned carts
  if (shopify.abandonedCartsCount > 0) {
    const recoverable = Math.round(shopify.abandonedCartsValue * 0.12);
    if (recoverable > 0) {
      insights.push({
        title: `${shopify.abandonedCartsCount} carritos abandonados`,
        message: `Hay ${fmt(shopify.abandonedCartsValue)} en carritos sin recuperar. Con una tasa de recuperacion del 12%, podrias rescatar aproximadamente ${fmt(recoverable)}.`,
        action: 'Configura un flow automatico en Klaviyo para recuperar carritos. Los primeros 30 minutos son clave.',
      });
    }
  }

  // 3. AOV optimization
  if (kpi.aov > 0 && kpi.orders >= 5) {
    const targetAov = Math.ceil(kpi.aov * 1.15 / 1000) * 1000;
    const additionalRevenue = (targetAov - kpi.aov) * kpi.orders;
    insights.push({
      title: `Ticket promedio: ${fmt(kpi.aov)}`,
      message: `Si logras subir tu ticket promedio a ${fmt(targetAov)} (+15%), ganarias ${fmt(additionalRevenue)} adicionales con las mismas ventas.`,
      action: 'Prueba ofertas tipo "envio gratis sobre X", bundles de productos, o upsells en el checkout.',
    });
  }

  // 4. Revenue trend
  if (kpi.revenueChange !== undefined) {
    if (kpi.revenueChange > 10) {
      insights.push({
        title: `Ingresos creciendo ${kpi.revenueChange.toFixed(0)}%`,
        message: `Los ingresos subieron ${kpi.revenueChange.toFixed(0)}% respecto al periodo anterior. Buen trabajo.`,
        action: 'Mantener la estrategia actual y buscar oportunidades para escalar.',
      });
    } else if (kpi.revenueChange < -10) {
      insights.push({
        title: `Ingresos cayeron ${Math.abs(kpi.revenueChange).toFixed(0)}%`,
        message: `Los ingresos bajaron ${Math.abs(kpi.revenueChange).toFixed(0)}% vs el periodo anterior.`,
        action: 'Revisa si hubo cambios en campanas, stock, o competencia.',
      });
    }
  }

  // 5. Repeat customers
  if (shopify.customerMetrics) {
    const rate = shopify.customerMetrics.repeatCustomerRate;
    if (rate < 15) {
      insights.push({
        title: `Solo ${rate.toFixed(0)}% de clientes repiten`,
        message: 'Un negocio sano tiene al menos 20-30% de clientes recurrentes.',
        action: 'Implementa email post-compra, programa de fidelizacion, o descuento para segunda compra.',
      });
    } else if (rate >= 25) {
      insights.push({
        title: `${rate.toFixed(0)}% de clientes recurrentes`,
        message: 'Excelente retencion. Tus clientes confian en tu marca y vuelven a comprar.',
        action: 'Aprovecha la lealtad con programas de referidos para adquirir nuevos clientes a menor costo.',
      });
    }
  }

  // 6. Conversion rate
  if (shopify.customerMetrics?.conversionRate && shopify.customerMetrics.conversionRate < 1.5) {
    insights.push({
      title: `Conversion baja: ${shopify.customerMetrics.conversionRate.toFixed(1)}%`,
      message: 'El promedio en ecommerce es 2-3%. Muchos visitantes llegan pero no compran.',
      action: 'Revisa velocidad de carga, claridad de precios, opciones de pago, y fotos de productos.',
    });
  }

  // 7. Net profit margin
  if (kpi.revenue > 0 && profitLoss.netProfitMargin < 5 && profitLoss.netProfitMargin > 0) {
    insights.push({
      title: `Margen neto muy ajustado: ${profitLoss.netProfitMargin.toFixed(1)}%`,
      message: 'Estas ganando dinero, pero por muy poco. Cualquier variacion en costos podria dejarte en negativo.',
      action: 'Revisa tus costos fijos, negocia mejores precios con proveedores, o evalua subir precios.',
    });
  }

  // Sort by importance (first items are most critical)
  return insights.slice(0, 5);
}

// ── Strategy Generation (rule-based) ─────────────────────────

function generateBundles(data: ReportData): BundleRecommendation[] {
  const bundles: BundleRecommendation[] = [];
  const topSkus = data.shopify.topSkus;
  const aov = data.kpi.aov;

  // Bundle Estrella: top 2 SKUs por revenue, precio -10%
  if (topSkus.length >= 2) {
    const top2 = topSkus.slice(0, 2);
    const combinedPrice = top2.reduce((s, sk) => s + (sk.revenue / Math.max(sk.quantity, 1)), 0);
    const discountedPrice = Math.round(combinedPrice * 0.9);
    bundles.push({
      name: 'Bundle Estrella',
      products: top2.map(sk => sk.title),
      suggestedPrice: fmt(discountedPrice),
      reason: `Combina tus 2 best-sellers con 10% de descuento. Impulsa venta cruzada entre clientes que ya compran uno de los dos.`,
      type: 'star',
    });
  }

  // Bundle Sube Ticket: si AOV < $40.000, combinar popular + complementario
  if (aov > 0 && aov < 40000 && topSkus.length >= 3) {
    const freeShippingThreshold = 40000;
    const mainProduct = topSkus[0];
    const complement = topSkus[2]; // 3rd product as complementary
    const mainUnitPrice = mainProduct.revenue / Math.max(mainProduct.quantity, 1);
    const compUnitPrice = complement.revenue / Math.max(complement.quantity, 1);
    const bundlePrice = Math.round((mainUnitPrice + compUnitPrice) * 0.95);
    bundles.push({
      name: 'Bundle Sube Ticket',
      products: [mainProduct.title, complement.title],
      suggestedPrice: fmt(Math.max(bundlePrice, freeShippingThreshold)),
      reason: `Tu ticket promedio (${fmt(aov)}) esta bajo el umbral de envio gratis. Este bundle lleva al cliente sobre ${fmt(freeShippingThreshold)}.`,
      type: 'aov',
    });
  }

  // Bundle Recuperacion: si hay carritos abandonados
  if (data.shopify.abandonedCartsCount > 5 && topSkus.length >= 2) {
    const top2 = topSkus.slice(0, 2);
    const combinedPrice = top2.reduce((s, sk) => s + (sk.revenue / Math.max(sk.quantity, 1)), 0);
    const discountedPrice = Math.round(combinedPrice * 0.85);
    bundles.push({
      name: 'Bundle Recuperacion',
      products: top2.map(sk => sk.title),
      suggestedPrice: fmt(discountedPrice),
      reason: `${data.shopify.abandonedCartsCount} carritos abandonados. Ofrece 15% off en bundle para recuperar ventas perdidas.`,
      type: 'recovery',
    });
  }

  return bundles;
}

function generateMetaCampaigns(data: ReportData): CampaignPlan[] {
  const campaigns: CampaignPlan[] = [];
  const metaPlatform = data.adPlatforms.find(p => p.platform === 'meta');
  const monthlySpend = data.profitLoss.metaSpend || metaPlatform?.totalSpend || 0;
  const marginRate = data.profitLoss.grossProfit / (data.profitLoss.netRevenue || 1);
  const breakEvenRoas = marginRate > 0 ? 1 / marginRate : 3.33;

  if (!metaPlatform || metaPlatform.campaigns.length === 0) {
    // Sin campanas Meta
    campaigns.push({
      name: 'Campana Conversiones — Lookalike Compradores',
      objective: 'Conversiones (Compras)',
      audience: 'Lookalike 1-3% de compradores ultimos 180 dias',
      budgetSuggestion: monthlySpend > 0 ? fmt(Math.round(monthlySpend * 0.4)) + '/mes' : '$150.000/mes minimo',
      rationale: 'Sin campanas activas. Empieza con conversion optimizada hacia compradores similares a los actuales.',
    });
  } else {
    // Con campanas activas
    if (metaPlatform.avgRoas >= breakEvenRoas) {
      campaigns.push({
        name: 'Scaling — Advantage+ Shopping',
        objective: 'Ventas (Advantage+ Shopping)',
        audience: 'Broad / Automatico por Meta AI',
        budgetSuggestion: fmt(Math.round(monthlySpend * 1.25)) + '/mes (+25%)',
        rationale: `ROAS ${metaPlatform.avgRoas.toFixed(1)}x esta sobre break-even (${breakEvenRoas.toFixed(1)}x). Puedes escalar con confianza.`,
      });
    }

    if (metaPlatform.avgCtr < 0.9) {
      campaigns.push({
        name: 'Testing A/B de Creativos',
        objective: 'Trafico / Conversiones',
        audience: 'Misma audiencia que mejor campana actual',
        budgetSuggestion: fmt(Math.round(monthlySpend * 0.15)) + '/mes',
        rationale: `CTR de ${metaPlatform.avgCtr.toFixed(2)}% esta bajo. Testea 3-5 variaciones de creativos para encontrar ganadores.`,
      });
    }

    // Check for retargeting campaigns
    const hasRetargeting = metaPlatform.campaigns.some(c =>
      /retarget|remarketing|remarket|dpa|dinamico/i.test(c.campaign_name)
    );
    if (!hasRetargeting) {
      campaigns.push({
        name: 'Remarketing Dinamico',
        objective: 'Ventas (Catalogo)',
        audience: 'Visitantes web 7-30 dias que no compraron',
        budgetSuggestion: fmt(Math.round(monthlySpend * 0.2)) + '/mes',
        rationale: 'No tienes retargeting activo. Remarketing dinamico recupera visitantes con los productos que vieron.',
      });
    }
  }

  // Siempre recomendar Social Proof
  campaigns.push({
    name: 'Social Proof / UGC',
    objective: 'Conversiones',
    audience: 'Lookalike 2-5% de compradores + intereses afines',
    budgetSuggestion: fmt(Math.round(Math.max(monthlySpend * 0.1, 50000))) + '/mes',
    rationale: 'Campana con testimonios reales y UGC genera confianza y baja el CPA en cold audiences.',
  });

  return campaigns;
}

function generateGoogleCampaigns(data: ReportData): CampaignPlan[] {
  const campaigns: CampaignPlan[] = [];
  const googlePlatform = data.adPlatforms.find(p => p.platform === 'google');
  const monthlySpend = data.profitLoss.googleSpend + data.profitLoss.manualGoogleSpend || googlePlatform?.totalSpend || 0;

  // Extract keywords from top product names
  const topProducts = data.shopify.topSkus.slice(0, 5);
  const keywords = topProducts
    .map(p => p.title.split(/[\s\-–|,]+/).filter(w => w.length > 3))
    .flat()
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, 8);

  if (!googlePlatform || googlePlatform.campaigns.length === 0) {
    campaigns.push({
      name: 'Performance Max — Catalogo Shopify',
      objective: 'Ventas online (Shopping + Search + Display + YouTube)',
      audience: 'Automatico por Google AI + feed de productos Shopify',
      budgetSuggestion: monthlySpend > 0 ? fmt(Math.round(monthlySpend * 0.6)) + '/mes' : '$100.000/mes minimo',
      rationale: 'Sin campanas Google activas. PMax con feed de productos es la forma mas eficiente de empezar.',
    });
  } else {
    campaigns.push({
      name: 'Search de Marca + Shopping Inteligente',
      objective: 'Ventas (Search + Shopping)',
      audience: `Busquedas de marca + terminos transaccionales`,
      budgetSuggestion: fmt(Math.round(monthlySpend * 0.5)) + '/mes',
      rationale: 'Protege tu marca en search y captura demanda existente con Shopping inteligente.',
    });
  }

  // Siempre Remarketing Display
  campaigns.push({
    name: 'Remarketing Display',
    objective: 'Conversion (Display remarketing)',
    audience: 'Visitantes web sin compra (7-30 dias)',
    budgetSuggestion: fmt(Math.round(Math.max(monthlySpend * 0.15, 30000))) + '/mes',
    rationale: 'Muestra banners a quienes visitaron tu tienda pero no compraron. CPA bajo y alta conversion.',
  });

  // Add keyword suggestion campaign if we have keywords
  if (keywords.length >= 3) {
    campaigns.push({
      name: 'Search — Keywords de Producto',
      objective: 'Ventas (Search)',
      audience: `Keywords sugeridas: ${keywords.slice(0, 5).join(', ')}`,
      budgetSuggestion: fmt(Math.round(Math.max(monthlySpend * 0.25, 50000))) + '/mes',
      rationale: `Captura demanda de personas buscando tus productos estrella directamente en Google.`,
    });
  }

  return campaigns;
}

function generateEmailFlows(data: ReportData): EmailFlowPlan[] {
  const flows: EmailFlowPlan[] = [];
  const repeatRate = data.shopify.customerMetrics?.repeatCustomerRate ?? 0;
  const aov = data.kpi.aov;

  // Carritos abandonados > 5
  if (data.shopify.abandonedCartsCount > 5) {
    const recoverable = Math.round(data.shopify.abandonedCartsValue * 0.12);
    flows.push({
      flowName: 'Carrito Abandonado',
      trigger: 'Checkout abandonado',
      emailCount: 3,
      timing: '1 hora → 24 horas → 72 horas',
      expectedImpact: `Recuperar ~12% = ${fmt(recoverable)} de ${fmt(data.shopify.abandonedCartsValue)} en carritos`,
      description: 'Email 1: Recordatorio amigable. Email 2: Urgencia + social proof. Email 3: Descuento 10% por tiempo limitado.',
    });
  }

  // Repeat rate < 20%
  if (repeatRate < 20) {
    flows.push({
      flowName: 'Post-Compra / Recompra',
      trigger: 'Compra completada',
      emailCount: 3,
      timing: '7 dias → 30 dias → 60 dias',
      expectedImpact: `Subir tasa de repeticion del ${repeatRate.toFixed(0)}% al ${Math.min(repeatRate + 5, 30).toFixed(0)}%`,
      description: 'Email 1: Agradecimiento + how-to. Email 2: Cross-sell productos complementarios. Email 3: Incentivo recompra con descuento.',
    });
  }

  // Siempre Bienvenida
  flows.push({
    flowName: 'Bienvenida',
    trigger: 'Nuevo suscriptor',
    emailCount: 2,
    timing: 'Inmediato → 3 dias',
    expectedImpact: 'Conversion 15-25% mayor en primeros compradores vs sin flow',
    description: 'Email 1: Bienvenida + historia de marca + descuento primera compra. Email 2: Best-sellers + social proof.',
  });

  // AOV bajo → Cross-sell
  if (aov > 0 && aov < 40000) {
    flows.push({
      flowName: 'Cross-sell Productos Complementarios',
      trigger: 'Compra de producto especifico',
      emailCount: 2,
      timing: '3 dias → 14 dias despues de compra',
      expectedImpact: `Subir ticket promedio de ${fmt(aov)} a ${fmt(Math.round(aov * 1.15))} (+15%)`,
      description: 'Email 1: Productos que complementan lo comprado. Email 2: Bundle exclusivo con descuento.',
    });
  }

  // Siempre Newsletter
  flows.push({
    flowName: 'Newsletter Semanal',
    trigger: 'Automatico cada semana',
    emailCount: 1,
    timing: 'Cada martes o jueves (mejor apertura)',
    expectedImpact: 'Mantener marca top-of-mind. Genera 10-20% de revenue en tiendas maduras.',
    description: 'Productos destacados, novedades, contenido de valor. Segmentar por actividad de compra.',
  });

  return flows;
}

function generateProjections(data: ReportData): Projection[] {
  const projections: Projection[] = [];
  const { kpi, shopify, profitLoss } = data;

  // Revenue +25% con estrategia completa
  if (kpi.revenue > 0) {
    const projected = Math.round(kpi.revenue * 1.25);
    projections.push({
      metric: 'Revenue Mensual',
      current: fmt(kpi.revenue),
      projected: fmt(projected),
      improvement: '+25% implementando estrategia completa',
    });
  }

  // ROAS mejora
  if (kpi.roas > 0) {
    const projectedRoas = Math.round(kpi.roas * 1.2 * 10) / 10;
    projections.push({
      metric: 'ROAS',
      current: `${kpi.roas.toFixed(1)}x`,
      projected: `${projectedRoas.toFixed(1)}x`,
      improvement: '+20% por optimizacion de campanas y retargeting',
    });
  }

  // AOV +15% por bundles
  if (kpi.aov > 0) {
    const projectedAov = Math.round(kpi.aov * 1.15);
    projections.push({
      metric: 'Ticket Promedio (AOV)',
      current: fmt(kpi.aov),
      projected: fmt(projectedAov),
      improvement: '+15% con bundles y estrategia de upsell',
    });
  }

  // Carritos recuperados
  if (shopify.abandonedCartsValue > 0) {
    const recoverable = Math.round(shopify.abandonedCartsValue * 0.12);
    projections.push({
      metric: 'Carritos Recuperados',
      current: fmt(0),
      projected: fmt(recoverable),
      improvement: `12% de ${fmt(shopify.abandonedCartsValue)} en carritos abandonados`,
    });
  }

  // Repeat rate +5 puntos
  if (shopify.customerMetrics) {
    const current = shopify.customerMetrics.repeatCustomerRate;
    const projected = Math.min(current + 5, 40);
    projections.push({
      metric: 'Tasa de Repeticion',
      current: `${current.toFixed(0)}%`,
      projected: `${projected.toFixed(0)}%`,
      improvement: `+5 puntos con flows de email automatizados`,
    });
  }

  return projections;
}

/**
 * Generate rule-based strategy recommendations from report data.
 * Produces bundles, campaign plans, email flows and projections.
 */
export function generateStrategy(data: ReportData): StrategySection {
  return {
    bundles: generateBundles(data),
    metaCampaigns: generateMetaCampaigns(data),
    googleCampaigns: generateGoogleCampaigns(data),
    emailFlows: generateEmailFlows(data),
    projections: generateProjections(data),
  };
}

/**
 * Generate insights. Uses rule-based by default, optionally calls AI API.
 */
export async function generateInsights(
  data: ReportData,
  useAI: boolean = false
): Promise<AIInsight[]> {
  const ruleInsights = generateRuleBasedInsights(data);

  if (!useAI) return ruleInsights;

  try {
    const prompt = `Eres Steve, un analista de performance marketing experto. Analiza estos datos y da exactamente 3 recomendaciones accionables en español.

Datos:
- Revenue: $${Math.round(data.kpi.revenue).toLocaleString()} CLP
- ROAS: ${data.kpi.roas.toFixed(2)}x
- Pedidos: ${data.kpi.orders}
- Inversión ads: $${Math.round(data.kpi.adSpend).toLocaleString()} CLP
- Margen neto: ${data.profitLoss.netProfitMargin.toFixed(1)}%
- Carritos abandonados: ${data.shopify.abandonedCartsCount} (valor: $${Math.round(data.shopify.abandonedCartsValue).toLocaleString()})
${data.shopify.customerMetrics ? `- Tasa repetición: ${data.shopify.customerMetrics.repeatCustomerRate.toFixed(0)}%` : ''}
${data.adPlatforms.map(p => `- ${p.platform}: ${p.campaigns.length} campañas, ROAS ${p.avgRoas.toFixed(2)}x`).join('\n')}

Responde SOLO con un JSON array: [{"title":"...","message":"...","action":"..."}]`;

    const { data: aiResponse } = await callApi<any>('steve-chat', {
      body: {
        messages: [{ role: 'user', content: prompt }],
        systemPrompt: 'Responde solo con el JSON array pedido, sin markdown ni explicaciones.',
      },
    });

    if (aiResponse?.response) {
      const jsonMatch = aiResponse.response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as AIInsight[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, 5);
        }
      }
    }
  } catch {
    // Fallback to rule-based
  }

  return ruleInsights;
}
