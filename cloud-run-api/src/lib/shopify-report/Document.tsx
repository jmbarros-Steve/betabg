import React from 'react';
import { Document } from '@react-pdf/renderer';
import {
  CoverPage,
  LetterPage,
  ExecutiveSummary,
  NorthStarPage,
  RecommendationsPage,
  NextStepsPage,
} from './pages.js';
import type { ReportData } from './data.js';

/**
 * Sprint 1 — incluye 6 capítulos:
 *   01 Portada
 *   02 Carta del Equipo
 *   03 Resumen Ejecutivo
 *   04 North Star + EERR
 *   13 Recomendaciones
 *   14 Próximos Pasos
 *
 * Sprints siguientes agregan capítulos 5-12 + 15.
 */
export function ShopifyReportDocument({ data }: { data: ReportData }) {
  return (
    <Document
      title={`Informe Steve Ads · ${data.client.name} · ${data.period.start} a ${data.period.end}`}
      author="Steve Ads"
      creator="Steve Ads"
      producer="Steve Ads"
      subject={`Performance Report · ${data.client.shop_domain}`}
    >
      <CoverPage data={data} />
      <LetterPage data={data} />
      <ExecutiveSummary data={data} />
      <NorthStarPage data={data} />
      <RecommendationsPage data={data} />
      <NextStepsPage data={data} />
    </Document>
  );
}
