import React from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, sizes, formatCurrency, formatPercent, formatDelta, formatDateRange, periodWord } from './theme.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { KpiCard } from './components/KpiCard.js';
import type { ReportData } from './data.js';

const pageStyle = StyleSheet.create({
  page: {
    paddingTop: sizes.margin,
    paddingBottom: sizes.margin + 16,
    paddingLeft: sizes.margin,
    paddingRight: sizes.margin,
    backgroundColor: colors.paper,
    fontFamily: fonts.sans,
    fontSize: sizes.body,
    color: colors.textPrimary,
  },
  cover: {
    backgroundColor: colors.navy,
    color: colors.cream,
    padding: 0,
  },
});

// ================================================================
// Cap 1 — Portada
// ================================================================
const coverStyles = StyleSheet.create({
  wrapper: { flex: 1, padding: 56, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  steveBrand: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.cream, letterSpacing: 3 },
  clientLogo: { width: 60, height: 60, objectFit: 'contain' },
  middle: { flexDirection: 'column' },
  reportTag: { fontFamily: fonts.sans, fontSize: 11, color: colors.accent, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 12 },
  shopName: { fontFamily: fonts.serifBold, fontSize: 56, color: colors.cream, lineHeight: 1.05, marginBottom: 24 },
  subTitle: { fontFamily: fonts.serifItalic, fontSize: 18, color: colors.cream, opacity: 0.85 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  meta: { flexDirection: 'column', gap: 4 },
  metaLabel: { fontFamily: fonts.sans, fontSize: 8, color: colors.accent, letterSpacing: 2, textTransform: 'uppercase' },
  metaValue: { fontFamily: fonts.serifBold, fontSize: 14, color: colors.cream },
});

export function CoverPage({ data }: { data: ReportData }) {
  return (
    <Page size="LETTER" style={[pageStyle.page, pageStyle.cover]}>
      <View style={coverStyles.wrapper}>
        <View style={coverStyles.topRow}>
          <Text style={coverStyles.steveBrand}>STEVE ADS</Text>
          {data.client.logo_url ? <Image src={data.client.logo_url} style={coverStyles.clientLogo} /> : null}
        </View>

        <View style={coverStyles.middle}>
          <Text style={coverStyles.reportTag}>Informe de Performance</Text>
          <Text style={coverStyles.shopName}>{data.client.name}</Text>
          <Text style={coverStyles.subTitle}>Análisis del período {formatDateRange(data.period.start, data.period.end)}</Text>
        </View>

        <View style={coverStyles.bottomRow}>
          <View style={coverStyles.meta}>
            <Text style={coverStyles.metaLabel}>Tienda</Text>
            <Text style={coverStyles.metaValue}>{data.client.shop_domain}</Text>
          </View>
          <View style={coverStyles.meta}>
            <Text style={coverStyles.metaLabel}>Generado</Text>
            <Text style={coverStyles.metaValue}>{new Date(data.generatedAt).toLocaleDateString('es-CL')}</Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

// ================================================================
// Cap 2 — Carta del Equipo
// ================================================================
const letterStyles = StyleSheet.create({
  title: { fontFamily: fonts.serifBold, fontSize: sizes.h1, color: colors.navy, marginBottom: 24 },
  paragraph: { fontFamily: fonts.serif, fontSize: 11, lineHeight: 1.7, color: colors.textPrimary, marginBottom: 14 },
  signature: { fontFamily: fonts.serifItalic, fontSize: 11, color: colors.textSecondary, marginTop: 32 },
  signatureName: { fontFamily: fonts.serifBold, fontSize: 11, color: colors.navy },
});

export function LetterPage({ data }: { data: ReportData }) {
  const period = periodWord(data.period.daysInPeriod);
  const delta = formatDelta(data.current.totalRevenue, data.previous.totalRevenue);
  const direction = delta.isPositive ? 'creció' : 'cayó';
  const profit = data.profitLoss.netProfit;
  const profitState = profit > 0 ? 'cerró en azul' : 'quedó en rojo';

  return (
    <Page size="LETTER" style={pageStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={letterStyles.title}>Lo que vimos {period}</Text>

      <Text style={letterStyles.paragraph}>
        Hola {data.client.name.split(' ')[0]},
      </Text>

      <Text style={letterStyles.paragraph}>
        Tu venta {direction} {delta.pct} respecto al período anterior, con un total de {formatCurrency(data.current.totalRevenue)} en {data.current.totalOrders.toLocaleString('es-CL')} pedidos. El ticket promedio quedó en {formatCurrency(data.current.avgOrderValue)}.
      </Text>

      <Text style={letterStyles.paragraph}>
        El estado de resultados {profitState} con {formatCurrency(profit)} de utilidad neta — un margen de {formatPercent(data.profitLoss.netProfitMarginPct)} sobre la venta bruta. {data.current.totalSpend > 0 ? `Invertiste ${formatCurrency(data.current.totalSpend)} en publicidad para generar este resultado.` : 'No hubo inversión publicitaria registrada en el período.'}
      </Text>

      <Text style={letterStyles.paragraph}>
        En las próximas páginas vas a encontrar el desglose completo: estado de resultados línea por línea, los productos que están moviendo la aguja, y nuestras 3 recomendaciones priorizadas para el próximo ciclo.
      </Text>

      <Text style={letterStyles.paragraph}>
        Cualquier duda, escríbenos.
      </Text>

      <Text style={letterStyles.signature}>
        Equipo Steve Ads{'\n'}
        <Text style={letterStyles.signatureName}>Tu agencia AI 24/7</Text>
      </Text>

      <Footer />
    </Page>
  );
}

// ================================================================
// Cap 3 — Resumen Ejecutivo
// ================================================================
const summaryStyles = StyleSheet.create({
  title: { fontFamily: fonts.serifBold, fontSize: sizes.h1, color: colors.navy, marginBottom: 6 },
  subtitle: { fontFamily: fonts.sans, fontSize: sizes.small, color: colors.textMuted, marginBottom: 22, letterSpacing: 1, textTransform: 'uppercase' },
  thesis: {
    backgroundColor: colors.bgSubtle,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    marginBottom: 22,
  },
  thesisLabel: { fontFamily: fonts.sansBold, fontSize: sizes.micro, color: colors.accent, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  thesisText: { fontFamily: fonts.serif, fontSize: 12, lineHeight: 1.55, color: colors.textPrimary },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
});

export function ExecutiveSummary({ data }: { data: ReportData }) {
  const revenueDelta = formatDelta(data.current.totalRevenue, data.previous.totalRevenue);
  const ordersDelta = formatDelta(data.current.totalOrders, data.previous.totalOrders);
  const aovDelta = formatDelta(data.current.avgOrderValue, data.previous.avgOrderValue);
  const spendDelta = formatDelta(data.current.totalSpend, data.previous.totalSpend);
  const roasDelta = formatDelta(data.current.totalRoas, data.previous.totalRoas);

  // Tesis dinámica simple (Sprint 1) - en Sprint 3 la genera Claude
  const profitGrowing = data.profitLoss.netProfit > 0 && revenueDelta.isPositive;
  const thesis = profitGrowing
    ? `Estás vendiendo más y manteniendo rentabilidad. La inversión publicitaria está respondiendo. El siguiente paso es escalar lo que funciona y limpiar lo que no.`
    : data.profitLoss.netProfit > 0
      ? `La venta bajó pero la rentabilidad se mantiene. Es momento de revisar mix de productos y eficiencia del marketing antes de subir presupuesto.`
      : `Estás operando bajo break-even. Los próximos 30 días requieren decisiones rápidas: subir margen, cortar gasto improductivo o cambiar la estrategia de adquisición.`;

  return (
    <Page size="LETTER" style={pageStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={summaryStyles.subtitle}>Sección 01</Text>
      <Text style={summaryStyles.title}>Resumen Ejecutivo</Text>

      <View style={summaryStyles.thesis}>
        <Text style={summaryStyles.thesisLabel}>Tesis del período</Text>
        <Text style={summaryStyles.thesisText}>{thesis}</Text>
      </View>

      <View style={summaryStyles.kpiGrid}>
        <KpiCard
          label="Revenue Bruto"
          value={formatCurrency(data.current.totalRevenue)}
          deltaSign={revenueDelta.sign}
          deltaPct={revenueDelta.pct}
          deltaIsPositive={revenueDelta.isPositive}
        />
        <KpiCard
          label="Utilidad Neta"
          value={formatCurrency(data.profitLoss.netProfit)}
          deltaCaption={`Margen ${formatPercent(data.profitLoss.netProfitMarginPct)}`}
        />
        <KpiCard
          label="Pedidos"
          value={data.current.totalOrders.toLocaleString('es-CL')}
          deltaSign={ordersDelta.sign}
          deltaPct={ordersDelta.pct}
          deltaIsPositive={ordersDelta.isPositive}
        />
        <KpiCard
          label="Ticket Promedio"
          value={formatCurrency(data.current.avgOrderValue)}
          deltaSign={aovDelta.sign}
          deltaPct={aovDelta.pct}
          deltaIsPositive={aovDelta.isPositive}
        />
        <KpiCard
          label="Inversión Publicitaria"
          value={formatCurrency(data.current.totalSpend)}
          deltaSign={spendDelta.sign}
          deltaPct={spendDelta.pct}
          deltaIsPositive={!spendDelta.isPositive}
          deltaCaption="vs período anterior"
        />
        <KpiCard
          label="ROAS"
          value={data.current.totalRoas > 0 ? `${data.current.totalRoas.toFixed(2)}x` : '—'}
          deltaSign={roasDelta.sign}
          deltaPct={roasDelta.pct}
          deltaIsPositive={roasDelta.isPositive}
        />
      </View>

      <Footer />
    </Page>
  );
}

// ================================================================
// Cap 4 — North Star + EERR
// ================================================================
const northStarStyles = StyleSheet.create({
  title: { fontFamily: fonts.serifBold, fontSize: sizes.h1, color: colors.navy, marginBottom: 6 },
  subtitle: { fontFamily: fonts.sans, fontSize: sizes.small, color: colors.textMuted, marginBottom: 22, letterSpacing: 1, textTransform: 'uppercase' },
  hero: { marginBottom: 22 },
  heroLabel: { fontFamily: fonts.sansBold, fontSize: sizes.micro, color: colors.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  heroValue: { fontFamily: fonts.serifBold, fontSize: 52, color: colors.navy, lineHeight: 1 },
  heroCaption: { fontFamily: fonts.serifItalic, fontSize: 12, color: colors.textSecondary, marginTop: 8 },
  pnlTitle: { fontFamily: fonts.serifBold, fontSize: sizes.h2, color: colors.navy, marginBottom: 12, marginTop: 8 },
  pnlRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.textDivider },
  pnlRowEmphasis: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.navy },
  pnlLabel: { fontFamily: fonts.sans, fontSize: sizes.body, color: colors.textPrimary },
  pnlLabelEmphasis: { fontFamily: fonts.sansBold, fontSize: sizes.body, color: colors.navy },
  pnlLabelMuted: { fontFamily: fonts.sans, fontSize: sizes.body, color: colors.textSecondary, paddingLeft: 12 },
  pnlValue: { fontFamily: fonts.mono, fontSize: sizes.body, color: colors.textPrimary },
  pnlValueEmphasis: { fontFamily: fonts.sansBold, fontSize: sizes.body, color: colors.navy },
  pnlValueNeg: { fontFamily: fonts.mono, fontSize: sizes.body, color: colors.negative },
});

export function NorthStarPage({ data }: { data: ReportData }) {
  const profit = data.profitLoss.netProfit;
  // North star: la métrica que más se movió, simplificado a profit por ahora.
  // En Sprint 3 se calcula previous P&L para mostrar delta real.
  const northStarValue = formatCurrency(profit);
  const caption = profit > 0
    ? `Cerraste el período con utilidad. Margen neto de ${formatPercent(data.profitLoss.netProfitMarginPct)} sobre la venta bruta.`
    : `El período cerró bajo break-even. Necesitamos optimizar costos o aumentar margen.`;

  return (
    <Page size="LETTER" style={pageStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={northStarStyles.subtitle}>Sección 02 · North Star + Estado de Resultados</Text>
      <Text style={northStarStyles.title}>North Star del Período</Text>

      <View style={northStarStyles.hero}>
        <Text style={northStarStyles.heroLabel}>Utilidad Neta</Text>
        <Text style={northStarStyles.heroValue}>{northStarValue}</Text>
        <Text style={northStarStyles.heroCaption}>{caption}</Text>
      </View>

      <Text style={northStarStyles.pnlTitle}>Estado de Resultados</Text>

      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabel}>Ingresos Brutos</Text>
        <Text style={northStarStyles.pnlValue}>{formatCurrency(data.profitLoss.grossRevenue)}</Text>
      </View>
      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabelMuted}>(-) IVA / Impuestos</Text>
        <Text style={northStarStyles.pnlValueNeg}>-{formatCurrency(data.profitLoss.grossRevenue - data.profitLoss.netRevenue)}</Text>
      </View>
      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabel}>Ingresos Netos</Text>
        <Text style={northStarStyles.pnlValue}>{formatCurrency(data.profitLoss.netRevenue)}</Text>
      </View>
      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabelMuted}>(-) Costo de Productos</Text>
        <Text style={northStarStyles.pnlValueNeg}>-{formatCurrency(data.profitLoss.costOfGoods)}</Text>
      </View>
      <View style={northStarStyles.pnlRowEmphasis}>
        <Text style={northStarStyles.pnlLabelEmphasis}>Utilidad Bruta</Text>
        <Text style={northStarStyles.pnlValueEmphasis}>{formatCurrency(data.profitLoss.grossProfit)}</Text>
      </View>
      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabelMuted}>(-) Inversión Publicitaria</Text>
        <Text style={northStarStyles.pnlValueNeg}>-{formatCurrency(data.profitLoss.totalAdSpend)}</Text>
      </View>
      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabelMuted}>(-) Costos Fijos</Text>
        <Text style={northStarStyles.pnlValueNeg}>-{formatCurrency(data.profitLoss.totalFixedCosts)}</Text>
      </View>
      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabelMuted}>(-) Comisiones Pasarela</Text>
        <Text style={northStarStyles.pnlValueNeg}>-{formatCurrency(data.profitLoss.paymentGatewayFees)}</Text>
      </View>
      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabelMuted}>(-) Envíos</Text>
        <Text style={northStarStyles.pnlValueNeg}>-{formatCurrency(data.profitLoss.shippingCosts)}</Text>
      </View>
      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabelMuted}>(-) Comisión Shopify</Text>
        <Text style={northStarStyles.pnlValueNeg}>-{formatCurrency(data.profitLoss.shopifyCommission)}</Text>
      </View>
      <View style={northStarStyles.pnlRowEmphasis}>
        <Text style={northStarStyles.pnlLabelEmphasis}>Utilidad Neta</Text>
        <Text style={northStarStyles.pnlValueEmphasis}>{formatCurrency(data.profitLoss.netProfit)}</Text>
      </View>

      <Text style={[northStarStyles.pnlLabelMuted, { marginTop: 12, fontSize: sizes.micro, fontStyle: 'italic' }]}>
        {data.profitLoss.cogsMethod === 'real'
          ? `Costo de productos calculado con costos reales por SKU desde Shopify.`
          : data.profitLoss.cogsMethod === 'mixed'
            ? `Costo de productos: ${data.profitLoss.cogsCoveredPct.toFixed(0)}% calculado con costos reales por SKU, el resto estimado al ${data.financial.default_margin_percentage}% de margen configurado. Configurá el "Cost per Item" de tus variants en Shopify para precisión total.`
            : `Costo de productos estimado al ${data.financial.default_margin_percentage}% de margen configurado en Steve. Configurá el "Cost per Item" de tus variants en Shopify para usar costos reales por SKU.`}
        {' '}Costos fijos prorrateados linealmente al rango ({data.period.daysInPeriod} días sobre 30).
      </Text>

      <Footer />
    </Page>
  );
}

// ================================================================
// Cap 05 — Recomendaciones (Sprint 1: heurísticas, Sprint 3: AI)
// ================================================================
const recsStyles = StyleSheet.create({
  title: { fontFamily: fonts.serifBold, fontSize: sizes.h1, color: colors.navy, marginBottom: 6 },
  subtitle: { fontFamily: fonts.sans, fontSize: sizes.small, color: colors.textMuted, marginBottom: 22, letterSpacing: 1, textTransform: 'uppercase' },
  intro: { fontFamily: fonts.serif, fontSize: 11, lineHeight: 1.6, color: colors.textPrimary, marginBottom: 22 },
  rec: { marginBottom: 18, padding: 14, backgroundColor: colors.bgSubtle, borderLeftWidth: 3, borderLeftColor: colors.accent },
  recHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recNum: { fontFamily: fonts.serifBold, fontSize: 14, color: colors.accent },
  recPriority: { fontFamily: fonts.sansBold, fontSize: sizes.micro, color: colors.navy, letterSpacing: 1, textTransform: 'uppercase' },
  recTitle: { fontFamily: fonts.serifBold, fontSize: sizes.h3, color: colors.navy, marginBottom: 6 },
  recText: { fontFamily: fonts.serif, fontSize: 10, lineHeight: 1.55, color: colors.textPrimary },
});

interface Recommendation {
  priority: 'esta semana' | 'este mes' | 'cuando puedas';
  title: string;
  body: string;
}

function buildRecommendations(data: ReportData): Recommendation[] {
  const recs: Recommendation[] = [];

  if (data.current.totalRoas > 0 && data.current.totalRoas < 2 && data.current.totalSpend > 0) {
    recs.push({
      priority: 'esta semana',
      title: 'Tu ROAS está bajo el break-even',
      body: `El ROAS de ${data.current.totalRoas.toFixed(2)}x sugiere que la publicidad no se está pagando sola. Recomendamos pausar las campañas con peor performance y revisar el targeting antes de sumar presupuesto.`,
    });
  }

  if (data.profitLoss.netProfitMarginPct < 5 && data.profitLoss.netProfit > 0) {
    recs.push({
      priority: 'este mes',
      title: 'Margen neto bajo (<5%)',
      body: `Tu margen neto de ${formatPercent(data.profitLoss.netProfitMarginPct)} es frágil. Con cualquier alza de costos quedas en pérdida. Priorizá: subir precios donde se pueda, negociar costos de proveedor, o discontinuar SKUs sin margen.`,
    });
  }

  if (data.current.avgOrderValue > 0 && data.current.totalOrders > 0) {
    recs.push({
      priority: 'este mes',
      title: 'Subí el ticket promedio con bundles',
      body: `Tu ticket actual es ${formatCurrency(data.current.avgOrderValue)}. Crear 2-3 combos de productos relacionados puede subirlo 15-25% sin aumentar tráfico. Revisá la sección "Top Productos" para identificar los candidatos.`,
    });
  }

  if (data.profitLoss.netProfit < 0) {
    recs.unshift({
      priority: 'esta semana',
      title: 'El período cerró en rojo',
      body: `Las pérdidas de ${formatCurrency(Math.abs(data.profitLoss.netProfit))} requieren acción inmediata. Empezá por bajar gasto fijo y publicitario. No es momento de escalar — es momento de optimizar.`,
    });
  }

  // Si no se generó ninguna, una recomendación genérica positiva
  if (recs.length === 0) {
    recs.push({
      priority: 'este mes',
      title: 'El negocio está sano — escalá lo que funciona',
      body: `Los indicadores están en verde. Es momento de identificar tus 3 productos top y aumentar 20-30% el presupuesto publicitario en ellos. Documentá lo que estás haciendo bien para replicarlo.`,
    });
  }

  return recs.slice(0, 3);
}

export function RecommendationsPage({ data }: { data: ReportData }) {
  const recs = buildRecommendations(data);

  return (
    <Page size="LETTER" style={pageStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={recsStyles.subtitle}>Sección 07</Text>
      <Text style={recsStyles.title}>Recomendaciones Priorizadas</Text>

      <Text style={recsStyles.intro}>
        Tres acciones concretas para mover la aguja. Priorizadas por urgencia e impacto esperado.
      </Text>

      {recs.map((rec, i) => (
        <View key={i} style={recsStyles.rec}>
          <View style={recsStyles.recHeader}>
            <Text style={recsStyles.recNum}>{(i + 1).toString().padStart(2, '0')}</Text>
            <Text style={recsStyles.recPriority}>{rec.priority}</Text>
          </View>
          <Text style={recsStyles.recTitle}>{rec.title}</Text>
          <Text style={recsStyles.recText}>{rec.body}</Text>
        </View>
      ))}

      <Footer />
    </Page>
  );
}

// ================================================================
// Cap 14 — Próximos Pasos
// ================================================================
const nextStepsStyles = StyleSheet.create({
  title: { fontFamily: fonts.serifBold, fontSize: sizes.h1, color: colors.navy, marginBottom: 6 },
  subtitle: { fontFamily: fonts.sans, fontSize: sizes.small, color: colors.textMuted, marginBottom: 22, letterSpacing: 1, textTransform: 'uppercase' },
  intro: { fontFamily: fonts.serif, fontSize: 11, lineHeight: 1.6, color: colors.textPrimary, marginBottom: 22 },
  step: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: colors.textDivider },
  stepNum: { fontFamily: fonts.serifBold, fontSize: 22, color: colors.accent, width: 38 },
  stepBody: { flex: 1 },
  stepTitle: { fontFamily: fonts.serifBold, fontSize: sizes.h3, color: colors.navy, marginBottom: 4 },
  stepEta: { fontFamily: fonts.sansBold, fontSize: sizes.micro, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  stepText: { fontFamily: fonts.serif, fontSize: 10, lineHeight: 1.55, color: colors.textPrimary },
  closing: { fontFamily: fonts.serifItalic, fontSize: 11, color: colors.textSecondary, marginTop: 24, lineHeight: 1.6 },
});

export function NextStepsPage({ data }: { data: ReportData }) {
  const period = periodWord(data.period.daysInPeriod);

  // Próximos pasos sugeridos por Steve (Sprint 1: heurísticos, Sprint 3: AI)
  const steps = [
    {
      eta: '7 días',
      title: 'Revisar productos top y bottom',
      text: 'Identificar los 3 productos que más venden y los 3 que menos. Definir si los del fondo se pausan, se descuentan o se eliminan del catálogo.',
    },
    {
      eta: '14 días',
      title: 'Optimizar campañas con peor ROAS',
      text: 'Pausar adsets bajo break-even, redistribuir presupuesto a los que están performando y testear 2-3 creativos nuevos en los top performers.',
    },
    {
      eta: '30 días',
      title: 'Implementar bundles para subir AOV',
      text: 'Crear 2-3 combos de productos relacionados con descuento del 8-12%. Objetivo: subir ticket promedio sin sacrificar margen.',
    },
  ];

  return (
    <Page size="LETTER" style={pageStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={nextStepsStyles.subtitle}>Sección 08</Text>
      <Text style={nextStepsStyles.title}>Próximos Pasos</Text>

      <Text style={nextStepsStyles.intro}>
        El plan que vamos a ejecutar a partir de hoy. Cada paso tiene ETA propio y se va revisando en el siguiente informe.
      </Text>

      {steps.map((s, i) => (
        <View key={i} style={nextStepsStyles.step}>
          <Text style={nextStepsStyles.stepNum}>{(i + 1).toString().padStart(2, '0')}</Text>
          <View style={nextStepsStyles.stepBody}>
            <Text style={nextStepsStyles.stepEta}>Próximos {s.eta}</Text>
            <Text style={nextStepsStyles.stepTitle}>{s.title}</Text>
            <Text style={nextStepsStyles.stepText}>{s.text}</Text>
          </View>
        </View>
      ))}

      <Text style={nextStepsStyles.closing}>
        Este informe se generó automáticamente con Steve Ads. La data viene directo de tu Shopify y plataformas conectadas — sin manipulación, sin maquillaje. Todo lo que ves acá lo podés validar en tu dashboard.
      </Text>

      <Footer />
    </Page>
  );
}
