/**
 * Tipos compartidos del CampaignBuilder.
 *
 * Extraídos de CampaignBuilder.tsx (1865 líneas) como primer paso de un
 * refactor gradual. Ver ./README.md para el plan completo.
 *
 * Autor: Valentina W1 — 2026-04-08
 */

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  preview_text: string;
  from_name: string;
  from_email: string;
  html_content: string;
  design_json?: any;
  status: string;
  total_recipients: number;
  sent_count: number;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  audience_filter: any;
}

export interface CampaignBuilderProps {
  clientId: string;
}

export type EditorStep = 'setup' | 'design' | 'audience' | 'review';

export type AudienceType = 'all' | 'specific';

export type PreviewDevice = 'desktop' | 'mobile';

export type AbWinningMetric = 'open_rate' | 'click_rate' | 'revenue';

export interface EmailListSummary {
  id: string;
  name: string;
  type: string;
  subscriber_count: number;
  filters: any[];
}
