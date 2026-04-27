import React from 'react';
import { Svg, Rect, Line, Text as SvgText, G, Circle } from '@react-pdf/renderer';
import { colors, fonts } from './theme.js';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// ================================================================
// Heatmap día × hora
// ================================================================
export function HeatmapChart({
  matrix,
  width = 480,
  height = 180,
}: {
  matrix: number[][];
  width?: number;
  height?: number;
}) {
  const days = 7;
  const hours = 24;
  const labelW = 28;
  const labelH = 14;
  const cellW = (width - labelW) / hours;
  const cellH = (height - labelH) / days;

  const flat = matrix.flat();
  const max = Math.max(...flat, 1);

  const colorFor = (v: number) => {
    if (v === 0) return colors.bgSubtle;
    const t = Math.min(1, v / max);
    // Gradient cream → navy: interpolar simple
    const r = Math.round(245 - (245 - 11) * t);
    const g = Math.round(240 - (240 - 31) * t);
    const b = Math.round(232 - (232 - 58) * t);
    return `rgb(${r},${g},${b})`;
  };

  return (
    <Svg width={width} height={height}>
      {/* Hour labels (top) */}
      {[0, 6, 12, 18].map((h) => (
        <SvgText
          key={`h${h}`}
          x={labelW + h * cellW + cellW / 2}
          y={10}
          style={{ fontFamily: fonts.sans, fontSize: 7, fill: colors.textMuted }}
          textAnchor="middle"
        >
          {`${h.toString().padStart(2, '0')}h`}
        </SvgText>
      ))}

      {/* Day rows */}
      {DAY_LABELS.map((day, dIdx) => (
        <G key={day}>
          <SvgText
            x={labelW - 4}
            y={labelH + dIdx * cellH + cellH / 2 + 3}
            style={{ fontFamily: fonts.sans, fontSize: 7, fill: colors.textSecondary }}
            textAnchor="end"
          >
            {day}
          </SvgText>
          {Array.from({ length: hours }, (_, h) => (
            <Rect
              key={`${dIdx}-${h}`}
              x={labelW + h * cellW}
              y={labelH + dIdx * cellH}
              width={cellW - 1}
              height={cellH - 1}
              fill={colorFor(matrix[dIdx][h])}
            />
          ))}
        </G>
      ))}
    </Svg>
  );
}

// ================================================================
// Horizontal bar chart con label + valor
// ================================================================
export function HBarChart({
  data,
  width = 480,
  rowHeight = 18,
  valueFormatter,
}: {
  data: Array<{ label: string; value: number; sublabel?: string }>;
  width?: number;
  rowHeight?: number;
  valueFormatter?: (v: number) => string;
}) {
  if (data.length === 0) return null;
  const labelW = 130;
  const valueW = 70;
  const barW = width - labelW - valueW - 8;
  const max = Math.max(...data.map((d) => d.value), 1);
  const height = data.length * rowHeight;
  const fmt = valueFormatter || ((v) => v.toLocaleString('es-CL'));

  return (
    <Svg width={width} height={height}>
      {data.map((d, i) => {
        const w = (d.value / max) * barW;
        return (
          <G key={i}>
            <SvgText
              x={labelW - 6}
              y={i * rowHeight + 11}
              style={{ fontFamily: fonts.sans, fontSize: 8, fill: colors.textPrimary }}
              textAnchor="end"
            >
              {d.label.length > 22 ? d.label.slice(0, 22) + '…' : d.label}
            </SvgText>
            <Rect
              x={labelW}
              y={i * rowHeight + 4}
              width={Math.max(w, 1)}
              height={rowHeight - 8}
              fill={colors.navy}
              rx={1}
            />
            <SvgText
              x={labelW + w + 5}
              y={i * rowHeight + 11}
              style={{ fontFamily: fonts.sansBold, fontSize: 8, fill: colors.navy }}
              textAnchor="start"
            >
              {fmt(d.value)}
            </SvgText>
            {d.sublabel ? (
              <SvgText
                x={width - 2}
                y={i * rowHeight + 11}
                style={{ fontFamily: fonts.sans, fontSize: 7, fill: colors.textMuted }}
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
// Funnel chart (vertical, 4 stages)
// ================================================================
export function FunnelChart({
  stages,
  width = 480,
  height = 200,
}: {
  stages: Array<{ label: string; value: number; sublabel?: string }>;
  width?: number;
  height?: number;
}) {
  if (stages.length === 0) return null;
  const max = Math.max(...stages.map((s) => s.value), 1);
  const stageH = height / stages.length;
  const labelW = 140;
  const maxBarW = width - labelW;
  const centerX = labelW + maxBarW / 2;

  return (
    <Svg width={width} height={height}>
      {stages.map((s, i) => {
        const w = (s.value / max) * maxBarW;
        const y = i * stageH;
        const conversionPct = i > 0 && stages[i - 1].value > 0 ? (s.value / stages[i - 1].value) * 100 : null;
        return (
          <G key={i}>
            <Rect
              x={centerX - w / 2}
              y={y + 4}
              width={Math.max(w, 1)}
              height={stageH - 8}
              fill={colors.navy}
              rx={2}
            />
            <SvgText
              x={labelW - 6}
              y={y + stageH / 2 + 4}
              style={{ fontFamily: fonts.sansBold, fontSize: 9, fill: colors.textPrimary }}
              textAnchor="end"
            >
              {s.label}
            </SvgText>
            <SvgText
              x={centerX}
              y={y + stageH / 2 + 4}
              style={{ fontFamily: fonts.serifBold, fontSize: 11, fill: colors.cream }}
              textAnchor="middle"
            >
              {s.value.toLocaleString('es-CL')}
            </SvgText>
            {conversionPct !== null ? (
              <SvgText
                x={width - 2}
                y={y + stageH / 2 + 4}
                style={{ fontFamily: fonts.sans, fontSize: 8, fill: colors.textMuted }}
                textAnchor="end"
              >
                {`${conversionPct.toFixed(1)}% pasa`}
              </SvgText>
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
}

// ================================================================
// BCG Matrix (scatter 2x2)
// ================================================================
export function BCGMatrix({
  items,
  width = 480,
  height = 260,
}: {
  items: Array<{ title: string; revenue: number; marginPct: number; quadrant: 'star' | 'cow' | 'question' | 'dog' }>;
  width?: number;
  height?: number;
}) {
  if (items.length === 0) return null;
  const padding = 28;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const maxRev = Math.max(...items.map((i) => i.revenue), 1);
  const realMaxMargin = Math.max(...items.map((i) => i.marginPct));
  const realMinMargin = Math.min(...items.map((i) => i.marginPct));
  // Padding del rango para que los puntos no caigan en el borde exacto.
  const span = realMaxMargin - realMinMargin || 20;
  const maxMargin = realMaxMargin + span * 0.1;
  const minMargin = realMinMargin - span * 0.1;
  const marginRange = maxMargin - minMargin || 1;

  const xFor = (rev: number) => padding + (rev / maxRev) * innerW;
  const yFor = (m: number) => padding + (1 - (m - minMargin) / marginRange) * innerH;

  const quadrantColors: Record<string, string> = {
    star: colors.positive,
    cow: colors.accent,
    question: colors.warning,
    dog: colors.negative,
  };

  // Crosshairs (median lines)
  const midX = padding + innerW / 2;
  const midY = padding + innerH / 2;

  return (
    <Svg width={width} height={height}>
      {/* Quadrant labels */}
      <SvgText x={padding + innerW * 0.75} y={padding + 12} style={{ fontFamily: fonts.sansBold, fontSize: 8, fill: colors.positive }} textAnchor="middle">★ ESTRELLAS</SvgText>
      <SvgText x={padding + innerW * 0.25} y={padding + 12} style={{ fontFamily: fonts.sansBold, fontSize: 8, fill: colors.warning }} textAnchor="middle">? INTERROGANTES</SvgText>
      <SvgText x={padding + innerW * 0.75} y={padding + innerH - 4} style={{ fontFamily: fonts.sansBold, fontSize: 8, fill: colors.accent }} textAnchor="middle">$ VACAS</SvgText>
      <SvgText x={padding + innerW * 0.25} y={padding + innerH - 4} style={{ fontFamily: fonts.sansBold, fontSize: 8, fill: colors.negative }} textAnchor="middle">↓ PERROS</SvgText>

      {/* Axes */}
      <Line x1={padding} y1={padding + innerH} x2={padding + innerW} y2={padding + innerH} strokeWidth={0.5} stroke={colors.textDivider} />
      <Line x1={padding} y1={padding} x2={padding} y2={padding + innerH} strokeWidth={0.5} stroke={colors.textDivider} />

      {/* Median crosshairs */}
      <Line x1={midX} y1={padding} x2={midX} y2={padding + innerH} strokeWidth={0.5} stroke={colors.textDivider} strokeDasharray="2 2" />
      <Line x1={padding} y1={midY} x2={padding + innerW} y2={midY} strokeWidth={0.5} stroke={colors.textDivider} strokeDasharray="2 2" />

      {/* Axis labels */}
      <SvgText x={padding + innerW / 2} y={height - 4} style={{ fontFamily: fonts.sans, fontSize: 7, fill: colors.textMuted }} textAnchor="middle">→ Revenue (mayor a la derecha)</SvgText>
      <SvgText x={4} y={padding + innerH / 2} style={{ fontFamily: fonts.sans, fontSize: 7, fill: colors.textMuted }} transform={`rotate(-90, 4, ${padding + innerH / 2})`} textAnchor="middle">↑ Margen %</SvgText>

      {/* Data points */}
      {items.slice(0, 20).map((item, i) => (
        <Circle
          key={i}
          cx={xFor(item.revenue)}
          cy={yFor(item.marginPct)}
          r={3}
          fill={quadrantColors[item.quadrant]}
        />
      ))}
    </Svg>
  );
}

