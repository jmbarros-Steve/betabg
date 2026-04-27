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
import {
  RevenuePage,
  ProductPage,
  FunnelPage,
  MarketingPage,
} from './pages-sprint2.js';
import type { ReportData } from './data.js';

/**
 * Sprint 1 + 2 — 10 páginas:
 *   00 Portada
 *   00 Carta del Equipo
 *   01 Resumen Ejecutivo
 *   02 North Star + EERR
 *   03 Revenue Deep Dive          (Sprint 2)
 *   04 Análisis de Producto       (Sprint 2)
 *   05 Funnel & Conversión        (Sprint 2)
 *   06 Marketing Performance      (Sprint 2)
 *   07 Recomendaciones
 *   08 Próximos Pasos
 *
 * Sprint 3 agrega: Cohortes/LTV, Hallazgos AI.
 * Sprint 4 polish: tipografía custom, anexos, branding final.
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
      <RevenuePage data={data} />
      <ProductPage data={data} />
      <FunnelPage data={data} />
      <MarketingPage data={data} />
      <RecommendationsPage data={data} />
      <NextStepsPage data={data} />
    </Document>
  );
}
