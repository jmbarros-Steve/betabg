import { jsPDF } from 'jspdf';
import logoImg from '@/assets/logo-steve.png';
import signatureImg from '@/assets/steve-signature.png';
import type { ReportData, AdPlatformPerformance, StrategySection } from './report-types';

// ── Color Palette ──────────────────────────────────────────────
const NAVY      = [30, 58, 123] as const;
const NAVY_DARK = [18, 38, 82] as const;
const NAVY_LIGHT= [45, 80, 160] as const;
const TEAL      = [6, 182, 212] as const;
const GREEN     = [16, 185, 129] as const;
const RED       = [239, 68, 68] as const;
const AMBER     = [245, 158, 11] as const;
const PURPLE    = [139, 92, 246] as const;
const GRAY      = [100, 116, 139] as const;
const GRAY_LIGHT= [226, 232, 240] as const;
const BG_CREAM  = [250, 251, 253] as const;
const WHITE     = [255, 255, 255] as const;
const BLACK     = [15, 23, 42] as const;

type RGB = readonly [number, number, number];

// ── Helpers ────────────────────────────────────────────────────
function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CL')}`;
}
function fmtShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString('es-CL')}`;
}
function fmtPct(n: number | undefined): string {
  if (n === undefined) return '-';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}
function formatDate(d: Date): string {
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function loadImg(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      if (!ctx) { reject(new Error('no ctx')); return; }
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = src;
  });
}

// ── PDF State ──────────────────────────────────────────────────
interface S {
  doc: jsPDF;
  y: number;
  pw: number;   // page width
  ph: number;   // page height
  m: number;    // margin
  cw: number;   // content width
}

function pageBreak(s: S, need: number) {
  if (s.y + need > s.ph - s.m - 12) {
    s.doc.addPage();
    s.y = s.m + 2;
    drawPageAccent(s);
  }
}

// ── Decorative Elements ────────────────────────────────────────

/** Left accent stripe on every page (except cover) */
function drawPageAccent(s: S) {
  s.doc.setFillColor(...NAVY);
  s.doc.rect(0, 0, 4, s.ph, 'F');
  // Top thin line
  s.doc.setFillColor(...TEAL);
  s.doc.rect(4, 0, s.pw - 4, 1.2, 'F');
}

/** Section header with colored bar + icon dot */
function drawSection(s: S, title: string, color: RGB = NAVY) {
  pageBreak(s, 18);
  s.y += 4;
  // Colored bar
  s.doc.setFillColor(...color);
  s.doc.roundedRect(s.m, s.y, s.cw, 9, 1.5, 1.5, 'F');
  // Title
  s.doc.setFontSize(11);
  s.doc.setFont('helvetica', 'bold');
  s.doc.setTextColor(...WHITE);
  s.doc.text(title.toUpperCase(), s.m + 5, s.y + 6.5);
  s.doc.setTextColor(...BLACK);
  s.y += 14;
}

/** Sub-section label */
function drawSubSection(s: S, title: string) {
  pageBreak(s, 12);
  s.y += 3;
  s.doc.setFontSize(9.5);
  s.doc.setFont('helvetica', 'bold');
  s.doc.setTextColor(...NAVY);
  s.doc.text(title, s.m, s.y);
  // thin underline
  s.doc.setDrawColor(...TEAL);
  s.doc.setLineWidth(0.4);
  s.doc.line(s.m, s.y + 1.5, s.m + s.doc.getTextWidth(title) + 2, s.y + 1.5);
  s.doc.setTextColor(...BLACK);
  s.y += 6;
}

// ── KPI Cards ──────────────────────────────────────────────────

function drawKPICard(
  s: S, x: number, y: number, w: number, h: number,
  label: string, value: string, change: number | undefined, accent: RGB
) {
  const d = s.doc;
  // Card bg
  d.setFillColor(...WHITE);
  d.roundedRect(x, y, w, h, 2.5, 2.5, 'F');
  // Shadow effect (subtle border)
  d.setDrawColor(...GRAY_LIGHT);
  d.setLineWidth(0.3);
  d.roundedRect(x, y, w, h, 2.5, 2.5, 'S');
  // Top accent bar
  d.setFillColor(...accent);
  d.roundedRect(x, y, w, 2.5, 2.5, 2.5, 'F');
  d.setFillColor(...accent);
  d.rect(x, y + 1.5, w, 1, 'F'); // fill the gap below rounded corners

  // Label
  d.setFontSize(6.5);
  d.setFont('helvetica', 'bold');
  d.setTextColor(...GRAY);
  d.text(label.toUpperCase(), x + w / 2, y + 9, { align: 'center' });

  // Value
  d.setFontSize(14);
  d.setFont('helvetica', 'bold');
  d.setTextColor(...BLACK);
  d.text(value, x + w / 2, y + 18.5, { align: 'center' });

  // Change badge
  if (change !== undefined) {
    const isPos = change >= 0;
    const badgeColor: RGB = isPos ? GREEN : RED;
    const txt = fmtPct(change);
    const tw = d.getTextWidth(txt) + 4;
    const bx = x + (w - tw) / 2;
    d.setFillColor(...badgeColor);
    d.roundedRect(bx, y + 21, tw, 5, 1.2, 1.2, 'F');
    d.setFontSize(6.5);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...WHITE);
    d.text(txt, x + w / 2, y + 24.8, { align: 'center' });
  }
  d.setTextColor(...BLACK);
}

// ── Bar Chart ──────────────────────────────────────────────────

function drawBarChart(
  s: S,
  data: { label: string; value: number }[],
  options: {
    width: number; height: number; color: RGB; label?: string;
    showValues?: boolean; x?: number;
  }
) {
  const { width, height, color, showValues = true } = options;
  const x0 = options.x ?? s.m;
  const d = s.doc;
  if (data.length === 0) return;

  pageBreak(s, height + 20);

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barAreaH = height - 10;
  const barW = Math.min((width - 4) / data.length - 1, 12);
  const gap = ((width - 4) - barW * data.length) / (data.length + 1);
  const baseY = s.y + barAreaH;

  // Background
  d.setFillColor(...BG_CREAM);
  d.roundedRect(x0, s.y - 2, width, height + 2, 2, 2, 'F');

  // Grid lines
  d.setDrawColor(230, 232, 238);
  d.setLineWidth(0.15);
  for (let i = 0; i <= 4; i++) {
    const gy = s.y + (barAreaH * i) / 4;
    d.line(x0 + 2, gy, x0 + width - 2, gy);
  }

  // Bars
  data.forEach((item, i) => {
    const barH = maxVal > 0 ? (item.value / maxVal) * (barAreaH - 4) : 0;
    const bx = x0 + gap + i * (barW + gap);
    const by = baseY - barH;

    // Bar with gradient effect (two rectangles)
    d.setFillColor(...color);
    d.roundedRect(bx, by, barW, barH, 1, 1, 'F');
    // Lighter top half for gradient feel
    d.setFillColor(
      Math.min(color[0] + 30, 255),
      Math.min(color[1] + 30, 255),
      Math.min(color[2] + 30, 255)
    );
    d.roundedRect(bx, by, barW, Math.min(barH * 0.4, barH), 1, 1, 'F');

    // Value on top
    if (showValues && item.value > 0) {
      d.setFontSize(5);
      d.setFont('helvetica', 'bold');
      d.setTextColor(...NAVY);
      d.text(fmtShort(item.value), bx + barW / 2, by - 1.5, { align: 'center' });
    }

    // Label at bottom
    d.setFontSize(4.5);
    d.setFont('helvetica', 'normal');
    d.setTextColor(...GRAY);
    const lbl = item.label.length > 6 ? item.label.slice(-5) : item.label;
    d.text(lbl, bx + barW / 2, baseY + 4, { align: 'center' });
  });

  d.setTextColor(...BLACK);
  s.y += height + 6;
}

// ── Horizontal Bar Chart ───────────────────────────────────────

function drawHorizontalBars(
  s: S,
  items: { label: string; value: number; color: RGB }[],
  width: number
) {
  if (items.length === 0) return;
  const barH = 6;
  const gap = 3;
  const labelW = 55;
  const totalH = items.length * (barH + gap) + 4;
  pageBreak(s, totalH);

  const d = s.doc;
  const maxVal = Math.max(...items.map(i => i.value), 1);
  const barMaxW = width - labelW - 30;

  items.forEach((item, i) => {
    const iy = s.y + i * (barH + gap);
    // Label
    d.setFontSize(7);
    d.setFont('helvetica', 'normal');
    d.setTextColor(...BLACK);
    const lbl = item.label.length > 28 ? item.label.substring(0, 26) + '..' : item.label;
    d.text(lbl, s.m, iy + barH - 1);

    // Bar bg
    d.setFillColor(240, 242, 245);
    d.roundedRect(s.m + labelW, iy, barMaxW, barH, 1.5, 1.5, 'F');

    // Bar fill
    const fillW = maxVal > 0 ? (item.value / maxVal) * barMaxW : 0;
    if (fillW > 0) {
      d.setFillColor(...item.color);
      d.roundedRect(s.m + labelW, iy, Math.max(fillW, 3), barH, 1.5, 1.5, 'F');
    }

    // Value
    d.setFontSize(6.5);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...NAVY);
    d.text(fmt(item.value), s.m + labelW + barMaxW + 2, iy + barH - 1);
  });

  d.setTextColor(...BLACK);
  s.y += totalH + 2;
}

// ── Donut Chart ────────────────────────────────────────────────

function drawDonut(
  s: S,
  slices: { label: string; value: number; color: RGB }[],
  cx: number, cy: number, r: number
) {
  const d = s.doc;
  const total = slices.reduce((sum, sl) => sum + sl.value, 0);
  if (total === 0) return;

  let startAngle = -Math.PI / 2;
  const innerR = r * 0.55;

  slices.forEach(slice => {
    const angle = (slice.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;

    // Draw arc using many small lines (jsPDF has no arc fill)
    d.setFillColor(...slice.color);
    const steps = Math.max(Math.ceil(angle / 0.05), 8);
    const points: [number, number][] = [];

    // Outer arc
    for (let i = 0; i <= steps; i++) {
      const a = startAngle + (angle * i) / steps;
      points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    // Inner arc (reverse)
    for (let i = steps; i >= 0; i--) {
      const a = startAngle + (angle * i) / steps;
      points.push([cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR]);
    }

    // Draw as filled polygon using triangles
    if (points.length > 2) {
      d.setFillColor(...slice.color);
      // Use lines to approximate filled shape
      for (let i = 1; i < points.length - 1; i++) {
        d.triangle(
          points[0][0], points[0][1],
          points[i][0], points[i][1],
          points[i + 1][0], points[i + 1][1],
          'F'
        );
      }
    }

    startAngle = endAngle;
  });

  // Center circle (white)
  d.setFillColor(...WHITE);
  const ciSteps = 36;
  for (let i = 0; i < ciSteps; i++) {
    const a1 = (i / ciSteps) * Math.PI * 2;
    const a2 = ((i + 1) / ciSteps) * Math.PI * 2;
    d.triangle(
      cx, cy,
      cx + Math.cos(a1) * innerR, cy + Math.sin(a1) * innerR,
      cx + Math.cos(a2) * innerR, cy + Math.sin(a2) * innerR,
      'F'
    );
  }

  // Center text
  d.setFontSize(8);
  d.setFont('helvetica', 'bold');
  d.setTextColor(...NAVY);
  d.text(fmt(total), cx, cy + 1, { align: 'center' });
  d.setFontSize(5);
  d.setFont('helvetica', 'normal');
  d.setTextColor(...GRAY);
  d.text('TOTAL', cx, cy + 5, { align: 'center' });
}

// ── Visual Funnel ──────────────────────────────────────────────

function drawFunnel(
  s: S,
  steps: { label: string; value: number | null; color: RGB }[]
) {
  const d = s.doc;
  const funnelH = 50;
  pageBreak(s, funnelH + 10);

  const validSteps = steps.filter(st => st.value != null && st.value > 0);
  if (validSteps.length === 0) return;

  const maxVal = validSteps[0].value!;
  const stepH = funnelH / validSteps.length;
  const maxW = s.cw * 0.7;
  const centerX = s.m + s.cw / 2;

  validSteps.forEach((step, i) => {
    const w = maxVal > 0 ? Math.max((step.value! / maxVal) * maxW, 20) : 20;
    const iy = s.y + i * stepH;

    // Funnel bar (centered)
    d.setFillColor(...step.color);
    d.roundedRect(centerX - w / 2, iy, w, stepH - 2, 2, 2, 'F');

    // Label + value
    d.setFontSize(7.5);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...WHITE);
    const txt = `${step.label}: ${step.value!.toLocaleString('es-CL')}`;
    d.text(txt, centerX, iy + stepH / 2 + 1, { align: 'center' });

    // Conversion arrow between steps
    if (i > 0 && validSteps[i - 1].value! > 0) {
      const rate = ((step.value! / validSteps[i - 1].value!) * 100).toFixed(1);
      d.setFontSize(6);
      d.setFont('helvetica', 'normal');
      d.setTextColor(...NAVY);
      d.text(`${rate}%`, centerX + w / 2 + 8, iy + 2);
    }
  });

  d.setTextColor(...BLACK);
  s.y += funnelH + 6;
}

// ── Pro Table ──────────────────────────────────────────────────

function drawTable(
  s: S,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  opts?: { alignRight?: number[]; headerColor?: RGB; compact?: boolean }
) {
  const rowH = opts?.compact ? 5.5 : 6.5;
  const headerH = opts?.compact ? 6.5 : 8;
  const ar = new Set(opts?.alignRight || []);
  const hColor = opts?.headerColor || NAVY;
  const d = s.doc;

  pageBreak(s, headerH + rowH * Math.min(rows.length, 3));

  // Header
  d.setFillColor(...hColor);
  d.roundedRect(s.m, s.y, s.cw, headerH, 1.5, 1.5, 'F');
  // Fill gap under rounded corners
  d.rect(s.m, s.y + 1.5, s.cw, headerH - 1.5, 'F');

  d.setFontSize(opts?.compact ? 6 : 7);
  d.setFont('helvetica', 'bold');
  d.setTextColor(...WHITE);
  let x = s.m + 3;
  headers.forEach((h, i) => {
    const align = ar.has(i) ? 'right' : 'left';
    const xp = align === 'right' ? x + colWidths[i] - 5 : x;
    d.text(h, xp, s.y + (headerH * 0.65), { align });
    x += colWidths[i];
  });
  s.y += headerH;

  // Rows
  d.setFont('helvetica', 'normal');
  d.setFontSize(opts?.compact ? 6 : 7);
  rows.forEach((row, ri) => {
    pageBreak(s, rowH);
    // Zebra
    if (ri % 2 === 0) {
      d.setFillColor(...BG_CREAM);
      d.rect(s.m, s.y, s.cw, rowH, 'F');
    }
    // Bottom border
    d.setDrawColor(240, 242, 245);
    d.setLineWidth(0.15);
    d.line(s.m, s.y + rowH, s.m + s.cw, s.y + rowH);

    d.setTextColor(...BLACK);
    let rx = s.m + 3;
    row.forEach((cell, i) => {
      const align = ar.has(i) ? 'right' : 'left';
      const xp = align === 'right' ? rx + colWidths[i] - 5 : rx;
      const maxC = Math.floor(colWidths[i] / 1.8);
      const txt = cell.length > maxC ? cell.substring(0, maxC - 2) + '..' : cell;
      // Bold for first column if it looks like a total
      if (i === 0 && (txt.startsWith('UTILIDAD') || txt.startsWith('Total') || txt === 'Margen Neto')) {
        d.setFont('helvetica', 'bold');
      } else {
        d.setFont('helvetica', 'normal');
      }
      d.text(txt, xp, s.y + rowH * 0.72, { align });
      rx += colWidths[i];
    });
    s.y += rowH;
  });
  s.y += 3;
}

// ── Metric Mini Card (inline) ──────────────────────────────────

function drawMiniMetric(s: S, x: number, y: number, label: string, value: string, color: RGB) {
  const d = s.doc;
  d.setFillColor(color[0], color[1], color[2], 0.1 as any);
  d.setFillColor(
    Math.min(color[0] + 180, 255),
    Math.min(color[1] + 180, 255),
    Math.min(color[2] + 180, 255)
  );
  d.roundedRect(x, y, 40, 16, 2, 2, 'F');
  // Left accent
  d.setFillColor(...color);
  d.rect(x, y + 2, 2, 12, 'F');

  d.setFontSize(5.5);
  d.setFont('helvetica', 'normal');
  d.setTextColor(...GRAY);
  d.text(label, x + 6, y + 5.5);

  d.setFontSize(9);
  d.setFont('helvetica', 'bold');
  d.setTextColor(...color);
  d.text(value, x + 6, y + 12.5);
  d.setTextColor(...BLACK);
}

// ── Footers ────────────────────────────────────────────────────

function addFooters(s: S) {
  const pages = s.doc.getNumberOfPages();
  for (let i = 2; i <= pages; i++) { // skip cover
    s.doc.setPage(i);
    // Bottom line
    s.doc.setDrawColor(...GRAY_LIGHT);
    s.doc.setLineWidth(0.3);
    s.doc.line(s.m, s.ph - 12, s.pw - s.m, s.ph - 12);
    // Footer text
    s.doc.setFontSize(6.5);
    s.doc.setFont('helvetica', 'normal');
    s.doc.setTextColor(...GRAY);
    s.doc.text('Steve Ads  |  Performance Marketing Report', s.m, s.ph - 8);
    s.doc.text(`${i} / ${pages}`, s.pw - s.m, s.ph - 8, { align: 'right' });
  }
}

// ════════════════════════════════════════════════════════════════
//  MAIN RENDERER
// ════════════════════════════════════════════════════════════════

export async function renderReportPDF(data: ReportData): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 16;
  const cw = pw - m * 2;
  const s: S = { doc, y: m, pw, ph, m, cw };

  const period = `${formatDate(data.dateRange.from)} — ${formatDate(data.dateRange.to)}`;

  // Load images
  let logoB64: string | null = null;
  let sigB64: string | null = null;
  try { logoB64 = await loadImg(logoImg); } catch { /* skip */ }
  try { sigB64 = await loadImg(signatureImg); } catch { /* skip */ }

  // ═══════════════════ PAGE 1: COVER ═══════════════════════════
  // Full navy background
  doc.setFillColor(...NAVY_DARK);
  doc.rect(0, 0, pw, ph, 'F');

  // Decorative geometric shapes
  doc.setFillColor(...NAVY_LIGHT);
  doc.circle(pw + 20, -20, 80, 'F');
  doc.setFillColor(40, 70, 145);
  doc.circle(-30, ph + 10, 60, 'F');

  // Teal accent line
  doc.setFillColor(...TEAL);
  doc.rect(pw * 0.15, 60, pw * 0.7, 1.5, 'F');

  // Logo (circular, centered, proper size)
  if (logoB64) {
    const logoSize = 36;
    doc.addImage(logoB64, 'PNG', (pw - logoSize) / 2, 72, logoSize, logoSize);
  }

  // Title area
  let coverY = 120;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEAL);
  doc.text('STEVE ADS', pw / 2, coverY, { align: 'center' });
  coverY += 12;

  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text('Informe de', pw / 2, coverY, { align: 'center' });
  coverY += 12;
  doc.text('Performance Marketing', pw / 2, coverY, { align: 'center' });
  coverY += 16;

  // Teal divider
  doc.setFillColor(...TEAL);
  doc.rect(pw * 0.35, coverY, pw * 0.3, 0.8, 'F');
  coverY += 10;

  // Client name
  doc.setFontSize(16);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 210, 230);
  doc.text(data.clientName, pw / 2, coverY, { align: 'center' });
  coverY += 10;

  // Period
  doc.setFontSize(11);
  doc.setTextColor(...TEAL);
  doc.text(period, pw / 2, coverY, { align: 'center' });

  // Bottom info
  doc.setFontSize(8);
  doc.setTextColor(120, 140, 170);
  doc.text('Confidencial  |  Preparado exclusivamente para el cliente', pw / 2, ph - 28, { align: 'center' });

  const today = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(`Generado: ${today}`, pw / 2, ph - 22, { align: 'center' });

  // ═══════════════════ PAGE 2: EXECUTIVE SUMMARY ═══════════════
  doc.addPage();
  s.y = m + 4;
  drawPageAccent(s);

  drawSection(s, 'Resumen Ejecutivo', NAVY);

  // KPI Cards — 3 columns x 2 rows
  const kpiAccents: RGB[] = [GREEN, NAVY, TEAL, AMBER, PURPLE, NAVY_LIGHT];
  const kpiData: { label: string; value: string; change?: number }[] = [
    { label: 'Ingresos', value: fmt(data.kpi.revenue), change: data.kpi.revenueChange },
    { label: 'Pedidos', value: data.kpi.orders.toLocaleString('es-CL'), change: data.kpi.ordersChange },
    { label: 'ROAS', value: `${data.kpi.roas.toFixed(2)}x`, change: data.kpi.roasChange },
    { label: 'Inversion Ads', value: fmt(data.kpi.adSpend), change: data.kpi.adSpendChange },
    { label: 'Ticket Promedio', value: fmt(data.kpi.aov), change: data.kpi.aovChange },
    { label: 'Margen Neto', value: `${data.kpi.netProfitMargin.toFixed(1)}%` },
  ];

  const cardW = (cw - 8) / 3;
  const cardH = 28;
  kpiData.forEach((kpi, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = m + col * (cardW + 4);
    const y = s.y + row * (cardH + 4);
    drawKPICard(s, x, y, cardW, cardH, kpi.label, kpi.value, kpi.change, kpiAccents[i]);
  });
  s.y += (cardH + 4) * 2 + 4;

  // Period reference
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);
  doc.text(`Periodo: ${period}  |  Variacion vs periodo anterior`, m, s.y);
  s.y += 6;

  // Ad Spend Breakdown donut (if we have platform data)
  if (data.adPlatforms.length > 0 || data.profitLoss.metaSpend > 0 || data.profitLoss.googleSpend > 0) {
    drawSubSection(s, 'Distribucion de Inversion Publicitaria');

    const donutSlices: { label: string; value: number; color: RGB }[] = [];
    if (data.profitLoss.metaSpend > 0) donutSlices.push({ label: 'Meta Ads', value: data.profitLoss.metaSpend, color: NAVY_LIGHT });
    if (data.profitLoss.googleSpend > 0) donutSlices.push({ label: 'Google Ads', value: data.profitLoss.googleSpend, color: TEAL });
    if (data.profitLoss.manualGoogleSpend > 0) donutSlices.push({ label: 'Google Manual', value: data.profitLoss.manualGoogleSpend, color: AMBER });

    if (donutSlices.length > 0) {
      pageBreak(s, 45);
      const donutR = 18;
      const donutCx = m + 28;
      const donutCy = s.y + donutR + 2;
      drawDonut(s, donutSlices, donutCx, donutCy, donutR);

      // Legend
      let ly = s.y + 6;
      donutSlices.forEach(sl => {
        doc.setFillColor(...sl.color);
        doc.circle(m + 60, ly, 1.8, 'F');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...BLACK);
        doc.text(`${sl.label}: ${fmt(sl.value)}`, m + 65, ly + 1.2);
        ly += 7;
      });

      s.y += donutR * 2 + 10;
    }
  }

  // ═══════════════════ SHOPIFY PAGES ═══════════════════════════
  if (data.shopify.topSkus.length > 0 || data.shopify.dailyBreakdown.length > 0) {
    doc.addPage();
    s.y = m + 4;
    drawPageAccent(s);

    drawSection(s, 'Shopify — Rendimiento E-commerce', GREEN);

    // Revenue bar chart
    if (data.shopify.dailyBreakdown.length > 0) {
      drawSubSection(s, 'Ingresos Diarios');
      const dailyBars = data.shopify.dailyBreakdown.map(d => ({
        label: d.date,
        value: d.revenue,
      }));
      // Show max 30 bars
      const barsToShow = dailyBars.length > 30 ? dailyBars.slice(-30) : dailyBars;
      drawBarChart(s, barsToShow, { width: cw, height: 45, color: GREEN });
    }

    // Top SKUs horizontal bars
    if (data.shopify.topSkus.length > 0) {
      drawSubSection(s, 'Top Productos por Ingreso');
      const skuBars = data.shopify.topSkus.slice(0, 8).map((sku, i) => ({
        label: sku.title,
        value: sku.revenue,
        color: [GREEN, TEAL, NAVY_LIGHT, PURPLE, AMBER][i % 5] as RGB,
      }));
      drawHorizontalBars(s, skuBars, cw);
    }

    // Funnel visual
    if (data.shopify.funnel) {
      const f = data.shopify.funnel;
      if (f.purchases > 0) {
        drawSubSection(s, 'Funnel de Conversion');
        const funnelSteps: { label: string; value: number | null; color: RGB }[] = [
          { label: 'Sesiones', value: f.sessions, color: NAVY },
          { label: 'Agregar al carrito', value: f.addToCarts, color: NAVY_LIGHT },
          { label: 'Checkout iniciado', value: f.checkoutsInitiated, color: TEAL },
          { label: 'Compras', value: f.purchases, color: GREEN },
        ];
        drawFunnel(s, funnelSteps);
      }
    }

    // Customer metrics + Abandoned carts side by side
    if (data.shopify.customerMetrics || data.shopify.abandonedCartsCount > 0) {
      pageBreak(s, 25);
      const halfW = (cw - 6) / 2;

      if (data.shopify.customerMetrics) {
        const cm = data.shopify.customerMetrics;
        drawMiniMetric(s, m, s.y, 'Conversion', `${cm.conversionRate.toFixed(1)}%`, TEAL);
        drawMiniMetric(s, m + 44, s.y, 'LTV Prom.', fmtShort(cm.averageLtv), NAVY);
        drawMiniMetric(s, m + 88, s.y, 'Clientes', cm.totalCustomers.toLocaleString('es-CL'), GREEN);
        drawMiniMetric(s, m + 132, s.y, 'Repeticion', `${cm.repeatCustomerRate.toFixed(0)}%`, PURPLE);
        s.y += 20;
      }

      if (data.shopify.abandonedCartsCount > 0) {
        pageBreak(s, 18);
        // Abandoned carts highlight box
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(m, s.y, cw, 16, 2, 2, 'F');
        doc.setFillColor(...AMBER);
        doc.rect(m, s.y + 2, 3, 12, 'F');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...AMBER);
        doc.text(`${data.shopify.abandonedCartsCount} Carritos Abandonados`, m + 8, s.y + 6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...BLACK);
        doc.text(
          `Valor: ${fmt(data.shopify.abandonedCartsValue)}  |  Recuperable (~12%): ${fmt(Math.round(data.shopify.abandonedCartsValue * 0.12))}`,
          m + 8, s.y + 12
        );
        s.y += 20;
      }
    }
  }

  // ═══════════════════ AD PLATFORMS ════════════════════════════
  for (const platform of data.adPlatforms) {
    renderAdPlatformPage(s, platform);
  }

  // ═══════════════════ P&L PAGE ════════════════════════════════
  doc.addPage();
  s.y = m + 4;
  drawPageAccent(s);

  drawSection(s, 'Estado de Resultados', NAVY);

  const pl = data.profitLoss;
  const plHeaders = ['Concepto', 'Monto (CLP)'];
  const plCols = [cw - 38, 38];

  // Build P&L rows
  const plRows: string[][] = [];
  plRows.push(['Ingresos Brutos', fmt(pl.grossRevenue)]);
  plRows.push(['  (-) IVA / Impuestos', `-${fmt(pl.grossRevenue - pl.netRevenue)}`]);
  plRows.push(['Ingresos Netos', fmt(pl.netRevenue)]);
  plRows.push(['  (-) Costo de Productos', `-${fmt(pl.costOfGoods)}`]);
  plRows.push(['Utilidad Bruta', fmt(pl.grossProfit)]);
  plRows.push(['', '']);
  if (pl.metaSpend > 0) plRows.push(['  (-) Meta Ads', `-${fmt(pl.metaSpend)}`]);
  if (pl.googleSpend > 0) plRows.push(['  (-) Google Ads', `-${fmt(pl.googleSpend)}`]);
  if (pl.manualGoogleSpend > 0) plRows.push(['  (-) Google Manual', `-${fmt(pl.manualGoogleSpend)}`]);
  plRows.push(['Total Inversion Publicitaria', `-${fmt(pl.totalAdSpend)}`]);
  plRows.push(['', '']);
  for (const item of pl.fixedCostItems) {
    plRows.push([`  (-) ${item.name}`, `-${fmt(item.amount)}`]);
  }
  if (pl.totalFixedCosts > 0) plRows.push(['Total Costos Fijos', `-${fmt(pl.totalFixedCosts)}`]);
  if (pl.paymentGatewayFees > 0) plRows.push(['  (-) Comision Pasarela de Pago', `-${fmt(pl.paymentGatewayFees)}`]);
  if (pl.shippingCosts > 0) plRows.push(['  (-) Costos de Envio', `-${fmt(pl.shippingCosts)}`]);
  if (pl.shopifyCommission > 0) plRows.push(['  (-) Comision Shopify', `-${fmt(pl.shopifyCommission)}`]);
  plRows.push(['', '']);
  plRows.push(['UTILIDAD NETA', fmt(pl.netProfit)]);
  plRows.push(['Margen Neto', `${pl.netProfitMargin.toFixed(1)}%`]);

  drawTable(s, plHeaders, plRows, plCols, { alignRight: [1] });

  // Profit highlight banner
  pageBreak(s, 16);
  const profitColor: RGB = pl.netProfit >= 0 ? GREEN : RED;
  doc.setFillColor(...profitColor);
  doc.roundedRect(m, s.y, cw, 13, 2.5, 2.5, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text(
    `Utilidad Neta: ${fmt(pl.netProfit)}  (${pl.netProfitMargin.toFixed(1)}%)`,
    pw / 2, s.y + 9, { align: 'center' }
  );
  s.y += 20;

  // ═══════════════════ RECOMMENDATIONS PAGE ════════════════════
  if (data.insights.length > 0) {
    doc.addPage();
    s.y = m + 4;
    drawPageAccent(s);

    drawSection(s, 'Recomendaciones de Steve', PURPLE);

    const insightColors: RGB[] = [NAVY, TEAL, GREEN, AMBER, PURPLE];

    data.insights.forEach((insight, idx) => {
      pageBreak(s, 35);

      const acColor = insightColors[idx % insightColors.length];

      // Card
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...GRAY_LIGHT);
      doc.setLineWidth(0.3);

      const titleLines = doc.splitTextToSize(insight.title, cw - 18);
      const msgLines = doc.splitTextToSize(insight.message, cw - 18);
      const actLines = doc.splitTextToSize(`Accion recomendada: ${insight.action}`, cw - 18);
      const cardH = 10 + titleLines.length * 4.5 + msgLines.length * 3.8 + actLines.length * 3.8 + 4;

      doc.roundedRect(m, s.y, cw, cardH, 2.5, 2.5, 'FD');

      // Left accent bar
      doc.setFillColor(...acColor);
      doc.roundedRect(m, s.y, 3.5, cardH, 2.5, 2.5, 'F');
      doc.rect(m + 2, s.y, 1.5, cardH, 'F');

      // Number badge
      doc.setFillColor(...acColor);
      doc.circle(m + 12, s.y + 8, 4, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...WHITE);
      doc.text(String(idx + 1), m + 12, s.y + 9.5, { align: 'center' });

      let iy = s.y + 7;

      // Title
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...acColor);
      for (const line of titleLines) {
        doc.text(line, m + 20, iy);
        iy += 4.5;
      }
      iy += 2;

      // Message
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...BLACK);
      for (const line of msgLines) {
        doc.text(line, m + 10, iy);
        iy += 3.8;
      }
      iy += 2;

      // Action
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GREEN);
      for (const line of actLines) {
        doc.text(line, m + 10, iy);
        iy += 3.8;
      }

      s.y += cardH + 5;
    });

    // Steve signature
    if (sigB64) {
      pageBreak(s, 30);
      s.y += 5;
      doc.addImage(sigB64, 'PNG', pw - m - 50, s.y, 45, 18);
      s.y += 22;
    }
  }

  // ═══════════════════ STRATEGY PAGES ════════════════════════
  if (data.strategy) {
    renderStrategyBundles(s, data.strategy);
    renderStrategyMetaAds(s, data.strategy);
    renderStrategyGoogleAds(s, data.strategy);
    renderStrategyEmailFlows(s, data.strategy);
    renderStrategyProjections(s, data.strategy);
  }

  // ═══════════════════ GLOSSARY PAGE ═══════════════════════════
  renderGlossary(s);

  // ═══════════════════ FOOTERS ═════════════════════════════════
  addFooters(s);

  // ═══════════════════ SAVE ═══════════════════════════════════
  const ts = new Date().toISOString().split('T')[0];
  const safeName = data.clientName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
  doc.save(`Steve_Reporte_${safeName}_${ts}.pdf`);
}

// ── Ad Platform Page ───────────────────────────────────────────

// ── Strategy: Bundles Page ───────────────────────────────────

function renderStrategyBundles(s: S, strategy: StrategySection) {
  if (strategy.bundles.length === 0) return;

  s.doc.addPage();
  s.y = s.m + 4;
  drawPageAccent(s);

  drawSection(s, 'Estrategia — Bundles Recomendados', AMBER);

  const d = s.doc;
  const typeColors: Record<string, RGB> = {
    star: PURPLE,
    aov: AMBER,
    recovery: GREEN,
  };
  const typeLabels: Record<string, string> = {
    star: 'ESTRELLA',
    aov: 'SUBE TICKET',
    recovery: 'RECUPERACION',
  };

  strategy.bundles.forEach((bundle) => {
    const acColor = typeColors[bundle.type] || AMBER;
    const productLines = d.splitTextToSize(`Productos: ${bundle.products.join(' + ')}`, s.cw - 22);
    const reasonLines = d.splitTextToSize(bundle.reason, s.cw - 22);
    const cardH = 16 + productLines.length * 3.8 + reasonLines.length * 3.8;

    pageBreak(s, cardH + 6);

    // Card background
    d.setFillColor(...WHITE);
    d.setDrawColor(...GRAY_LIGHT);
    d.setLineWidth(0.3);
    d.roundedRect(s.m, s.y, s.cw, cardH, 2.5, 2.5, 'FD');

    // Left accent bar
    d.setFillColor(...acColor);
    d.roundedRect(s.m, s.y, 3.5, cardH, 2.5, 2.5, 'F');
    d.rect(s.m + 2, s.y, 1.5, cardH, 'F');

    // Type badge
    const badgeLabel = typeLabels[bundle.type] || bundle.type.toUpperCase();
    d.setFillColor(...acColor);
    const badgeW = d.getTextWidth(badgeLabel) * 0.6 + 8;
    d.roundedRect(s.m + s.cw - badgeW - 6, s.y + 3, badgeW, 5, 1, 1, 'F');
    d.setFontSize(5.5);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...WHITE);
    d.text(badgeLabel, s.m + s.cw - 8, s.y + 6.5, { align: 'right' });

    let iy = s.y + 7;

    // Bundle name
    d.setFontSize(10);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...acColor);
    d.text(bundle.name, s.m + 10, iy);
    iy += 5;

    // Price
    d.setFontSize(8.5);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...NAVY);
    d.text(`Precio sugerido: ${bundle.suggestedPrice}`, s.m + 10, iy);
    iy += 5;

    // Products
    d.setFontSize(7.5);
    d.setFont('helvetica', 'normal');
    d.setTextColor(...BLACK);
    for (const line of productLines) {
      d.text(line, s.m + 10, iy);
      iy += 3.8;
    }
    iy += 1;

    // Reason
    d.setFontSize(7);
    d.setFont('helvetica', 'normal');
    d.setTextColor(...GRAY);
    for (const line of reasonLines) {
      d.text(line, s.m + 10, iy);
      iy += 3.8;
    }

    s.y += cardH + 5;
  });
}

// ── Strategy: Meta Ads Plan Page ────────────────────────────

function renderStrategyMetaAds(s: S, strategy: StrategySection) {
  if (strategy.metaCampaigns.length === 0) return;

  s.doc.addPage();
  s.y = s.m + 4;
  drawPageAccent(s);

  drawSection(s, 'Plan Meta Ads — Campanas Recomendadas', NAVY_LIGHT);

  // Funnel visual: cold → warm → hot
  const d = s.doc;
  pageBreak(s, 14);

  const funnelStages = [
    { label: 'COLD', desc: 'Nuevas audiencias', color: NAVY_LIGHT },
    { label: 'WARM', desc: 'Remarketing', color: TEAL },
    { label: 'HOT', desc: 'Conversion', color: GREEN },
  ];

  const stageW = (s.cw - 20) / 3;
  funnelStages.forEach((stage, i) => {
    const x = s.m + i * (stageW + 10);
    d.setFillColor(...stage.color);
    d.roundedRect(x, s.y, stageW, 10, 2, 2, 'F');
    d.setFontSize(7);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...WHITE);
    d.text(`${stage.label}: ${stage.desc}`, x + stageW / 2, s.y + 6.5, { align: 'center' });

    // Arrow between stages
    if (i < funnelStages.length - 1) {
      d.setFillColor(...GRAY);
      const arrowX = x + stageW + 2;
      d.triangle(arrowX, s.y + 5, arrowX + 5, s.y + 5, arrowX + 2.5, s.y + 2, 'F');
      d.triangle(arrowX, s.y + 5, arrowX + 5, s.y + 5, arrowX + 2.5, s.y + 8, 'F');
    }
  });
  s.y += 16;

  // Campaign table
  const headers = ['Campana', 'Objetivo', 'Audiencia', 'Budget', 'Por Que'];
  const w = s.cw;
  const colW = [w * 0.20, w * 0.15, w * 0.22, w * 0.13, w * 0.30];

  const rows = strategy.metaCampaigns.map(c => [
    c.name,
    c.objective,
    c.audience,
    c.budgetSuggestion,
    c.rationale,
  ]);

  drawTable(s, headers, rows, colW, { headerColor: NAVY_LIGHT, compact: true });
}

// ── Strategy: Google Ads Plan Page ──────────────────────────

function renderStrategyGoogleAds(s: S, strategy: StrategySection) {
  if (strategy.googleCampaigns.length === 0) return;

  s.doc.addPage();
  s.y = s.m + 4;
  drawPageAccent(s);

  drawSection(s, 'Plan Google Ads — Campanas Recomendadas', TEAL);

  const d = s.doc;

  // Campaign table
  const headers = ['Campana', 'Objetivo', 'Audiencia / Keywords', 'Budget', 'Fundamento'];
  const w = s.cw;
  const colW = [w * 0.18, w * 0.15, w * 0.25, w * 0.12, w * 0.30];

  const rows = strategy.googleCampaigns.map(c => [
    c.name,
    c.objective,
    c.audience,
    c.budgetSuggestion,
    c.rationale,
  ]);

  drawTable(s, headers, rows, colW, { headerColor: TEAL, compact: true });

  // Keyword tags if any campaign has keywords in audience
  const keywordCampaign = strategy.googleCampaigns.find(c => /keyword/i.test(c.name));
  if (keywordCampaign) {
    s.y += 2;
    drawSubSection(s, 'Keywords Sugeridas');

    const keywords = keywordCampaign.audience
      .replace(/^Keywords sugeridas:\s*/i, '')
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);

    if (keywords.length > 0) {
      pageBreak(s, 12);
      let kx = s.m;
      const tagH = 6;

      keywords.forEach(kw => {
        const tw = d.getTextWidth(kw) + 8;
        if (kx + tw > s.m + s.cw) {
          kx = s.m;
          s.y += tagH + 3;
          pageBreak(s, tagH + 3);
        }
        d.setFillColor(220, 245, 245);
        d.roundedRect(kx, s.y, tw, tagH, 2, 2, 'F');
        d.setFillColor(...TEAL);
        d.rect(kx, s.y + 1, 2, tagH - 2, 'F');
        d.setFontSize(7);
        d.setFont('helvetica', 'bold');
        d.setTextColor(...NAVY);
        d.text(kw, kx + 5, s.y + 4.3);
        kx += tw + 3;
      });
      s.y += tagH + 4;
    }
  }
  d.setTextColor(...BLACK);
}

// ── Strategy: Email Flows Page ──────────────────────────────

function renderStrategyEmailFlows(s: S, strategy: StrategySection) {
  if (strategy.emailFlows.length === 0) return;

  s.doc.addPage();
  s.y = s.m + 4;
  drawPageAccent(s);

  drawSection(s, 'Plan Email Marketing — Flows Automatizados', GREEN);

  const d = s.doc;

  // Timeline visual for each flow
  strategy.emailFlows.forEach((flow) => {
    const descLines = d.splitTextToSize(flow.description, s.cw - 20);
    const impactLines = d.splitTextToSize(flow.expectedImpact, s.cw - 20);
    const totalH = 22 + 10 + descLines.length * 3.5 + impactLines.length * 3.5;

    pageBreak(s, totalH + 4);

    // Flow card background
    d.setFillColor(...BG_CREAM);
    d.roundedRect(s.m, s.y, s.cw, totalH, 2, 2, 'F');
    d.setFillColor(...GREEN);
    d.rect(s.m, s.y + 2, 3, totalH - 4, 'F');

    let fy = s.y + 5;

    // Flow name
    d.setFontSize(9.5);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...GREEN);
    d.text(flow.flowName, s.m + 8, fy);

    // Email count badge
    const badge = `${flow.emailCount} emails`;
    const badgeW = d.getTextWidth(badge) + 6;
    d.setFillColor(...GREEN);
    d.roundedRect(s.m + s.cw - badgeW - 6, fy - 3.5, badgeW, 5.5, 1.2, 1.2, 'F');
    d.setFontSize(6);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...WHITE);
    d.text(badge, s.m + s.cw - 8, fy, { align: 'right' });
    fy += 5;

    // Trigger
    d.setFontSize(7);
    d.setFont('helvetica', 'normal');
    d.setTextColor(...GRAY);
    d.text(`Trigger: ${flow.trigger}`, s.m + 8, fy);
    fy += 4;

    // Timeline dots
    const timingParts = flow.timing.split('→').map(t => t.trim());
    const timelineStartX = s.m + 10;
    const timelineW = s.cw - 30;
    const dotSpacing = timingParts.length > 1 ? timelineW / (timingParts.length - 1) : timelineW;

    // Timeline line
    d.setDrawColor(...GREEN);
    d.setLineWidth(0.6);
    d.line(timelineStartX, fy + 3, timelineStartX + timelineW, fy + 3);

    // Dots + labels
    timingParts.forEach((part, i) => {
      const dx = timingParts.length > 1
        ? timelineStartX + i * dotSpacing
        : timelineStartX + timelineW / 2;
      d.setFillColor(...GREEN);
      d.circle(dx, fy + 3, 2, 'F');
      d.setFillColor(...WHITE);
      d.circle(dx, fy + 3, 1, 'F');
      d.setFontSize(5.5);
      d.setFont('helvetica', 'bold');
      d.setTextColor(...NAVY);
      d.text(part, dx, fy + 8, { align: 'center' });
    });
    fy += 13;

    // Description
    d.setFontSize(7);
    d.setFont('helvetica', 'normal');
    d.setTextColor(...BLACK);
    for (const line of descLines) {
      d.text(line, s.m + 8, fy);
      fy += 3.5;
    }
    fy += 1;

    // Impact
    d.setFontSize(6.5);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...TEAL);
    for (const line of impactLines) {
      d.text(line, s.m + 8, fy);
      fy += 3.5;
    }

    s.y += totalH + 4;
  });

  d.setTextColor(...BLACK);
}

// ── Strategy: Projections Page ──────────────────────────────

function renderStrategyProjections(s: S, strategy: StrategySection) {
  if (strategy.projections.length === 0) return;

  s.doc.addPage();
  s.y = s.m + 4;
  drawPageAccent(s);

  drawSection(s, 'Proyecciones — Hoy vs Con Estrategia', PURPLE);

  const d = s.doc;

  strategy.projections.forEach((proj) => {
    const cardH = 28;
    pageBreak(s, cardH + 6);

    // Card
    d.setFillColor(...WHITE);
    d.setDrawColor(...GRAY_LIGHT);
    d.setLineWidth(0.3);
    d.roundedRect(s.m, s.y, s.cw, cardH, 2.5, 2.5, 'FD');

    // Metric label
    d.setFontSize(8);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...NAVY);
    d.text(proj.metric, s.m + 6, s.y + 6);

    // Split card: left = HOY, right = CON ESTRATEGIA
    const halfW = (s.cw - 20) / 2;
    const leftX = s.m + 6;
    const rightX = s.m + halfW + 14;

    // HOY box
    d.setFillColor(245, 245, 248);
    d.roundedRect(leftX, s.y + 9, halfW, 15, 2, 2, 'F');
    d.setFontSize(5.5);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...GRAY);
    d.text('HOY', leftX + halfW / 2, s.y + 13, { align: 'center' });
    d.setFontSize(12);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...BLACK);
    d.text(proj.current, leftX + halfW / 2, s.y + 21, { align: 'center' });

    // Arrow between boxes
    d.setFillColor(...PURPLE);
    const arrowX = s.m + halfW + 8;
    d.triangle(arrowX, s.y + 16.5, arrowX + 4, s.y + 16.5, arrowX + 2, s.y + 14, 'F');
    d.triangle(arrowX, s.y + 16.5, arrowX + 4, s.y + 16.5, arrowX + 2, s.y + 19, 'F');

    // CON ESTRATEGIA box
    d.setFillColor(237, 233, 254); // light purple
    d.roundedRect(rightX, s.y + 9, halfW, 15, 2, 2, 'F');
    d.setFontSize(5.5);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...PURPLE);
    d.text('CON ESTRATEGIA', rightX + halfW / 2, s.y + 13, { align: 'center' });
    d.setFontSize(12);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...PURPLE);
    d.text(proj.projected, rightX + halfW / 2, s.y + 21, { align: 'center' });

    // Improvement note
    d.setFontSize(6.5);
    d.setFont('helvetica', 'normal');
    d.setTextColor(...GRAY);
    const impText = proj.improvement.length > 80 ? proj.improvement.substring(0, 78) + '..' : proj.improvement;
    d.text(impText, s.m + s.cw - 6, s.y + 5.5, { align: 'right' });

    s.y += cardH + 4;
  });

  // Bottom CTA banner
  pageBreak(s, 20);
  s.y += 4;
  d.setFillColor(...PURPLE);
  d.roundedRect(s.m, s.y, s.cw, 14, 2.5, 2.5, 'F');
  d.setFontSize(9);
  d.setFont('helvetica', 'bold');
  d.setTextColor(...WHITE);
  d.text('Implementa esta estrategia con Steve — Tu equipo de marketing AI', s.pw / 2, s.y + 9, { align: 'center' });
  s.y += 20;

  d.setTextColor(...BLACK);
}

// ── Glossary Page ───────────────────────────────────────────────

function renderGlossary(s: S) {
  s.doc.addPage();
  s.y = s.m + 4;
  drawPageAccent(s);

  drawSection(s, 'Glosario de Terminos', GRAY);

  const terms: [string, string][] = [
    ['ROAS', 'Return On Ad Spend. Cuanto dinero generas por cada peso invertido en publicidad. Ej: ROAS 4x = $4 de venta por cada $1 invertido.'],
    ['AOV', 'Average Order Value (Ticket Promedio). Valor promedio de cada pedido. Se calcula como ingresos totales / numero de pedidos.'],
    ['CTR', 'Click-Through Rate. Porcentaje de personas que hacen clic en tu anuncio despues de verlo. CTR = Clicks / Impresiones x 100.'],
    ['CPC', 'Cost Per Click. Cuanto pagas en promedio por cada clic en tus anuncios. CPC = Inversion / Clicks.'],
    ['CPA', 'Cost Per Acquisition. Cuanto cuesta conseguir una conversion (venta). CPA = Inversion / Conversiones.'],
    ['LTV', 'Lifetime Value. Valor total que un cliente genera durante toda su relacion con tu negocio.'],
    ['Tasa de Repeticion', 'Porcentaje de clientes que compran mas de una vez. Un negocio sano tiene 20-30% o mas.'],
    ['Conversion Rate', 'Porcentaje de visitantes que realizan una compra. Promedio ecommerce: 2-3%.'],
    ['Margen Neto', 'Utilidad final despues de todos los costos (productos, envio, publicidad, comisiones, costos fijos). Es lo que realmente queda.'],
    ['Break-Even ROAS', 'ROAS minimo necesario para no perder dinero. Depende de tu margen bruto.'],
    ['Impresiones', 'Numero de veces que tu anuncio fue mostrado a personas en la plataforma.'],
    ['Conversiones', 'Acciones valiosas completadas: compras, registros, o cualquier objetivo definido en la campana.'],
    ['Funnel', 'Embudo de conversion. Las etapas que recorre un visitante: Sesion → Agregar al carrito → Checkout → Compra.'],
    ['Lookalike', 'Audiencia similar. Meta/Google encuentran personas parecidas a tus mejores clientes para mostrarles anuncios.'],
    ['Retargeting', 'Mostrar anuncios a personas que ya visitaron tu sitio web o interactuaron con tu marca.'],
    ['Flow', 'Secuencia automatizada de emails que se dispara por una accion del usuario (ej: carrito abandonado, compra, suscripcion).'],
    ['Bundle', 'Paquete de productos vendidos juntos a un precio especial. Aumenta el ticket promedio y facilita la decision de compra.'],
    ['P&L', 'Profit & Loss (Estado de Resultados). Resumen financiero de ingresos, costos y utilidad neta del periodo.'],
    ['Advantage+', 'Sistema automatizado de Meta Ads que usa IA para optimizar audiencias, creativos y ubicaciones.'],
    ['Performance Max', 'Tipo de campana de Google que muestra anuncios en Search, Shopping, Display y YouTube automaticamente.'],
  ];

  const d = s.doc;

  terms.forEach(([term, definition], idx) => {
    const defLines = d.splitTextToSize(definition, s.cw - 30);
    const rowH = 5 + defLines.length * 3.5;

    pageBreak(s, rowH + 2);

    // Zebra background
    if (idx % 2 === 0) {
      d.setFillColor(...BG_CREAM);
      d.rect(s.m, s.y - 1, s.cw, rowH + 1, 'F');
    }

    // Term (bold)
    d.setFontSize(7.5);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...NAVY);
    d.text(term, s.m + 3, s.y + 3);

    // Definition
    d.setFontSize(7);
    d.setFont('helvetica', 'normal');
    d.setTextColor(...BLACK);
    let dy = s.y + 3;
    for (const line of defLines) {
      d.text(line, s.m + 28, dy);
      dy += 3.5;
    }

    s.y += rowH + 1;
  });

  // Bottom note
  s.y += 4;
  pageBreak(s, 10);
  d.setFontSize(6.5);
  d.setFont('helvetica', 'normal');
  d.setTextColor(...GRAY);
  d.text('* Las metricas y proyecciones de este reporte son estimaciones basadas en datos reales del periodo seleccionado.', s.m, s.y);
  s.y += 4;
  d.text('* Los resultados reales pueden variar segun la implementacion, mercado y estacionalidad.', s.m, s.y);
  d.setTextColor(...BLACK);
}

// ── Ad Platform Page ───────────────────────────────────────────

function renderAdPlatformPage(s: S, platform: AdPlatformPerformance) {
  const name = platform.platform === 'meta' ? 'Meta Ads' : 'Google Ads';
  const mainColor: RGB = platform.platform === 'meta' ? NAVY_LIGHT : TEAL;

  s.doc.addPage();
  s.y = s.m + 4;
  drawPageAccent(s);

  drawSection(s, `${name} — Campanas`, mainColor);

  // Summary mini metrics
  drawMiniMetric(s, s.m, s.y, 'Inversion', fmt(platform.totalSpend), mainColor);
  drawMiniMetric(s, s.m + 44, s.y, 'ROAS', `${platform.avgRoas.toFixed(2)}x`, GREEN);
  drawMiniMetric(s, s.m + 88, s.y, 'CTR', `${platform.avgCtr.toFixed(2)}%`, TEAL);
  drawMiniMetric(s, s.m + 132, s.y, 'Conv.', platform.totalConversions.toLocaleString('es-CL'), PURPLE);
  s.y += 22;

  // Campaign table
  const headers = ['Campana', 'Inversion', 'Impresiones', 'Clicks', 'CTR', 'CPC', 'Conv.', 'ROAS'];
  const w = s.cw;
  const colW = [w * 0.26, w * 0.11, w * 0.12, w * 0.09, w * 0.09, w * 0.10, w * 0.09, w * 0.14];

  const rows = platform.campaigns.map(c => [
    c.campaign_name,
    fmt(c.spend),
    c.impressions.toLocaleString('es-CL'),
    c.clicks.toLocaleString('es-CL'),
    `${c.ctr.toFixed(2)}%`,
    fmt(c.cpc),
    c.conversions.toLocaleString('es-CL'),
    `${c.roas.toFixed(2)}x`,
  ]);

  drawTable(s, headers, rows, colW, {
    alignRight: [1, 2, 3, 4, 5, 6, 7],
    headerColor: mainColor,
    compact: true,
  });

  // Campaign spend bar chart
  if (platform.campaigns.length > 1) {
    drawSubSection(s, 'Inversion por Campana');
    const campBars = platform.campaigns.slice(0, 10).map((c, i) => ({
      label: c.campaign_name,
      value: c.spend,
      color: [mainColor, TEAL, GREEN, AMBER, PURPLE][i % 5] as RGB,
    }));
    drawHorizontalBars(s, campBars, s.cw);
  }
}
