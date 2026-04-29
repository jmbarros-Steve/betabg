import React from 'react';
import { Svg, Rect, Line, Text as SvgText, G, Circle, Path, Polygon } from '@react-pdf/renderer';
import { colors, fonts, FUNNEL_COLORS } from './theme.js';
import type { FunnelStage } from './theme.js';

// ================================================================
// Spend vs Revenue daily line chart
// ================================================================
export function SpendRevenueChart({
  daily,
  width = 480,
  height = 130,
}: {
  daily: Array<{ date: string; spend: number; revenue: number }>;
  width?: number;
  height?: number;
}) {
  if (daily.length === 0) return null;
  const padding = 24;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const max = Math.max(...daily.map((d) => Math.max(d.spend, d.revenue)), 1);
  const stepX = daily.length > 1 ? innerW / (daily.length - 1) : 0;

  const yFor = (v: number) => padding + (1 - v / max) * innerH;
  const xFor = (i: number) => padding + i * stepX;

  const spendPath = daily.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(d.spend)}`).join(' ');
  const revenuePath = daily.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(d.revenue)}`).join(' ');

  return (
    <Svg width={width} height={height}>
      {/* Axes */}
      <Line x1={padding} y1={padding + innerH} x2={padding + innerW} y2={padding + innerH} strokeWidth={0.5} stroke={colors.textDivider} />

      {/* Revenue line (filled below) */}
      <Path d={revenuePath} stroke={colors.meta} strokeWidth={1.5} fill="none" />

      {/* Spend line */}
      <Path d={spendPath} stroke={colors.navy} strokeWidth={1.5} fill="none" />

      {/* Legend */}
      <Rect x={padding} y={4} width={8} height={2} fill={colors.navy} />
      <SvgText x={padding + 12} y={9} style={{ fontFamily: fonts.sans, fontSize: 7, fill: colors.textSecondary }}>Inversión</SvgText>
      <Rect x={padding + 60} y={4} width={8} height={2} fill={colors.meta} />
      <SvgText x={padding + 72} y={9} style={{ fontFamily: fonts.sans, fontSize: 7, fill: colors.textSecondary }}>Ventas atribuidas</SvgText>

      {/* Date hints */}
      <SvgText x={padding} y={height - 4} style={{ fontFamily: fonts.sans, fontSize: 6, fill: colors.textMuted }}>{daily[0]?.date}</SvgText>
      <SvgText x={padding + innerW} y={height - 4} style={{ fontFamily: fonts.sans, fontSize: 6, fill: colors.textMuted }} textAnchor="end">{daily[daily.length - 1]?.date}</SvgText>
    </Svg>
  );
}

// ================================================================
// BCG Matrix campañas — círculos por campaña, tamaño = spend
// ================================================================
const QUADRANT_COLORS_META: Record<string, string> = {
  star: colors.star,
  question: colors.question,
  cow: colors.cow,
  dog: colors.dog,
};

export function BCGMatrix({
  items,
  width = 480,
  height = 280,
}: {
  items: Array<{ name: string; spend: number; roas: number; quadrant: 'star' | 'question' | 'cow' | 'dog' | null }>;
  width?: number;
  height?: number;
}) {
  if (items.length === 0) return null;
  const padding = 36;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const maxSpend = Math.max(...items.map((i) => i.spend), 1);
  const maxRoas = Math.max(...items.map((i) => i.roas), 4);
  const minRoas = 0;

  const xFor = (spend: number) => padding + (spend / maxSpend) * innerW;
  const yFor = (roas: number) => padding + (1 - (roas - minRoas) / (maxRoas - minRoas || 1)) * innerH;
  const rFor = (spend: number) => Math.max(3, Math.min(14, 3 + (spend / maxSpend) * 11));

  const midX = padding + innerW * 0.5;
  const midYRoas3 = yFor(3); // ROAS 3 line
  const midYRoas15 = yFor(1.5); // ROAS 1.5 line

  return (
    <Svg width={width} height={height}>
      {/* Quadrant background tints */}
      <Rect x={padding} y={padding} width={innerW * 0.5} height={midYRoas3 - padding} fill={colors.question} fillOpacity={0.06} />
      <Rect x={midX} y={padding} width={innerW * 0.5} height={midYRoas3 - padding} fill={colors.star} fillOpacity={0.08} />
      <Rect x={padding} y={midYRoas3} width={innerW * 0.5} height={midYRoas15 - midYRoas3} fill={colors.cow} fillOpacity={0.06} />
      <Rect x={midX} y={midYRoas3} width={innerW * 0.5} height={midYRoas15 - midYRoas3} fill={colors.cow} fillOpacity={0.10} />
      <Rect x={padding} y={midYRoas15} width={innerW} height={padding + innerH - midYRoas15} fill={colors.dog} fillOpacity={0.06} />

      {/* Quadrant labels */}
      <SvgText x={midX + innerW * 0.25} y={padding + 14} style={{ fontFamily: fonts.sansBold, fontSize: 9, fill: colors.star }} textAnchor="middle">★ ESTRELLAS</SvgText>
      <SvgText x={padding + innerW * 0.25} y={padding + 14} style={{ fontFamily: fonts.sansBold, fontSize: 9, fill: colors.question }} textAnchor="middle">? PREGUNTAS</SvgText>
      <SvgText x={midX + innerW * 0.25} y={midYRoas3 + 14} style={{ fontFamily: fonts.sansBold, fontSize: 9, fill: colors.cow }} textAnchor="middle">$ VACAS</SvgText>
      <SvgText x={padding + innerW * 0.25} y={midYRoas15 + 14} style={{ fontFamily: fonts.sansBold, fontSize: 9, fill: colors.dog }} textAnchor="middle">↓ PERROS</SvgText>

      {/* Median lines */}
      <Line x1={midX} y1={padding} x2={midX} y2={padding + innerH} strokeWidth={0.5} stroke={colors.textDivider} strokeDasharray="2 2" />
      <Line x1={padding} y1={midYRoas3} x2={padding + innerW} y2={midYRoas3} strokeWidth={0.5} stroke={colors.textDivider} strokeDasharray="2 2" />
      <Line x1={padding} y1={midYRoas15} x2={padding + innerW} y2={midYRoas15} strokeWidth={0.5} stroke={colors.textDivider} strokeDasharray="2 2" />

      {/* Axes */}
      <Line x1={padding} y1={padding + innerH} x2={padding + innerW} y2={padding + innerH} strokeWidth={0.5} stroke={colors.textPrimary} />
      <Line x1={padding} y1={padding} x2={padding} y2={padding + innerH} strokeWidth={0.5} stroke={colors.textPrimary} />

      {/* Axis labels */}
      <SvgText x={padding + innerW / 2} y={height - 6} style={{ fontFamily: fonts.sans, fontSize: 7, fill: colors.textMuted }} textAnchor="middle">→ Inversión</SvgText>
      <SvgText x={10} y={padding + innerH / 2} style={{ fontFamily: fonts.sans, fontSize: 7, fill: colors.textMuted }} transform={`rotate(-90, 10, ${padding + innerH / 2})`} textAnchor="middle">↑ ROAS</SvgText>

      {/* ROAS reference labels */}
      <SvgText x={padding - 4} y={midYRoas3 + 3} style={{ fontFamily: fonts.sans, fontSize: 6, fill: colors.textMuted }} textAnchor="end">3x</SvgText>
      <SvgText x={padding - 4} y={midYRoas15 + 3} style={{ fontFamily: fonts.sans, fontSize: 6, fill: colors.textMuted }} textAnchor="end">1.5x</SvgText>

      {/* Data points */}
      {items.slice(0, 30).map((item, i) => (
        <Circle
          key={i}
          cx={xFor(item.spend)}
          cy={yFor(Math.min(item.roas, maxRoas))}
          r={rFor(item.spend)}
          fill={item.quadrant ? QUADRANT_COLORS_META[item.quadrant] : colors.textMuted}
          fillOpacity={0.7}
          stroke={item.quadrant ? QUADRANT_COLORS_META[item.quadrant] : colors.textMuted}
          strokeWidth={0.8}
        />
      ))}
    </Svg>
  );
}

// ================================================================
// Funnel chart vertical (Meta TOFU/MOFU/BOFU)
// Pirámide invertida con colores por capa.
// ================================================================
export function FunnelChartMeta({
  layers,
  width = 480,
  height = 220,
}: {
  layers: Array<{ stage: FunnelStage; label: string; spend: number; roas: number; campaigns: number }>;
  width?: number;
  height?: number;
}) {
  if (layers.length === 0) return null;
  const padding = 28;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const layerH = innerH / layers.length;

  // Pirámide invertida: el más ancho arriba (TOFU)
  const widths = [innerW, innerW * 0.72, innerW * 0.44];

  return (
    <Svg width={width} height={height}>
      {layers.map((layer, i) => {
        const w = widths[i] || innerW * 0.4;
        const y = padding + i * layerH;
        const cx = padding + innerW / 2;
        const x = cx - w / 2;
        const trapezoidNext = widths[i + 1] || w;
        const xNext = cx - trapezoidNext / 2;
        const polyPoints = `${x},${y} ${x + w},${y} ${xNext + trapezoidNext},${y + layerH} ${xNext},${y + layerH}`;
        return (
          <G key={i}>
            <Polygon points={polyPoints} fill={FUNNEL_COLORS[layer.stage]} fillOpacity={0.85} />
            <SvgText
              x={cx}
              y={y + layerH / 2 - 3}
              style={{ fontFamily: fonts.sansBold, fontSize: 11, fill: '#FFFFFF' }}
              textAnchor="middle"
            >
              {layer.label}
            </SvgText>
            <SvgText
              x={cx}
              y={y + layerH / 2 + 10}
              style={{ fontFamily: fonts.sans, fontSize: 9, fill: '#FFFFFF' }}
              textAnchor="middle"
            >
              {layer.campaigns} campañas · ${Math.round(layer.spend).toLocaleString('es-CL')} · ROAS {layer.roas.toFixed(2)}x
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ================================================================
// Frequency Heatmap — tabla de campañas con color por frequency
// ================================================================
export function FrequencyTable({
  campaigns,
  width = 480,
  rowHeight = 18,
}: {
  campaigns: Array<{ name: string; frequency: number; spend: number; reach: number }>;
  width?: number;
  rowHeight?: number;
}) {
  if (campaigns.length === 0) return null;
  const data = campaigns.slice(0, 10);
  const height = (data.length + 1) * rowHeight;
  const colName = width * 0.42;
  const colFreq = width * 0.18;
  const colSpend = width * 0.20;
  const colReach = width * 0.20;

  const colorFor = (freq: number) => {
    if (freq >= 3) return colors.fatigueRed;
    if (freq >= 2) return colors.fatigueAmber;
    return colors.fatigueGreen;
  };

  return (
    <Svg width={width} height={height}>
      {/* Header */}
      <Rect x={0} y={0} width={width} height={rowHeight} fill={colors.bgSubtle} />
      <SvgText x={6} y={rowHeight - 6} style={{ fontFamily: fonts.sansBold, fontSize: 8, fill: colors.textPrimary }}>Campaña</SvgText>
      <SvgText x={colName + 4} y={rowHeight - 6} style={{ fontFamily: fonts.sansBold, fontSize: 8, fill: colors.textPrimary }}>Frecuencia</SvgText>
      <SvgText x={colName + colFreq + 4} y={rowHeight - 6} style={{ fontFamily: fonts.sansBold, fontSize: 8, fill: colors.textPrimary }}>Inversión</SvgText>
      <SvgText x={colName + colFreq + colSpend + 4} y={rowHeight - 6} style={{ fontFamily: fonts.sansBold, fontSize: 8, fill: colors.textPrimary }}>Alcance</SvgText>

      {data.map((c, i) => {
        const y = (i + 1) * rowHeight;
        const fillColor = colorFor(c.frequency);
        return (
          <G key={i}>
            <Rect x={0} y={y} width={width} height={rowHeight - 1} fill={fillColor} fillOpacity={0.12} />
            <SvgText x={6} y={y + rowHeight - 6} style={{ fontFamily: fonts.sans, fontSize: 8, fill: colors.textPrimary }}>
              {c.name.length > 38 ? c.name.slice(0, 38) + '…' : c.name}
            </SvgText>
            <Rect x={colName + 4} y={y + 4} width={28} height={rowHeight - 9} fill={fillColor} rx={2} />
            <SvgText x={colName + 18} y={y + rowHeight - 6} style={{ fontFamily: fonts.sansBold, fontSize: 8, fill: '#FFFFFF' }} textAnchor="middle">
              {c.frequency.toFixed(1)}
            </SvgText>
            <SvgText x={colName + colFreq + 4} y={y + rowHeight - 6} style={{ fontFamily: fonts.mono, fontSize: 8, fill: colors.textPrimary }}>
              ${Math.round(c.spend).toLocaleString('es-CL')}
            </SvgText>
            <SvgText x={colName + colFreq + colSpend + 4} y={y + rowHeight - 6} style={{ fontFamily: fonts.mono, fontSize: 8, fill: colors.textPrimary }}>
              {Math.round(c.reach).toLocaleString('es-CL')}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ================================================================
// Horizontal bar chart (audiencia, placement, country)
// ================================================================
export function HBarChart({
  data,
  width = 230,
  rowHeight = 18,
  valueFormatter,
  barColor,
}: {
  data: Array<{ label: string; value: number; sublabel?: string }>;
  width?: number;
  rowHeight?: number;
  valueFormatter?: (v: number) => string;
  barColor?: string;
}) {
  if (data.length === 0) return null;
  const labelW = 70;
  const valueW = 50;
  const barW = width - labelW - valueW - 6;
  const max = Math.max(...data.map((d) => d.value), 1);
  const height = data.length * rowHeight + 4;
  const fmt = valueFormatter || ((v) => v.toLocaleString('es-CL'));
  const fillColor = barColor || colors.navy;

  return (
    <Svg width={width} height={height}>
      {data.map((d, i) => {
        const w = (d.value / max) * barW;
        return (
          <G key={i}>
            <SvgText
              x={labelW - 4}
              y={i * rowHeight + 11}
              style={{ fontFamily: fonts.sans, fontSize: 7.5, fill: colors.textPrimary }}
              textAnchor="end"
            >
              {d.label.length > 18 ? d.label.slice(0, 18) + '…' : d.label}
            </SvgText>
            <Rect
              x={labelW}
              y={i * rowHeight + 4}
              width={Math.max(w, 1)}
              height={rowHeight - 8}
              fill={fillColor}
              fillOpacity={0.85}
              rx={1}
            />
            <SvgText
              x={labelW + w + 4}
              y={i * rowHeight + 11}
              style={{ fontFamily: fonts.sansBold, fontSize: 7, fill: colors.navy }}
              textAnchor="start"
            >
              {fmt(d.value)}
            </SvgText>
            {d.sublabel ? (
              <SvgText
                x={width - 2}
                y={i * rowHeight + 11}
                style={{ fontFamily: fonts.sans, fontSize: 6.5, fill: colors.textMuted }}
                textAnchor="end"
              >
                {d.sublabel}
              </SvgText>
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
}

// ================================================================
// Conversion Funnel vertical (impressions → clicks → cart → checkout → purchase)
// ================================================================
export function ConversionFunnelChart({
  stages,
  width = 480,
  height = 240,
}: {
  stages: Array<{ label: string; value: number; dropOffPct?: number }>;
  width?: number;
  height?: number;
}) {
  if (stages.length === 0) return null;
  const max = Math.max(...stages.map((s) => s.value), 1);
  const stageH = height / stages.length;
  const labelW = 110;
  const dropW = 70;
  const maxBarW = width - labelW - dropW;
  const cx = labelW + maxBarW / 2;

  return (
    <Svg width={width} height={height}>
      {stages.map((s, i) => {
        const w = (s.value / max) * maxBarW;
        const y = i * stageH;
        const stageColors = [colors.tofu, colors.tofu, colors.mofu, colors.mofu, colors.bofu];
        const fillColor = stageColors[i] || colors.navy;
        return (
          <G key={i}>
            {/* Label */}
            <SvgText
              x={labelW - 6}
              y={y + stageH / 2 + 3}
              style={{ fontFamily: fonts.sansBold, fontSize: 9, fill: colors.textPrimary }}
              textAnchor="end"
            >
              {s.label}
            </SvgText>
            {/* Bar */}
            <Rect
              x={cx - w / 2}
              y={y + 6}
              width={Math.max(w, 1)}
              height={stageH - 12}
              fill={fillColor}
              fillOpacity={0.88}
              rx={3}
            />
            {/* Value inside bar */}
            <SvgText
              x={cx}
              y={y + stageH / 2 + 3}
              style={{ fontFamily: fonts.serifBold, fontSize: 11, fill: '#FFFFFF' }}
              textAnchor="middle"
            >
              {s.value.toLocaleString('es-CL')}
            </SvgText>
            {/* Drop-off label */}
            {s.dropOffPct !== undefined && i > 0 && (
              <SvgText
                x={width - 4}
                y={y + stageH / 2 + 3}
                style={{ fontFamily: fonts.sans, fontSize: 8, fill: colors.textMuted }}
                textAnchor="end"
              >
                {`${s.dropOffPct.toFixed(1)}% pasa`}
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
}
