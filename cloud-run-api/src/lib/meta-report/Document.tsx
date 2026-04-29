import React from 'react';
import { Document } from '@react-pdf/renderer';
import {
  CoverPage,
  LetterPage,
  ExecutiveSummary,
  NorthStarPage,
  FunnelStagePage,
} from './pages.js';
import {
  BCGPage,
  FatiguePage,
  AudiencePage,
  ConversionFunnelPage,
  TopCreativesPage,
  RecommendationsPage,
  NextStepsPage,
} from './pages-extra.js';
import type { MetaReportData } from './data.js';

/**
 * Reporte Meta Ads — 12 páginas:
 *   01 Portada
 *   02 Carta de Felipe
 *   03 Resumen Ejecutivo (4 KPIs + chart)
 *   04 North Star + EERR ad-only
 *   05 Funnel TOFU/MOFU/BOFU
 *   06 Matriz BCG de campañas
 *   07 Fatiga creativa
 *   08 Audiencia (edad/género · país · placement)
 *   09 Conversion Funnel (Impresión → Compra)
 *   10 Top 3 Creativos
 *   11 Recomendaciones AI (Felipe via Claude)
 *   12 Próximos Pasos
 */
export function MetaReportDocument({ data }: { data: MetaReportData }) {
  return (
    <Document
      title={`Reporte Meta Ads · ${data.client.name} · ${data.period.start} a ${data.period.end}`}
      author="Steve Ads"
      creator="Steve Ads"
      producer="Steve Ads"
      subject={`Meta Ads Performance · ${data.client.name}`}
    >
      <CoverPage data={data} />
      <LetterPage data={data} />
      <ExecutiveSummary data={data} />
      <NorthStarPage data={data} />
      <FunnelStagePage data={data} />
      <BCGPage data={data} />
      <FatiguePage data={data} />
      <AudiencePage data={data} />
      <ConversionFunnelPage data={data} />
      <TopCreativesPage data={data} />
      <RecommendationsPage data={data} />
      <NextStepsPage data={data} />
    </Document>
  );
}
