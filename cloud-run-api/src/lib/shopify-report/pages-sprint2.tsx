import React from 'react';
import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, sizes, formatCurrency, formatPercent } from './theme.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { HeatmapChart, HBarChart, FunnelChart, BCGMatrix } from './charts.js';
import type { ReportData } from './data.js';

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
  subtitle: { fontFamily: fonts.sans, fontSize: sizes.small, color: colors.textMuted, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontFamily: fonts.serifBold, fontSize: sizes.h1, color: colors.navy, marginBottom: 18 },
  intro: { fontFamily: fonts.serif, fontSize: 10, lineHeight: 1.55, color: colors.textPrimary, marginBottom: 18 },
  sectionTitle: { fontFamily: fonts.serifBold, fontSize: sizes.h3, color: colors.navy, marginTop: 14, marginBottom: 8 },
  sectionCaption: { fontFamily: fonts.sans, fontSize: sizes.micro, color: colors.textMuted, marginBottom: 8 },
  emptyMsg: { fontFamily: fonts.serifItalic, fontSize: 10, color: colors.textMuted, padding: 14, backgroundColor: colors.bgSubtle, borderRadius: 3 },
  disclaimer: { fontFamily: fonts.serifItalic, fontSize: sizes.micro, color: colors.textMuted, marginTop: 8 },
});

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// ================================================================
// Sec 03 — Revenue Deep Dive
// ================================================================
export function RevenuePage({ data }: { data: ReportData }) {
  const s = data.sprint2;
  const peakDay = DAY_LABELS[s.revenueByDayHour.peakDay];
  const peakHour = s.revenueByDayHour.peakHour;
  const hasData = s.revenueByDayHour.peakRevenue > 0;

  return (
    <Page size="LETTER" style={baseStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />
      <Text style={baseStyle.subtitle}>Sección 03</Text>
      <Text style={baseStyle.title}>Revenue Deep Dive</Text>

      {!hasData ? (
        <Text style={baseStyle.emptyMsg}>
          No hay ventas registradas en el periodo. Los heatmaps se llenan automáticamente cuando empiece a haber tracción.
        </Text>
      ) : (
        <>
          <Text style={baseStyle.intro}>
            Tu mejor momento de venta del periodo fue <Text style={{ fontFamily: fonts.serifBold }}>{peakDay} a las {peakHour.toString().padStart(2, '0')}:00 hrs</Text>, con {formatCurrency(s.revenueByDayHour.peakRevenue)} en una sola hora. Usá esta info para programar lanzamientos y campañas.
          </Text>

          <Text style={baseStyle.sectionTitle}>Distribución por día y hora</Text>
          <Text style={baseStyle.sectionCaption}>Más oscuro = más ventas. Eje horizontal: 0h a 23h.</Text>
          <HeatmapChart matrix={s.revenueByDayHour.matrix} width={480} height={180} />
        </>
      )}

      {s.channels.length > 0 && (
        <>
          <Text style={baseStyle.sectionTitle}>Canales de venta</Text>
          <Text style={baseStyle.sectionCaption}>De dónde vienen tus pedidos.</Text>
          <HBarChart
            data={s.channels.map((c) => ({
              label: c.label,
              value: c.revenue,
              sublabel: `${c.orders} pedidos · ${c.share.toFixed(0)}%`,
            }))}
            valueFormatter={formatCurrency}
            width={480}
          />
        </>
      )}

      {s.topCities.length > 0 && (
        <>
          <Text style={baseStyle.sectionTitle}>Top ciudades</Text>
          <HBarChart
            data={s.topCities.map((c) => ({
              label: `${c.city}${c.country ? ` (${c.country})` : ''}`,
              value: c.revenue,
              sublabel: `${c.orders} pedidos`,
            }))}
            valueFormatter={formatCurrency}
            width={480}
          />
        </>
      )}

      <Footer />
    </Page>
  );
}

// ================================================================
// Sec 04 — Análisis de Producto + matriz BCG
// ================================================================
const productStyles = StyleSheet.create({
  table: { marginTop: 8 },
  row: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: colors.textDivider },
  rowHeader: { flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.navy },
  col: { fontFamily: fonts.sans, fontSize: 9, color: colors.textPrimary },
  colMuted: { fontFamily: fonts.sans, fontSize: 8, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  bcgBadge: { fontFamily: fonts.sansBold, fontSize: 7, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, color: colors.paper },
  staleSection: { marginTop: 18, padding: 12, backgroundColor: colors.bgSubtle, borderLeftWidth: 3, borderLeftColor: colors.warning },
  staleTitle: { fontFamily: fonts.serifBold, fontSize: sizes.h3, color: colors.navy, marginBottom: 4 },
  staleIntro: { fontFamily: fonts.serif, fontSize: 9, color: colors.textPrimary, marginBottom: 8 },
});

const QUADRANT_COLORS = {
  star: colors.positive,
  cow: colors.accent,
  question: colors.warning,
  dog: colors.negative,
};
const QUADRANT_LABELS = {
  star: 'ESTRELLA',
  cow: 'VACA',
  question: 'INTERROGANTE',
  dog: 'PERRO',
};

export function ProductPage({ data }: { data: ReportData }) {
  const products = data.sprint2.productBreakdown.slice(0, 12);
  const stale = data.sprint2.staleProducts;
  const totalStaleValue = stale.reduce((s, p) => s + p.stockValue, 0);

  return (
    <Page size="LETTER" style={baseStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />
      <Text style={baseStyle.subtitle}>Sección 04</Text>
      <Text style={baseStyle.title}>Análisis de Producto</Text>

      {products.length === 0 ? (
        <Text style={baseStyle.emptyMsg}>
          No hay ventas en el periodo para construir el análisis de producto. Aparecerá automáticamente con la primera venta.
        </Text>
      ) : (
        <>
          <Text style={baseStyle.intro}>
            Los <Text style={{ fontFamily: fonts.serifBold }}>{products.length}</Text> productos que vendiste en el periodo, ordenados por revenue. La matriz BCG clasifica cada uno en estrella (alto revenue + alto margen), vaca (alto revenue, margen menor), interrogante (bajo revenue, margen alto) o perro (bajo revenue + bajo margen).
          </Text>

          {products.length >= 4 ? (
            <>
              <Text style={baseStyle.sectionTitle}>Matriz BCG</Text>
              <BCGMatrix
                items={products.map((p) => ({
                  title: p.title,
                  revenue: p.revenue,
                  marginPct: p.marginPct,
                  quadrant: p.bcgQuadrant,
                }))}
                width={480}
                height={240}
              />
            </>
          ) : (
            <View style={{ marginTop: 8, padding: 12, backgroundColor: colors.bgSubtle, borderLeftWidth: 3, borderLeftColor: colors.accent }}>
              <Text style={{ fontFamily: fonts.serifItalic, fontSize: 9, color: colors.textSecondary }}>
                La matriz BCG necesita al menos 4 productos vendidos en el periodo para clasificar correctamente. Aparecerá automáticamente cuando tu mix de ventas crezca.
              </Text>
            </View>
          )}

          <Text style={baseStyle.sectionTitle}>Top productos por revenue</Text>
          <View style={productStyles.table}>
            <View style={productStyles.rowHeader}>
              <Text style={[productStyles.colMuted, { flex: 4 }]}>Producto</Text>
              <Text style={[productStyles.colMuted, { width: 50, textAlign: 'right' }]}>Unid.</Text>
              <Text style={[productStyles.colMuted, { width: 80, textAlign: 'right' }]}>Revenue neto</Text>
              <Text style={[productStyles.colMuted, { width: 60, textAlign: 'right' }]}>Margen</Text>
              {products.length >= 4 && <Text style={[productStyles.colMuted, { width: 70, textAlign: 'right' }]}>Tipo</Text>}
            </View>
            {products.slice(0, 10).map((p, i) => (
              <View key={i} style={productStyles.row}>
                <Text style={[productStyles.col, { flex: 4 }]}>{p.title.length > 38 ? p.title.slice(0, 38) + '…' : p.title}</Text>
                <Text style={[productStyles.col, { width: 50, textAlign: 'right' }]}>{p.unitsSold}</Text>
                <Text style={[productStyles.col, { width: 80, textAlign: 'right', fontFamily: fonts.mono }]}>{formatCurrency(p.revenue)}</Text>
                <Text style={[productStyles.col, { width: 60, textAlign: 'right' }]}>{formatPercent(p.marginPct)}</Text>
                {products.length >= 4 && (
                  <Text style={[productStyles.bcgBadge, { width: 60, textAlign: 'center', backgroundColor: QUADRANT_COLORS[p.bcgQuadrant] }]}>
                    {QUADRANT_LABELS[p.bcgQuadrant]}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </>
      )}

      {stale.length > 0 && (
        <View style={productStyles.staleSection}>
          <Text style={productStyles.staleTitle}>Productos sin movimiento</Text>
          <Text style={productStyles.staleIntro}>
            {stale.length} productos con stock disponible no han vendido en los últimos 30 días. Total atrapado: <Text style={{ fontFamily: fonts.serifBold }}>{formatCurrency(totalStaleValue)}</Text>. Considerá descuento, bundle o discontinuar.
          </Text>
          {stale.slice(0, 5).map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', paddingVertical: 2 }}>
              <Text style={[productStyles.col, { flex: 4 }]}>· {p.title.length > 50 ? p.title.slice(0, 50) + '…' : p.title}</Text>
              <Text style={[productStyles.col, { width: 90, textAlign: 'right', fontFamily: fonts.mono }]}>{formatCurrency(p.stockValue)}</Text>
            </View>
          ))}
        </View>
      )}

      <Footer />
    </Page>
  );
}

// ================================================================
// Sec 05 — Funnel & Conversión
// ================================================================
export function FunnelPage({ data }: { data: ReportData }) {
  const f = data.sprint2.funnel;
  const stages = [
    { label: 'Sesiones', value: f.sessions ?? 0, sublabel: 'datos no disponibles' },
    { label: 'Add to Cart', value: f.addToCart ?? 0, sublabel: 'datos no disponibles' },
    { label: 'Checkouts', value: f.checkouts },
    { label: 'Compras', value: f.purchases },
  ].filter((s) => s.value > 0 || s.label === 'Compras' || s.label === 'Checkouts');

  return (
    <Page size="LETTER" style={baseStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />
      <Text style={baseStyle.subtitle}>Sección 05</Text>
      <Text style={baseStyle.title}>Funnel & Conversión</Text>

      <Text style={baseStyle.intro}>
        De cuántas personas que llegaron a checkout, cuántas terminaron comprando. La diferencia es revenue que se está dejando en la mesa.
      </Text>

      {f.purchases === 0 && f.checkouts === 0 ? (
        <Text style={baseStyle.emptyMsg}>
          No hay actividad de checkout en el periodo. El funnel se llena automáticamente cuando lleguen pedidos.
        </Text>
      ) : (
        <>
          <FunnelChart stages={stages} width={480} height={Math.max(120, stages.length * 38)} />

          <View style={{ flexDirection: 'row', marginTop: 18, gap: 14 }}>
            <View style={{ flex: 1, padding: 12, backgroundColor: colors.bgSubtle, borderLeftWidth: 3, borderLeftColor: f.abandonmentRate > 50 ? colors.negative : colors.warning }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 7, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>Tasa de abandono</Text>
              <Text style={{ fontFamily: fonts.serifBold, fontSize: 22, color: colors.navy, marginTop: 4 }}>
                {f.hasAbandonedData ? formatPercent(f.abandonmentRate) : '—'}
              </Text>
              <Text style={{ fontFamily: fonts.serifItalic, fontSize: 8, color: colors.textSecondary, marginTop: 4 }}>
                {!f.hasAbandonedData
                  ? 'Aún no se sincronizan carritos abandonados. Disponible en próximo informe.'
                  : f.abandonmentRate > 60 ? 'Alta — revisá el checkout, costos de envío y métodos de pago.'
                  : f.abandonmentRate > 30 ? 'En rango normal de e-commerce.'
                  : 'Excelente, mantenelo.'}
              </Text>
            </View>
            <View style={{ flex: 1, padding: 12, backgroundColor: colors.bgSubtle, borderLeftWidth: 3, borderLeftColor: colors.accent }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 7, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>Revenue abandonado</Text>
              <Text style={{ fontFamily: fonts.serifBold, fontSize: 22, color: colors.navy, marginTop: 4 }}>
                {f.hasAbandonedData ? formatCurrency(f.abandonedRevenue) : '—'}
              </Text>
              <Text style={{ fontFamily: fonts.serifItalic, fontSize: 8, color: colors.textSecondary, marginTop: 4 }}>
                {f.hasAbandonedData
                  ? 'En carritos sin completar. Una secuencia de recuperación bien hecha rescata 10-15% de esto.'
                  : 'Conectá la sincronización de checkouts para ver el dinero que dejaste en la mesa.'}
              </Text>
            </View>
          </View>

          <Text style={baseStyle.disclaimer}>
            * Sessions y Add to Cart no se incluyen porque Shopify no expone esos datos vía API estándar. Se sumarán cuando conectes Google Analytics 4 (Sprint 3).
          </Text>
        </>
      )}

      <Footer />
    </Page>
  );
}

// ================================================================
// Sec 06 — Marketing Performance
// ================================================================
const mktStyles = StyleSheet.create({
  platformCard: { marginBottom: 14, padding: 14, borderWidth: 0.5, borderColor: colors.textDivider, borderRadius: 4 },
  platformHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  platformName: { fontFamily: fonts.serifBold, fontSize: sizes.h3, color: colors.navy },
  roasBadge: { fontFamily: fonts.sansBold, fontSize: 9, color: colors.paper, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  metric: { flex: 1, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: colors.bgSubtle, borderRadius: 2 },
  metricLabel: { fontFamily: fonts.sans, fontSize: 6.5, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  metricValue: { fontFamily: fonts.serifBold, fontSize: 11, color: colors.navy, marginTop: 1 },
  campaignsRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  campaignBox: { flex: 1, padding: 8, backgroundColor: colors.bgCard, borderWidth: 0.5, borderColor: colors.textDivider, borderRadius: 2 },
  campaignLabel: { fontFamily: fonts.sansBold, fontSize: 7, color: colors.textMuted, letterSpacing: 1, marginBottom: 3 },
  campaignName: { fontFamily: fonts.sans, fontSize: 8, color: colors.textPrimary, marginBottom: 2 },
  campaignRoas: { fontFamily: fonts.serifBold, fontSize: 10, color: colors.navy },
});

export function MarketingPage({ data }: { data: ReportData }) {
  const marketing = data.sprint2.marketing;
  const breakEven = data.sprint2.breakEvenRoas;

  return (
    <Page size="LETTER" style={baseStyle.page}>
      <Header shopName={data.client.name} logoUrl={data.client.logo_url} periodStart={data.period.start} periodEnd={data.period.end} />
      <Text style={baseStyle.subtitle}>Sección 06</Text>
      <Text style={baseStyle.title}>Marketing Performance</Text>

      {marketing.length === 0 ? (
        <Text style={baseStyle.emptyMsg}>
          No hay plataformas de ads conectadas con métricas en el periodo. Conectá Meta Ads o Google Ads para empezar a medir ROAS, CAC y eficiencia de campañas.
        </Text>
      ) : (
        <>
          <Text style={baseStyle.intro}>
            Tu break-even ROAS es <Text style={{ fontFamily: fonts.serifBold }}>{breakEven.toFixed(2)}x</Text> — debajo de eso estás perdiendo plata, arriba estás ganando. Esa es la línea que importa.
          </Text>

          {marketing.map((m, i) => {
            const aboveBreakEven = m.roas >= breakEven;
            return (
              <View key={i} style={mktStyles.platformCard}>
                <View style={mktStyles.platformHeader}>
                  <Text style={mktStyles.platformName}>{m.platform === 'meta' ? 'Meta Ads' : 'Google Ads'}</Text>
                  <Text style={[mktStyles.roasBadge, { backgroundColor: aboveBreakEven ? colors.positive : colors.negative }]}>
                    ROAS {m.roas.toFixed(2)}x {aboveBreakEven ? '▲' : '▼'}
                  </Text>
                </View>

                <View style={mktStyles.metricsRow}>
                  <View style={mktStyles.metric}>
                    <Text style={mktStyles.metricLabel}>Inversión</Text>
                    <Text style={mktStyles.metricValue}>{formatCurrency(m.spend)}</Text>
                  </View>
                  <View style={mktStyles.metric}>
                    <Text style={mktStyles.metricLabel}>Revenue</Text>
                    <Text style={mktStyles.metricValue}>{formatCurrency(m.revenue)}</Text>
                  </View>
                  <View style={mktStyles.metric}>
                    <Text style={mktStyles.metricLabel}>CAC</Text>
                    <Text style={mktStyles.metricValue}>{m.cac > 0 ? formatCurrency(m.cac) : '—'}</Text>
                  </View>
                  <View style={mktStyles.metric}>
                    <Text style={mktStyles.metricLabel}>CTR</Text>
                    <Text style={mktStyles.metricValue}>{formatPercent(m.ctr, 2)}</Text>
                  </View>
                  <View style={mktStyles.metric}>
                    <Text style={mktStyles.metricLabel}>CPM</Text>
                    <Text style={mktStyles.metricValue}>{formatCurrency(m.cpm)}</Text>
                  </View>
                </View>

                {(m.bestCampaign || m.worstCampaign) && (
                  <View style={mktStyles.campaignsRow}>
                    {m.bestCampaign && (
                      <View style={mktStyles.campaignBox}>
                        <Text style={[mktStyles.campaignLabel, { color: colors.positive }]}>★ MEJOR CAMPAÑA</Text>
                        <Text style={mktStyles.campaignName}>{m.bestCampaign.name.length > 28 ? m.bestCampaign.name.slice(0, 28) + '…' : m.bestCampaign.name}</Text>
                        <Text style={mktStyles.campaignRoas}>ROAS {m.bestCampaign.roas.toFixed(2)}x · {formatCurrency(m.bestCampaign.spend)}</Text>
                      </View>
                    )}
                    {m.worstCampaign && (
                      <View style={mktStyles.campaignBox}>
                        <Text style={[mktStyles.campaignLabel, { color: colors.negative }]}>↓ PEOR CAMPAÑA</Text>
                        <Text style={mktStyles.campaignName}>{m.worstCampaign.name.length > 28 ? m.worstCampaign.name.slice(0, 28) + '…' : m.worstCampaign.name}</Text>
                        <Text style={mktStyles.campaignRoas}>ROAS {m.worstCampaign.roas.toFixed(2)}x · {formatCurrency(m.worstCampaign.spend)}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      <Footer />
    </Page>
  );
}
