import { useState, useEffect } from 'react';
import { FileBarChart, TrendingUp, TrendingDown, Target, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface MerchantReport {
  client_id: string;
  report_date: string;
  total_sales: number;
  last_week_sales: number;
  sales_delta_pct: number;
  top_campaign: string | null;
  cpa_this_week: number | null;
  cpa_last_week: number | null;
  creative_score: number | null;
  recommended_action: string;
}

function formatCLP(value: number) {
  return '$' + Math.round(value).toLocaleString('es-CL');
}

export function WeeklyReportCard({ clientId }: { clientId: string }) {
  const [report, setReport] = useState<MerchantReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clientId) fetchReport();
  }, [clientId]);

  async function fetchReport() {
    setLoading(true);
    // Get the latest weekly_merchant_report for this client from qa_log
    const { data } = await supabase
      .from('qa_log')
      .select('details, checked_at')
      .eq('check_type', 'weekly_merchant_report')
      .order('checked_at', { ascending: false })
      .limit(10);

    // Find the one matching our client_id
    const match = (data || []).find((row: any) => {
      const details = row.details;
      return details?.client_id === clientId;
    });

    if (match) {
      setReport(match.details as MerchantReport);
    }
    setLoading(false);
  }

  if (loading) return null;
  if (!report) return null;

  const salesUp = report.sales_delta_pct >= 0;
  const cpaDelta = report.cpa_this_week && report.cpa_last_week && report.cpa_last_week > 0
    ? Math.round(((report.cpa_this_week - report.cpa_last_week) / report.cpa_last_week) * 100)
    : null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileBarChart className="w-4 h-4 text-primary" />
          Reporte Semanal
          <Badge variant="outline" className="text-xs ml-auto">{report.report_date}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sales KPI */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Ventas Totales</p>
            <p className="text-xl font-bold">{formatCLP(report.total_sales)}</p>
            <div className={`flex items-center gap-1 text-xs ${salesUp ? 'text-green-600' : 'text-red-600'}`}>
              {salesUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {salesUp ? '+' : ''}{report.sales_delta_pct}% vs anterior
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">CPA Promedio</p>
            <p className="text-xl font-bold">{report.cpa_this_week ? formatCLP(report.cpa_this_week) : 'N/A'}</p>
            {cpaDelta !== null && (
              <div className={`flex items-center gap-1 text-xs ${cpaDelta <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {cpaDelta <= 0 ? '✅' : '⚠️'} {cpaDelta <= 0 ? '' : '+'}{cpaDelta}% vs anterior
              </div>
            )}
          </div>
        </div>

        {/* Top Campaign */}
        {report.top_campaign && (
          <div className="flex items-start gap-2 bg-[#F0F4FA] rounded-lg p-3">
            <Target className="w-4 h-4 text-[#1E3A7B] mt-0.5" />
            <div>
              <p className="text-xs text-[#1E3A7B] font-medium">Top Campaña</p>
              <p className="text-sm font-medium">{report.top_campaign}</p>
            </div>
          </div>
        )}

        {/* Recommended Action */}
        <div className="flex items-start gap-2 bg-green-50 rounded-lg p-3">
          <Lightbulb className="w-4 h-4 text-green-600 mt-0.5" />
          <div>
            <p className="text-xs text-green-600 font-medium">Siguiente Acción</p>
            <p className="text-sm">{report.recommended_action}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
