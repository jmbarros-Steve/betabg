import React from 'react';
import { Page, View, Text, Image, StyleSheet, Svg, Defs, LinearGradient, Stop, Rect } from '@react-pdf/renderer';
import {
  colors,
  fonts,
  sizes,
  formatCurrency,
  formatPercent,
  formatDelta,
  formatCompact,
  formatDateRange,
  periodWord,
  FUNNEL_LABELS,
  FUNNEL_COLORS,
} from './theme.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { KpiCard } from './components/KpiCard.js';
import { SpendRevenueChart, FunnelChartMeta } from './charts.js';
import type { MetaReportData } from './data.js';

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
// 1 — Cover
// ================================================================
const coverStyles = StyleSheet.create({
  bg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  wrapper: { flex: 1, padding: 56, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  steveBrand: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.cream, letterSpacing: 3 },
  steveBrandAccent: { color: colors.meta },
  clientLogo: { width: 60, height: 60, objectFit: 'contain' },
  middle: { flexDirection: 'column' },
  reportTag: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.meta, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 14 },
  shopName: { fontFamily: fonts.serifBold, fontSize: 44, color: colors.cream, lineHeight: 1.05, marginBottom: 18 },
  tagline: { fontFamily: fonts.serifItalic, fontSize: 22, color: colors.cream, opacity: 0.92, marginBottom: 6, lineHeight: 1.25 },
  subTitle: { fontFamily: fonts.sans, fontSize: 12, color: colors.cream, opacity: 0.75 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  meta: { flexDirection: 'column', gap: 4 },
  metaLabel: { fontFamily: fonts.sansBold, fontSize: 8, color: colors.meta, letterSpacing: 2, textTransform: 'uppercase' },
  metaValue: { fontFamily: fonts.serifBold, fontSize: 13, color: colors.cream },
});

export function CoverPage({ data }: { data: MetaReportData }) {
  return (
    <Page size="LETTER" style={[pageStyle.page, pageStyle.cover]}>
      {/* Gradient background */}
      <Svg width={sizes.pageWidth} height={sizes.pageHeight} style={coverStyles.bg}>
        <Defs>
          <LinearGradient id="coverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={colors.navyDark} stopOpacity={1} />
            <Stop offset="60%" stopColor={colors.navy} stopOpacity={1} />
            <Stop offset="100%" stopColor={colors.metaDark} stopOpacity={0.5} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={sizes.pageWidth} height={sizes.pageHeight} fill="url(#coverGrad)" />
      </Svg>

      <View style={coverStyles.wrapper}>
        <View style={coverStyles.topRow}>
          <Text style={coverStyles.steveBrand}>
            STEVE <Text style={coverStyles.steveBrandAccent}>ADS</Text>
          </Text>
          {data.client.logo_url ? <Image src={data.client.logo_url} style={coverStyles.clientLogo} /> : null}
        </View>

        <View style={coverStyles.middle}>
          <Text style={coverStyles.reportTag}>Reporte Meta Ads</Text>
          <Text style={coverStyles.shopName}>{data.client.name}</Text>
          <Text style={coverStyles.tagline}>Tu plata en Meta,{'\n'}traducida a ventas.</Text>
          <Text style={coverStyles.subTitle}>Análisis del período {formatDateRange(data.period.start, data.period.end)}</Text>
        </View>

        <View style={coverStyles.bottomRow}>
          <View style={coverStyles.meta}>
            <Text style={coverStyles.metaLabel}>Cuenta</Text>
            <Text style={coverStyles.metaValue}>{data.client.shop_domain || data.client.primaryConnection?.portfolio_name || 'Meta Business'}</Text>
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
// 2 — Carta de Felipe
// ================================================================
const letterStyles = StyleSheet.create({
  title: { fontFamily: fonts.serifBold, fontSize: sizes.h1, color: colors.navy, marginBottom: 6 },
  subtitle: { fontFamily: fonts.sansBold, fontSize: sizes.small, color: colors.meta, marginBottom: 22, letterSpacing: 1.2, textTransform: 'uppercase' },
  paragraph: { fontFamily: fonts.serif, fontSize: 11, lineHeight: 1.7, color: colors.textPrimary, marginBottom: 14 },
  highlight: { fontFamily: fonts.serifBold, color: colors.navy },
  signature: { fontFamily: fonts.serifItalic, fontSize: 11, color: colors.textSecondary, marginTop: 32 },
  signatureName: { fontFamily: fonts.serifBold, fontSize: 11, color: colors.navy },
  signatureRole: { fontFamily: fonts.sansBold, fontSize: 9, color: colors.meta, letterSpacing: 1 },
});

export function LetterPage({ data }: { data: MetaReportData }) {
  const period = periodWord(data.period.daysInPeriod);
  const delta = formatDelta(data.current.revenue, data.previous.revenue);
  const direction = delta.isPositive ? 'creció' : 'cayó';
  const c = data.current;

  // Highlight detection
  const fatigueCampaigns = data.campaigns.filter((x) => x.frequency >= 3).length;
  const stars = data.campaigns.filter((x) => x.bcgQuadrant === 'star');
  const topStar = stars[0];

  let highlight: string;
  if (fatigueCampaigns >= 2) {
    highlight = `tenemos ${fatigueCampaigns} campañas en fatiga. La frecuencia promedio del período fue ${c.frequency.toFixed(1)} — el público ya las vio demasiado y eso te está subiendo el CPM.`;
  } else if (topStar) {
    highlight = `la campaña "${topStar.campaignName.slice(0, 50)}" se llevó la película con ROAS ${topStar.roas.toFixed(2)}x sobre ${formatCurrency(topStar.spend)} de inversión.`;
  } else if (c.roas > 0 && c.roas < 1.5) {
    highlight = `el ROAS global de ${c.roas.toFixed(2)}x está debajo de break-even. La pauta está perdiendo plata y necesitamos cortar lo que no funciona.`;
  } else if (c.spend === 0) {
    highlight = `no hubo inversión publicitaria registrada en el período. Apenas activemos campañas vamos a poder optimizar con data real.`;
  } else {
    highlight = `el ROAS global cerró en ${c.roas.toFixed(2)}x sobre ${formatCurrency(c.spend)} invertidos.`;
  }

  return (
    <Page size="LETTER" style={pageStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={letterStyles.subtitle}>Carta de Felipe · Tu Performance Manager</Text>
      <Text style={letterStyles.title}>Lo que vimos {period}</Text>

      <Text style={letterStyles.paragraph}>
        Hola {data.client.name.split(' ')[0]},
      </Text>

      <Text style={letterStyles.paragraph}>
        Tu inversión en Meta {direction} <Text style={letterStyles.highlight}>{delta.pct}</Text> respecto al período anterior. Cerraste con <Text style={letterStyles.highlight}>{formatCurrency(c.spend)}</Text> invertidos en {c.campaignCount} campañas, generando <Text style={letterStyles.highlight}>{formatCurrency(c.revenue)}</Text> de ventas atribuidas y un ROAS global de {c.roas.toFixed(2)}x. El alcance único fue de {formatCompact(c.reach)} personas.
      </Text>

      <Text style={letterStyles.paragraph}>
        Lo más importante del período: {highlight}
      </Text>

      <Text style={letterStyles.paragraph}>
        En las próximas páginas vas a encontrar el desglose completo: estado de resultados línea por línea, los cuadrantes BCG de tus campañas, fatiga, audiencia y el funnel de conversión. Al final hay {data.recommendations.length || 5}-{data.recommendations.length || 8} recomendaciones priorizadas para el próximo ciclo, con el impacto esperado de cada una.
      </Text>

      <Text style={letterStyles.paragraph}>
        Cualquier duda escribime y la resolvemos.
      </Text>

      <Text style={letterStyles.signature}>
        Saludos,{'\n'}
        <Text style={letterStyles.signatureName}>Felipe W2</Text>
        {'\n'}
        <Text style={letterStyles.signatureRole}>PERFORMANCE MANAGER · STEVE ADS</Text>
      </Text>

      <Footer />
    </Page>
  );
}

// ================================================================
// 3 — Resumen Ejecutivo
// ================================================================
const summaryStyles = StyleSheet.create({
  title: { fontFamily: fonts.serifBold, fontSize: sizes.h1, color: colors.navy, marginBottom: 6 },
  subtitle: { fontFamily: fonts.sansBold, fontSize: sizes.small, color: colors.meta, marginBottom: 22, letterSpacing: 1.2, textTransform: 'uppercase' },
  thesis: {
    backgroundColor: colors.bgWarm,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.meta,
    marginBottom: 22,
  },
  thesisLabel: { fontFamily: fonts.sansBold, fontSize: sizes.micro, color: colors.meta, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  thesisText: { fontFamily: fonts.serif, fontSize: 11, lineHeight: 1.55, color: colors.textPrimary },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 0 },
  chartTitle: { fontFamily: fonts.serifBold, fontSize: sizes.h3, color: colors.navy, marginTop: 12, marginBottom: 6 },
  chartCaption: { fontFamily: fonts.sans, fontSize: sizes.micro, color: colors.textMuted, marginBottom: 6 },
});

export function ExecutiveSummary({ data }: { data: MetaReportData }) {
  const spendDelta = formatDelta(data.current.spend, data.previous.spend);
  const revenueDelta = formatDelta(data.current.revenue, data.previous.revenue);
  const roasDelta = formatDelta(data.current.roas, data.previous.roas);
  const reachDelta = formatDelta(data.current.reach, data.previous.reach);

  const profitGrowing = data.profitLoss.grossProfit > 0 && revenueDelta.isPositive;
  const thesis = profitGrowing
    ? `Estás escalando con rentabilidad. Las ventas atribuidas crecieron y el margen aguanta. Toca identificar las 2-3 campañas estrella y subirles presupuesto sin romper el ROAS.`
    : data.profitLoss.grossProfit > 0
      ? `Margen positivo pero ventas a la baja o planas. Hay que afinar segmentación, refrescar creativos y cortar lo que no convierte antes de escalar.`
      : data.current.spend === 0
        ? `Sin inversión publicitaria activa en el período. El siguiente paso es activar campañas TOFU + BOFU con creativos validados y empezar a juntar data.`
        : `La pauta está perdiendo plata: invertiste ${formatCurrency(data.current.spend)} y el ROAS no cubre costos. Decisión obligada esta semana: pausar las peores y reinvertir solo en lo que vende.`;

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
          label="Inversión total"
          value={formatCurrency(data.current.spend)}
          deltaSign={spendDelta.sign}
          deltaPct={spendDelta.pct}
          deltaIsPositive={spendDelta.isPositive}
          accent
        />
        <KpiCard
          label="Ventas atribuidas"
          value={formatCurrency(data.current.revenue)}
          deltaSign={revenueDelta.sign}
          deltaPct={revenueDelta.pct}
          deltaIsPositive={revenueDelta.isPositive}
          accent
        />
        <KpiCard
          label="ROAS global"
          value={data.current.roas > 0 ? `${data.current.roas.toFixed(2)}x` : '—'}
          deltaSign={roasDelta.sign}
          deltaPct={roasDelta.pct}
          deltaIsPositive={roasDelta.isPositive}
        />
        <KpiCard
          label="Personas alcanzadas"
          value={formatCompact(data.current.reach)}
          deltaSign={reachDelta.sign}
          deltaPct={reachDelta.pct}
          deltaIsPositive={reachDelta.isPositive}
          caption={`${data.current.campaignCount} campañas activas`}
        />
      </View>

      {data.daily.length > 1 ? (
        <>
          <Text style={summaryStyles.chartTitle}>Inversión vs Ventas — diario</Text>
          <Text style={summaryStyles.chartCaption}>La línea coral son las ventas, la navy es la inversión. Si suben juntas, escalá; si la coral se separa hacia abajo, optimizá antes de subir presupuesto.</Text>
          <SpendRevenueChart daily={data.daily} width={480} height={130} />
        </>
      ) : null}

      <Footer />
    </Page>
  );
}

// ================================================================
// 4 — North Star + EERR ad-only
// ================================================================
const northStarStyles = StyleSheet.create({
  title: { fontFamily: fonts.serifBold, fontSize: sizes.h1, color: colors.navy, marginBottom: 6 },
  subtitle: { fontFamily: fonts.sansBold, fontSize: sizes.small, color: colors.meta, marginBottom: 22, letterSpacing: 1.2, textTransform: 'uppercase' },
  hero: { marginBottom: 24, alignItems: 'center', paddingVertical: 14 },
  heroLabel: { fontFamily: fonts.sansBold, fontSize: 9, color: colors.meta, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  heroPre: { fontFamily: fonts.serifItalic, fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  heroValue: { fontFamily: fonts.serifBold, fontSize: 56, color: colors.navy, lineHeight: 1 },
  heroPost: { fontFamily: fonts.serifItalic, fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  pnlTitle: { fontFamily: fonts.serifBold, fontSize: sizes.h2, color: colors.navy, marginBottom: 12, marginTop: 4 },
  pnlRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.textDivider },
  pnlRowEmphasis: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.navy },
  pnlLabel: { fontFamily: fonts.sans, fontSize: sizes.body, color: colors.textPrimary },
  pnlLabelEmphasis: { fontFamily: fonts.sansBold, fontSize: sizes.body, color: colors.navy },
  pnlLabelMuted: { fontFamily: fonts.sans, fontSize: sizes.body, color: colors.textSecondary, paddingLeft: 12 },
  pnlValue: { fontFamily: fonts.mono, fontSize: sizes.body, color: colors.textPrimary },
  pnlValueEmphasis: { fontFamily: fonts.sansBold, fontSize: sizes.body, color: colors.navy },
  pnlValueNeg: { fontFamily: fonts.mono, fontSize: sizes.body, color: colors.negative },
  disclaimer: { fontFamily: fonts.serifItalic, fontSize: sizes.micro, color: colors.textMuted, marginTop: 12, lineHeight: 1.5 },
});

export function NorthStarPage({ data }: { data: MetaReportData }) {
  const pl = data.profitLoss;
  const perThousand = pl.revenuePerThousand;

  return (
    <Page size="LETTER" style={pageStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={northStarStyles.subtitle}>Sección 02 · North Star + EERR ad-only</Text>
      <Text style={northStarStyles.title}>La métrica que importa</Text>

      <View style={northStarStyles.hero}>
        <Text style={northStarStyles.heroLabel}>North Star del período</Text>
        <Text style={northStarStyles.heroPre}>Cada $1.000 invertidos te trajeron</Text>
        <Text style={northStarStyles.heroValue}>{formatCurrency(perThousand)}</Text>
        <Text style={northStarStyles.heroPost}>en ventas atribuidas a Meta</Text>
      </View>

      <Text style={northStarStyles.pnlTitle}>Estado de Resultados — solo Meta Ads</Text>

      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabel}>Ventas atribuidas (bruto)</Text>
        <Text style={northStarStyles.pnlValue}>{formatCurrency(pl.revenue)}</Text>
      </View>
      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabelMuted}>(-) IVA / Impuestos</Text>
        <Text style={northStarStyles.pnlValueNeg}>-{formatCurrency(pl.revenue - pl.netRevenue)}</Text>
      </View>
      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabel}>Ventas netas</Text>
        <Text style={northStarStyles.pnlValue}>{formatCurrency(pl.netRevenue)}</Text>
      </View>
      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabelMuted}>(-) Costo del producto</Text>
        <Text style={northStarStyles.pnlValueNeg}>-{formatCurrency(pl.costOfGoods)}</Text>
      </View>
      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabelMuted}>(-) Inversión Meta Ads</Text>
        <Text style={northStarStyles.pnlValueNeg}>-{formatCurrency(pl.spend)}</Text>
      </View>
      <View style={northStarStyles.pnlRowEmphasis}>
        <Text style={northStarStyles.pnlLabelEmphasis}>Utilidad bruta atribuible a Meta</Text>
        <Text style={[northStarStyles.pnlValueEmphasis, pl.grossProfit < 0 ? { color: colors.negative } : {}]}>{formatCurrency(pl.grossProfit)}</Text>
      </View>
      <View style={northStarStyles.pnlRow}>
        <Text style={northStarStyles.pnlLabelEmphasis}>Margen sobre venta bruta</Text>
        <Text style={[northStarStyles.pnlValueEmphasis, pl.marginPct < 0 ? { color: colors.negative } : {}]}>{formatPercent(pl.marginPct)}</Text>
      </View>

      <Text style={northStarStyles.disclaimer}>
        {pl.cogsMethod === 'real'
          ? `Costo del producto calculado con costos reales por SKU desde Shopify.`
          : pl.cogsMethod === 'mixed'
            ? `Costo del producto: ${pl.cogsCoveredPct.toFixed(0)}% calculado con costos reales por SKU, el resto estimado al 30%. Configurá "Cost per Item" en Shopify para precisión total.`
            : data.client.hasShopify
              ? `Costo del producto estimado al 30% de margen. Configurá "Cost per Item" en tus variants de Shopify para usar costos reales por SKU.`
              : `Costo del producto estimado al 30% (sin tienda Shopify conectada). Conectá tu Shopify para usar costos reales y reportar margen exacto.`}
        {' '}EERR ad-only: solo refleja la economía de la pauta Meta. No incluye costos fijos del negocio, comisiones de pasarela ni envíos — eso lo cubre el informe Shopify.
      </Text>

      <Footer />
    </Page>
  );
}

// ================================================================
// 5 — Funnel TOFU/MOFU/BOFU
// ================================================================
const funnelStyles = StyleSheet.create({
  title: { fontFamily: fonts.serifBold, fontSize: sizes.h1, color: colors.navy, marginBottom: 6 },
  subtitle: { fontFamily: fonts.sansBold, fontSize: sizes.small, color: colors.meta, marginBottom: 22, letterSpacing: 1.2, textTransform: 'uppercase' },
  intro: { fontFamily: fonts.serif, fontSize: 11, lineHeight: 1.6, color: colors.textPrimary, marginBottom: 18 },
  emptyMsg: { fontFamily: fonts.serifItalic, fontSize: 10, color: colors.textMuted, padding: 14, backgroundColor: colors.bgSubtle, borderRadius: 3 },
  layerCards: { flexDirection: 'row', gap: 10, marginTop: 14 },
  layerCard: { flex: 1, padding: 12, borderRadius: 4, borderLeftWidth: 3 },
  layerLabel: { fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  layerStat: { fontFamily: fonts.sans, fontSize: 9, color: colors.textPrimary, marginBottom: 2 },
  layerStatBold: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.navy, marginTop: 4 },
});

export function FunnelStagePage({ data }: { data: MetaReportData }) {
  const layers = data.funnelLayers;
  const totalSpend = layers.reduce((s, l) => s + l.spend, 0);
  const hasFunnelData = totalSpend > 0;

  const chartLayers = layers.map((l) => ({
    stage: l.stage,
    label: FUNNEL_LABELS[l.stage].toUpperCase(),
    spend: l.spend,
    roas: l.roas,
    campaigns: l.campaignCount,
  }));

  return (
    <Page size="LETTER" style={pageStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={funnelStyles.subtitle}>Sección 03 · Funnel Strategy</Text>
      <Text style={funnelStyles.title}>Distribución por Etapa del Funnel</Text>

      <Text style={funnelStyles.intro}>
        Toda campaña Meta vive en una de tres etapas. <Text style={{ fontFamily: fonts.serifBold }}>TOFU</Text> es el público frío que recién te conoce. <Text style={{ fontFamily: fonts.serifBold }}>MOFU</Text> es quien ya te miró y considera comprar. <Text style={{ fontFamily: fonts.serifBold }}>BOFU</Text> es quien está cerca de pagar — retargeting puro. Un funnel sano tiene ROAS alto en BOFU, intermedio en MOFU y bajo (pero positivo a largo plazo) en TOFU.
      </Text>

      {!hasFunnelData ? (
        <Text style={funnelStyles.emptyMsg}>
          Sin spend distribuido por funnel en el período. Apenas activemos campañas con objetivos definidos vamos a poder mostrar la distribución.
        </Text>
      ) : (
        <>
          <FunnelChartMeta layers={chartLayers} width={480} height={220} />

          <View style={funnelStyles.layerCards}>
            {layers.map((l) => (
              <View
                key={l.stage}
                style={[
                  funnelStyles.layerCard,
                  { borderLeftColor: FUNNEL_COLORS[l.stage], backgroundColor: colors.bgSubtle },
                ]}
              >
                <Text style={[funnelStyles.layerLabel, { color: FUNNEL_COLORS[l.stage] }]}>
                  {FUNNEL_LABELS[l.stage]}
                </Text>
                <Text style={funnelStyles.layerStat}>{l.campaignCount} campañas</Text>
                <Text style={funnelStyles.layerStat}>Inversión: {formatCurrency(l.spend)}</Text>
                <Text style={funnelStyles.layerStat}>Ventas: {formatCurrency(l.revenue)}</Text>
                <Text style={funnelStyles.layerStatBold}>ROAS {l.roas > 0 ? `${l.roas.toFixed(2)}x` : '—'}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Footer />
    </Page>
  );
}
