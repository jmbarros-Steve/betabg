import React from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import {
  colors,
  fonts,
  sizes,
  formatCurrency,
  formatPercent,
  formatNumber,
  formatCompact,
  FUNNEL_COLORS,
  FUNNEL_LABELS,
} from './theme.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { BCGMatrix, FrequencyTable, HBarChart, ConversionFunnelChart } from './charts.js';
import type { MetaReportData } from './data.js';

const baseStyle = StyleSheet.create({
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
  subtitle: { fontFamily: fonts.sansBold, fontSize: sizes.small, color: colors.meta, marginBottom: 6, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontFamily: fonts.serifBold, fontSize: sizes.h1, color: colors.navy, marginBottom: 18 },
  intro: { fontFamily: fonts.serif, fontSize: 10.5, lineHeight: 1.55, color: colors.textPrimary, marginBottom: 16 },
  sectionTitle: { fontFamily: fonts.serifBold, fontSize: sizes.h3, color: colors.navy, marginTop: 14, marginBottom: 8 },
  sectionCaption: { fontFamily: fonts.sans, fontSize: sizes.micro, color: colors.textMuted, marginBottom: 8 },
  emptyMsg: { fontFamily: fonts.serifItalic, fontSize: 10, color: colors.textMuted, padding: 14, backgroundColor: colors.bgSubtle, borderRadius: 3 },
  disclaimer: { fontFamily: fonts.serifItalic, fontSize: sizes.micro, color: colors.textMuted, marginTop: 8 },
});

// ================================================================
// 6 — BCG Matrix de campañas
// ================================================================
const bcgStyles = StyleSheet.create({
  legendGrid: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  legendCard: { width: '48%', padding: 10, borderRadius: 3, borderLeftWidth: 3, backgroundColor: colors.bgSubtle, marginBottom: 6 },
  legendLabel: { fontFamily: fonts.sansBold, fontSize: 8, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 },
  legendIntro: { fontFamily: fonts.sansBold, fontSize: 8, color: colors.textSecondary, marginBottom: 6 },
  legendItem: { fontFamily: fonts.sans, fontSize: 8, color: colors.textPrimary, marginBottom: 2 },
  legendItemValue: { fontFamily: fonts.mono, fontSize: 7.5, color: colors.textMuted },
});

const QUADRANT_INFO: Record<'star' | 'question' | 'cow' | 'dog', { label: string; color: string; advice: string }> = {
  star: { label: '★ ESTRELLAS', color: colors.star, advice: 'Escalá fuerte — alto ROAS y ya tienen presupuesto.' },
  question: { label: '? PREGUNTAS', color: colors.question, advice: 'Subí presupuesto — alto ROAS pero gastaste poco.' },
  cow: { label: '$ VACAS', color: colors.cow, advice: 'Manteneles el spend — performance estable.' },
  dog: { label: '↓ PERROS', color: colors.dog, advice: 'Pausá ya — ROAS bajo break-even.' },
};

export function BCGPage({ data }: { data: MetaReportData }) {
  const campaigns = data.campaigns;

  const items = campaigns.map((c) => ({
    name: c.campaignName,
    spend: c.spend,
    roas: c.roas,
    quadrant: c.bcgQuadrant,
  }));

  const byQuadrant = (q: 'star' | 'question' | 'cow' | 'dog') =>
    campaigns
      .filter((c) => c.bcgQuadrant === q)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 3);

  return (
    <Page size="LETTER" style={baseStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={baseStyle.subtitle}>Sección 04 · Performance por Campaña</Text>
      <Text style={baseStyle.title}>Matriz BCG de Campañas</Text>

      <Text style={baseStyle.intro}>
        Cada burbuja es una campaña. El tamaño es la inversión. La posición horizontal indica cuánto gastaste; la vertical, qué tan bien convirtió. Las líneas punteadas marcan los thresholds: ROAS 3x es buen performance, ROAS 1.5x es break-even, debajo perdés plata.
      </Text>

      {campaigns.length < 4 ? (
        <Text style={baseStyle.emptyMsg}>
          La matriz BCG necesita al menos 4 campañas activas en el período para clasificar correctamente. Vas a verla apenas crezca el mix.
        </Text>
      ) : (
        <>
          <BCGMatrix items={items} width={480} height={280} />

          <View style={bcgStyles.legendGrid}>
            {(['star', 'question', 'cow', 'dog'] as const).map((q) => {
              const info = QUADRANT_INFO[q];
              const top = byQuadrant(q);
              return (
                <View key={q} style={[bcgStyles.legendCard, { borderLeftColor: info.color }]}>
                  <Text style={[bcgStyles.legendLabel, { color: info.color }]}>{info.label}</Text>
                  <Text style={bcgStyles.legendIntro}>{info.advice}</Text>
                  {top.length === 0 ? (
                    <Text style={bcgStyles.legendItem}>· (sin campañas)</Text>
                  ) : (
                    top.map((c, i) => (
                      <View key={i} style={{ marginBottom: 2 }}>
                        <Text style={bcgStyles.legendItem}>
                          · {c.campaignName.length > 32 ? c.campaignName.slice(0, 32) + '…' : c.campaignName}
                        </Text>
                        <Text style={bcgStyles.legendItemValue}>
                          {'   '}{formatCurrency(c.spend)} · ROAS {c.roas.toFixed(2)}x
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}

      <Footer />
    </Page>
  );
}

// ================================================================
// 7 — Fatiga
// ================================================================
const fatigueStyles = StyleSheet.create({
  alertBox: { padding: 12, backgroundColor: colors.bgWarm, borderLeftWidth: 3, borderLeftColor: colors.fatigueRed, marginBottom: 14, borderRadius: 3 },
  alertLabel: { fontFamily: fonts.sansBold, fontSize: 9, color: colors.fatigueRed, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  alertText: { fontFamily: fonts.serif, fontSize: 11, color: colors.textPrimary, lineHeight: 1.5 },
  legendRow: { flexDirection: 'row', gap: 12, marginTop: 10, marginBottom: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: fonts.sans, fontSize: 8, color: colors.textSecondary },
  recoBox: { padding: 12, backgroundColor: colors.bgSubtle, borderLeftWidth: 3, borderLeftColor: colors.meta, marginTop: 14 },
  recoLabel: { fontFamily: fonts.sansBold, fontSize: 9, color: colors.meta, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  recoText: { fontFamily: fonts.serif, fontSize: 10.5, color: colors.textPrimary, lineHeight: 1.5 },
});

export function FatiguePage({ data }: { data: MetaReportData }) {
  const sortedByFreq = [...data.campaigns]
    .filter((c) => c.frequency > 0 && c.spend > 0)
    .sort((a, b) => b.frequency - a.frequency);

  const fatigueCount = sortedByFreq.filter((c) => c.frequency >= 3).length;
  const borderlineCount = sortedByFreq.filter((c) => c.frequency >= 2 && c.frequency < 3).length;
  const avgFreq = data.current.frequency;

  return (
    <Page size="LETTER" style={baseStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={baseStyle.subtitle}>Sección 05 · Saturación de Audiencia</Text>
      <Text style={baseStyle.title}>Fatiga Creativa</Text>

      <Text style={baseStyle.intro}>
        Frecuencia es cuántas veces, en promedio, vio tu publicidad cada persona alcanzada. Sobre 3 ya empieza a quemarte la audiencia: el CTR cae, el CPM sube y la gente te empieza a ignorar (o peor, a esconderte).
      </Text>

      {sortedByFreq.length === 0 ? (
        <Text style={baseStyle.emptyMsg}>
          Sin data de frecuencia en el período. Aparecerá automáticamente cuando las campañas tengan al menos 7 días de impresiones.
        </Text>
      ) : (
        <>
          <View style={fatigueStyles.alertBox}>
            <Text style={fatigueStyles.alertLabel}>Resumen del período</Text>
            <Text style={fatigueStyles.alertText}>
              Frecuencia promedio: <Text style={{ fontFamily: fonts.serifBold }}>{avgFreq.toFixed(2)}</Text>.{' '}
              <Text style={{ fontFamily: fonts.serifBold, color: colors.fatigueRed }}>{fatigueCount} campañas en fatiga</Text> (frecuencia ≥ 3) y{' '}
              <Text style={{ fontFamily: fonts.serifBold, color: colors.fatigueAmber }}>{borderlineCount} al borde</Text> (entre 2 y 3).
            </Text>
          </View>

          <View style={fatigueStyles.legendRow}>
            <View style={fatigueStyles.legendItem}>
              <View style={[fatigueStyles.legendDot, { backgroundColor: colors.fatigueGreen }]} />
              <Text style={fatigueStyles.legendText}>Sano · &lt;2</Text>
            </View>
            <View style={fatigueStyles.legendItem}>
              <View style={[fatigueStyles.legendDot, { backgroundColor: colors.fatigueAmber }]} />
              <Text style={fatigueStyles.legendText}>Borderline · 2–3</Text>
            </View>
            <View style={fatigueStyles.legendItem}>
              <View style={[fatigueStyles.legendDot, { backgroundColor: colors.fatigueRed }]} />
              <Text style={fatigueStyles.legendText}>Fatiga · &gt;3</Text>
            </View>
          </View>

          <FrequencyTable
            campaigns={sortedByFreq.map((c) => ({
              name: c.campaignName,
              frequency: c.frequency,
              spend: c.spend,
              reach: c.reach,
            }))}
            width={480}
          />

          {fatigueCount > 0 && (
            <View style={fatigueStyles.recoBox}>
              <Text style={fatigueStyles.recoLabel}>Acción recomendada</Text>
              <Text style={fatigueStyles.recoText}>
                Refrescá creativos esta semana en las {fatigueCount} campañas en fatiga: cambiá imagen + hook + 1ra línea de copy. Si la audiencia ya se queman 4+ veces, expandí la segmentación o duplicá el adset con look-alikes nuevos.
              </Text>
            </View>
          )}
        </>
      )}

      <Footer />
    </Page>
  );
}

// ================================================================
// 8 — Audience breakdowns (3 columnas)
// ================================================================
const audienceStyles = StyleSheet.create({
  threeCol: { flexDirection: 'row', gap: 12, marginTop: 12 },
  col: { flex: 1 },
  colTitle: { fontFamily: fonts.serifBold, fontSize: 11, color: colors.navy, marginBottom: 6 },
  colCaption: { fontFamily: fonts.sans, fontSize: sizes.micro, color: colors.textMuted, marginBottom: 6 },
});

export function AudiencePage({ data }: { data: MetaReportData }) {
  const b = data.breakdowns;
  const hasAnyData = b.ageGender.length > 0 || b.country.length > 0 || b.placement.length > 0;

  return (
    <Page size="LETTER" style={baseStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={baseStyle.subtitle}>Sección 06 · Audiencia</Text>
      <Text style={baseStyle.title}>¿Quién te está comprando?</Text>

      {!hasAnyData ? (
        <Text style={baseStyle.emptyMsg}>
          {b.fetchError || 'Activá tu cuenta Meta y dejá correr las campañas algunos días para que aparezca el desglose por edad, género, país y placement.'}
        </Text>
      ) : (
        <>
          <Text style={baseStyle.intro}>
            Top 5 segmentos por inversión en cada dimensión. La barra navy es spend, el caption a la derecha es ROAS o conversiones según corresponda. Si una segmentación pesa el 70% del spend pero rinde la mitad del promedio, tenés un problema de mix.
          </Text>

          <View style={audienceStyles.threeCol}>
            <View style={audienceStyles.col}>
              <Text style={audienceStyles.colTitle}>Por edad y género</Text>
              {b.ageGender.length === 0 ? (
                <Text style={baseStyle.emptyMsg}>Sin data.</Text>
              ) : (
                <HBarChart
                  data={b.ageGender.map((r) => ({
                    label: r.label,
                    value: r.spend,
                    sublabel: r.roas > 0 ? `ROAS ${r.roas.toFixed(1)}x` : `${r.clicks} clicks`,
                  }))}
                  valueFormatter={(v) => formatCompact(v)}
                  width={155}
                  rowHeight={20}
                />
              )}
            </View>
            <View style={audienceStyles.col}>
              <Text style={audienceStyles.colTitle}>Por país</Text>
              {b.country.length === 0 ? (
                <Text style={baseStyle.emptyMsg}>Sin data.</Text>
              ) : (
                <HBarChart
                  data={b.country.map((r) => ({
                    label: r.label,
                    value: r.spend,
                    sublabel: r.roas > 0 ? `ROAS ${r.roas.toFixed(1)}x` : `${r.clicks} clicks`,
                  }))}
                  valueFormatter={(v) => formatCompact(v)}
                  width={155}
                  rowHeight={20}
                  barColor={colors.meta}
                />
              )}
            </View>
            <View style={audienceStyles.col}>
              <Text style={audienceStyles.colTitle}>Por placement</Text>
              {b.placement.length === 0 ? (
                <Text style={baseStyle.emptyMsg}>Sin data.</Text>
              ) : (
                <HBarChart
                  data={b.placement.map((r) => ({
                    label: r.label,
                    value: r.spend,
                    sublabel: r.roas > 0 ? `ROAS ${r.roas.toFixed(1)}x` : `${r.clicks} clicks`,
                  }))}
                  valueFormatter={(v) => formatCompact(v)}
                  width={155}
                  rowHeight={20}
                  barColor={colors.tofu}
                />
              )}
            </View>
          </View>

          <Text style={baseStyle.disclaimer}>
            Datos extraídos en tiempo real de Meta /insights API con breakdowns. Si una sección queda vacía es porque la cuenta no tiene permisos suficientes o no hubo impresiones en esa dimensión durante el período.
          </Text>
        </>
      )}

      <Footer />
    </Page>
  );
}

// ================================================================
// 9 — Conversion Funnel (Impressions → Purchase)
// ================================================================
const cfStyles = StyleSheet.create({
  warningBox: { marginTop: 14, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.warning, backgroundColor: colors.bgWarm, borderRadius: 3 },
  warningLabel: { fontFamily: fonts.sansBold, fontSize: 9, color: colors.warning, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 },
  warningText: { fontFamily: fonts.serif, fontSize: 10, color: colors.textPrimary, lineHeight: 1.5 },
});

export function ConversionFunnelPage({ data }: { data: MetaReportData }) {
  const cf = data.conversionFunnel;

  // ATC y Checkout solo se muestran si stagesEstimated=true (la heurística
  // dio resultados razonables). Si stagesEstimated=false (purchase/clicks
  // muy bajo), omitimos ATC/Checkout para no mostrar "1.0% pasa" absurdos.
  const stages = [
    { label: 'Impresiones', value: cf.impressions },
    { label: 'Clicks', value: cf.clicks, dropOffPct: cf.ctr },
    ...(cf.stagesEstimated && cf.addToCart > 0
      ? [
          { label: 'Add to Cart', value: cf.addToCart, dropOffPct: cf.clickToCart },
          { label: 'Checkout', value: cf.initiatedCheckout, dropOffPct: cf.cartToCheckout },
        ]
      : []),
    { label: 'Compra', value: cf.purchase, dropOffPct: cf.stagesEstimated ? cf.checkoutToPurchase : (cf.clicks > 0 ? (cf.purchase / cf.clicks) * 100 : 0) },
  ].filter((s) => s.value > 0);

  const ctrLow = cf.ctr > 0 && cf.ctr < 1;
  const checkoutLow = cf.checkoutToPurchase > 0 && cf.checkoutToPurchase < 60;

  return (
    <Page size="LETTER" style={baseStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={baseStyle.subtitle}>Sección 07 · Conversion Funnel</Text>
      <Text style={baseStyle.title}>De Impresión a Compra</Text>

      <Text style={baseStyle.intro}>
        El recorrido completo del usuario: cuánta gente vio, cuánta hizo click, cuánta agregó al carrito y cuánta terminó comprando. Cada drop-off es revenue que se está dejando en la mesa.
      </Text>

      {!cf.hasFunnelData || stages.length < 2 ? (
        <Text style={baseStyle.emptyMsg}>
          Sin data suficiente de impresiones+clicks para construir el funnel. Aparecerá apenas las campañas tengan tracción.
        </Text>
      ) : (
        <>
          <ConversionFunnelChart stages={stages} width={480} height={Math.max(180, stages.length * 44)} />

          {ctrLow && (
            <View style={cfStyles.warningBox}>
              <Text style={cfStyles.warningLabel}>CTR bajo benchmark</Text>
              <Text style={cfStyles.warningText}>
                Tu CTR de {formatPercent(cf.ctr, 2)} está debajo del 1% — el creativo no está enganchando. Probá nuevos hooks de las primeras 3 palabras del copy y refrescá la imagen principal.
              </Text>
            </View>
          )}
          {checkoutLow && (
            <View style={cfStyles.warningBox}>
              <Text style={cfStyles.warningLabel}>Drop-off de checkout alto</Text>
              <Text style={cfStyles.warningText}>
                Solo {formatPercent(cf.checkoutToPurchase, 1)} de quienes inician checkout terminan comprando. Revisá costos de envío, métodos de pago y largo del formulario — esto es el bug número uno de e-commerce LATAM.
              </Text>
            </View>
          )}

          <Text style={baseStyle.disclaimer}>
            {cf.pixelDetected
              ? cf.stagesEstimated
                ? 'Pixel detectado y reportando compras correctamente. Add to Cart y Checkout son estimaciones derivadas de la compra real con benchmarks de la industria — para tracking exacto de cada paso, valida que Conversions API esté activa además del Pixel browser.'
                : 'Pixel detectado y reportando compras. Omitimos Add to Cart y Checkout porque el ratio compra/clicks es bajo (típico de retargeting o tráfico ancho) — los benchmarks darían números engañosos. La compra y los clicks son datos directos de Meta.'
              : 'No detectamos compras en este período. Si vendiste y no aparecen, validá que el Pixel + Conversions API estén configurados en Shopify (Settings → Customer events). Sin tracking de compras, este reporte solo muestra impresiones y clicks.'}
          </Text>
        </>
      )}

      <Footer />
    </Page>
  );
}

// ================================================================
// 10 — Top Creatives
// ================================================================
const creativesStyles = StyleSheet.create({
  intro: { fontFamily: fonts.serif, fontSize: 10.5, lineHeight: 1.55, color: colors.textPrimary, marginBottom: 18 },
  creativeRow: { flexDirection: 'row', gap: 12, marginBottom: 14, padding: 10, backgroundColor: colors.bgSubtle, borderRadius: 4 },
  thumbBox: { width: 90, height: 112, backgroundColor: colors.cream, borderRadius: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: 90, height: 112, objectFit: 'cover' },
  thumbPlaceholder: { fontFamily: fonts.sansBold, fontSize: 8, color: colors.textMuted },
  body: { flex: 1, paddingLeft: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  rankBadge: { fontFamily: fonts.sansBold, fontSize: 8, color: '#FFFFFF', backgroundColor: colors.navy, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, letterSpacing: 1 },
  winnerBadge: { fontFamily: fonts.sansBold, fontSize: 8, color: '#FFFFFF', backgroundColor: colors.meta, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, letterSpacing: 1 },
  funnelBadge: { fontFamily: fonts.sansBold, fontSize: 7, color: '#FFFFFF', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 2, letterSpacing: 0.8 },
  creativeTitle: { fontFamily: fonts.serifBold, fontSize: 12, color: colors.navy, marginBottom: 3 },
  creativeCopy: { fontFamily: fonts.serif, fontSize: 9, color: colors.textPrimary, lineHeight: 1.4, marginBottom: 6 },
  metricsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  metric: { flexDirection: 'column' },
  metricLabel: { fontFamily: fonts.sans, fontSize: 6.5, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  metricValue: { fontFamily: fonts.serifBold, fontSize: 10, color: colors.navy },
});

export function TopCreativesPage({ data }: { data: MetaReportData }) {
  const creatives = data.topCreatives;
  // Solo marcar GANADOR si el #1 tiene ROAS > 0 (matchó a una campaña con
  // métricas reales). Si todos tienen 0, el ranking es arbitrario y poner
  // GANADOR confunde al cliente.
  const hasRealMetrics = creatives.length > 0 && (creatives[0].roas > 0 || creatives[0].spend > 0);

  return (
    <Page size="LETTER" style={baseStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={baseStyle.subtitle}>Sección 08 · Creativos</Text>
      <Text style={baseStyle.title}>{hasRealMetrics ? 'Top Creativos del Período' : 'Creativos del Catálogo'}</Text>

      {creatives.length === 0 ? (
        <Text style={baseStyle.emptyMsg}>
          Sin creativos en estado "en pauta" para el período. Subí imágenes y copy en el Estudio Creativo para que Steve los analice y los ranquee acá.
        </Text>
      ) : (
        <>
          <Text style={creativesStyles.intro}>
            {hasRealMetrics
              ? 'Los 3 creativos que mejor performaron en el período, rankeados por ROAS. El #1 es tu ganador — replicá su ángulo y formato en próximos ciclos. Si todos vienen del mismo cuadrante del funnel, conviene diversificar.'
              : 'Los creativos más recientes de tu catálogo. Todavía no podemos linkearlos a métricas de campaña porque los nombres no matchean — en cuanto activen ad_id real vas a ver ranking por ROAS acá.'}
          </Text>

          {creatives.map((c, i) => (
            <View key={c.id} style={creativesStyles.creativeRow}>
              <View style={creativesStyles.thumbBox}>
                {c.assetDataUri ? (
                  <Image src={c.assetDataUri} style={creativesStyles.thumbImg} />
                ) : (
                  <Text style={creativesStyles.thumbPlaceholder}>SIN IMAGEN</Text>
                )}
              </View>
              <View style={creativesStyles.body}>
                <View style={creativesStyles.badgeRow}>
                  {i === 0 && hasRealMetrics ? (
                    <Text style={creativesStyles.winnerBadge}>★ GANADOR</Text>
                  ) : (
                    <Text style={creativesStyles.rankBadge}>#{i + 1}</Text>
                  )}
                  {c.funnel ? (
                    <Text style={[creativesStyles.funnelBadge, { backgroundColor: FUNNEL_COLORS[c.funnel] }]}>
                      {FUNNEL_LABELS[c.funnel].split(' ')[0]}
                    </Text>
                  ) : null}
                  {c.angulo ? (
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 7, color: colors.textMuted, letterSpacing: 1 }}>
                      · {c.angulo.toUpperCase()}
                    </Text>
                  ) : null}
                </View>
                <Text style={creativesStyles.creativeTitle}>{c.title || 'Sin título'}</Text>
                <Text style={creativesStyles.creativeCopy}>
                  {c.copy ? (c.copy.length > 180 ? c.copy.slice(0, 180) + '…' : c.copy) : 'Sin copy.'}
                </Text>
                {hasRealMetrics && (
                  <View style={creativesStyles.metricsRow}>
                    <View style={creativesStyles.metric}>
                      <Text style={creativesStyles.metricLabel}>ROAS</Text>
                      <Text style={creativesStyles.metricValue}>{c.roas > 0 ? `${c.roas.toFixed(2)}x` : '—'}</Text>
                    </View>
                    <View style={creativesStyles.metric}>
                      <Text style={creativesStyles.metricLabel}>Inversión</Text>
                      <Text style={creativesStyles.metricValue}>{formatCurrency(c.spend)}</Text>
                    </View>
                    <View style={creativesStyles.metric}>
                      <Text style={creativesStyles.metricLabel}>Conversiones</Text>
                      <Text style={creativesStyles.metricValue}>{formatNumber(c.conversions)}</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          ))}

          {hasRealMetrics && (
            <Text style={baseStyle.disclaimer}>
              Match creativo→campaña por nombre fuzzy. En próximas iteraciones vamos a linkear cada creativo a su ad_id real para métricas exactas.
            </Text>
          )}
        </>
      )}

      <Footer />
    </Page>
  );
}

// ================================================================
// 11 — Recommendations (AI-generated)
// ================================================================
const recsStyles = StyleSheet.create({
  intro: { fontFamily: fonts.serif, fontSize: 10.5, lineHeight: 1.55, color: colors.textPrimary, marginBottom: 18 },
  rec: { marginBottom: 14, padding: 12, backgroundColor: colors.bgSubtle, borderLeftWidth: 3, borderRadius: 3 },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  recNum: { fontFamily: fonts.serifBold, fontSize: 14, color: colors.meta },
  priorityBadge: { fontFamily: fonts.sansBold, fontSize: 7, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, letterSpacing: 1, color: '#FFFFFF' },
  recAction: { fontFamily: fonts.serifBold, fontSize: 11.5, color: colors.navy, marginBottom: 6, lineHeight: 1.4 },
  recRow: { flexDirection: 'row', marginBottom: 3 },
  recRowLabel: { fontFamily: fonts.sansBold, fontSize: 7.5, color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', width: 60 },
  recRowText: { fontFamily: fonts.serif, fontSize: 9.5, color: colors.textPrimary, flex: 1, lineHeight: 1.4 },
});

const PRIORITY_COLORS: Record<string, string> = {
  alta: colors.dog,
  media: colors.warning,
  baja: colors.tofu,
};

export function RecommendationsPage({ data }: { data: MetaReportData }) {
  const recs = data.recommendations;

  return (
    <Page size="LETTER" style={baseStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={baseStyle.subtitle}>Sección 09 · Plan de Acción</Text>
      <Text style={baseStyle.title}>Recomendaciones de Felipe</Text>

      <Text style={recsStyles.intro}>
        {recs.length} acciones priorizadas por impacto en plata. Las de prioridad alta son urgentes — esta semana. Las medias son del próximo ciclo. Las bajas son apuestas de fondo que mueven la aguja a 30+ días.
      </Text>

      {recs.length === 0 ? (
        <Text style={baseStyle.emptyMsg}>
          Sin recomendaciones generadas para este período (data insuficiente o servicio AI no disponible). Reintentá después de 7 días con campañas activas.
        </Text>
      ) : (
        recs.map((r, i) => {
          const color = PRIORITY_COLORS[r.priority] || colors.warning;
          return (
            <View key={i} style={[recsStyles.rec, { borderLeftColor: color }]}>
              <View style={recsStyles.recHeader}>
                <Text style={recsStyles.recNum}>{(i + 1).toString().padStart(2, '0')}</Text>
                <Text style={[recsStyles.priorityBadge, { backgroundColor: color }]}>
                  PRIORIDAD {r.priority.toUpperCase()}
                </Text>
              </View>
              <Text style={recsStyles.recAction}>{r.action}</Text>
              <View style={recsStyles.recRow}>
                <Text style={recsStyles.recRowLabel}>Por qué</Text>
                <Text style={recsStyles.recRowText}>{r.why}</Text>
              </View>
              <View style={recsStyles.recRow}>
                <Text style={recsStyles.recRowLabel}>Impacto</Text>
                <Text style={recsStyles.recRowText}>{r.expected_impact}</Text>
              </View>
            </View>
          );
        })
      )}

      <Footer />
    </Page>
  );
}

// ================================================================
// 12 — Next Steps
// ================================================================
const nextStepsStyles = StyleSheet.create({
  intro: { fontFamily: fonts.serif, fontSize: 10.5, lineHeight: 1.6, color: colors.textPrimary, marginBottom: 22 },
  step: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: colors.textDivider },
  checkbox: { width: 14, height: 14, borderWidth: 1, borderColor: colors.meta, borderRadius: 2, marginRight: 10, marginTop: 2 },
  stepBody: { flex: 1 },
  stepTitle: { fontFamily: fonts.serifBold, fontSize: 11, color: colors.navy, marginBottom: 2 },
  stepEta: { fontFamily: fonts.sansBold, fontSize: sizes.micro, color: colors.meta, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  stepText: { fontFamily: fonts.serif, fontSize: 9.5, lineHeight: 1.5, color: colors.textPrimary },
  closing: { fontFamily: fonts.serifItalic, fontSize: 10.5, color: colors.textSecondary, marginTop: 18, lineHeight: 1.55 },
});

export function NextStepsPage({ data }: { data: MetaReportData }) {
  const dynamicSteps: Array<{ eta: string; title: string; text: string }> = [];

  // 2-3 dinámicos según data
  const fatigueCount = data.campaigns.filter((c) => c.frequency >= 3).length;
  if (fatigueCount > 0) {
    dynamicSteps.push({
      eta: '7 días',
      title: `Refrescar creativos en ${fatigueCount} campañas en fatiga`,
      text: 'Cambiá imagen + hook + 1ra línea de copy. Si freq sigue >3 después de 1 semana, expandí audiencia.',
    });
  }

  const dogs = data.campaigns.filter((c) => c.bcgQuadrant === 'dog' && c.spend > 0);
  if (dogs.length > 0) {
    dynamicSteps.push({
      eta: '3 días',
      title: `Pausar ${dogs.length} campaña${dogs.length > 1 ? 's' : ''} con ROAS bajo break-even`,
      text: `${formatCurrency(dogs.reduce((s, d) => s + d.spend, 0))} de spend que está perdiendo plata. Reasignar a las top 3 campañas.`,
    });
  }

  const stars = data.campaigns.filter((c) => c.bcgQuadrant === 'star');
  if (stars.length > 0) {
    dynamicSteps.push({
      eta: '14 días',
      title: `Escalar 20-30% el presupuesto de las ${stars.length} campañas estrella`,
      text: 'Subí en escalones del 20% cada 3 días para no romper el algoritmo de aprendizaje de Meta.',
    });
  }

  // Estáticos siempre presentes
  const staticSteps: Array<{ eta: string; title: string; text: string }> = [
    {
      eta: '7 días',
      title: 'Revisar fatiga semanal en /analisis',
      text: 'Entrá al dashboard y filtrá por frecuencia descendente. Cualquier campaña >3 va a la cola de refresh.',
    },
    {
      eta: '14 días',
      title: 'Probar 2 ángulos creativos nuevos en TOFU',
      text: 'Diferenciá copy y hook. Mantené presupuestos chicos primero ($5-10k CLP) y matá los que no levantan en 4 días.',
    },
    {
      eta: '30 días',
      title: 'Validar tracking de Conversions API',
      text: 'Verificá que el Pixel + CAPI estén deduplicando bien los purchases. Sin ese tracking limpio, Meta optimiza ciego.',
    },
  ];

  const allSteps = [...dynamicSteps, ...staticSteps].slice(0, 7);

  return (
    <Page size="LETTER" style={baseStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />

      <Text style={baseStyle.subtitle}>Sección 10 · Próximos Pasos</Text>
      <Text style={baseStyle.title}>El Plan del Próximo Mes</Text>

      <Text style={nextStepsStyles.intro}>
        Checklist con los próximos movimientos. Cada paso tiene ETA propio. En el próximo informe revisamos cuáles se ejecutaron y qué impacto tuvieron.
      </Text>

      {allSteps.map((s, i) => (
        <View key={i} style={nextStepsStyles.step}>
          <View style={nextStepsStyles.checkbox} />
          <View style={nextStepsStyles.stepBody}>
            <Text style={nextStepsStyles.stepEta}>Próximos {s.eta}</Text>
            <Text style={nextStepsStyles.stepTitle}>{s.title}</Text>
            <Text style={nextStepsStyles.stepText}>{s.text}</Text>
          </View>
        </View>
      ))}

      <Text style={nextStepsStyles.closing}>
        Este informe se generó automáticamente con Steve Ads. La data viene directo de la API de Meta — sin intermediarios, sin maquillaje. Todo lo que ves acá lo podés validar en Ads Manager.
      </Text>

      <Footer />
    </Page>
  );
}
