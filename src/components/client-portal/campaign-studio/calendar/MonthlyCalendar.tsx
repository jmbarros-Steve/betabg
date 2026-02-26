import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { CalendarDayCell } from './CalendarDayCell';
import { QuickCreatePopover } from './QuickCreatePopover';
import type { CampaignType } from '../templates/TemplatePresets';
import type { BrandIdentity } from '../templates/BrandHtmlGenerator';

interface CampaignItem {
  id: string;
  name: string;
  campaign_type: string;
  status: string | null;
  scheduled_at: string | null;
}

interface MonthlyCalendarProps {
  clientId: string;
  brand: BrandIdentity | null;
  onCreateCampaign: (type: CampaignType, date?: Date) => void;
  onEditCampaign: (campaignId: string) => void;
}

const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Convert to Mon=0
}

export function MonthlyCalendar({ clientId, brand, onCreateCampaign, onEditCampaign }: MonthlyCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [quickCreateDay, setQuickCreateDay] = useState<number | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    const startDate = new Date(year, month, 1).toISOString();
    const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    const { data, error } = await supabase
      .from('email_campaigns')
      .select('id, name, campaign_type, status, scheduled_at')
      .eq('client_id', clientId)
      .gte('scheduled_at', startDate)
      .lte('scheduled_at', endDate)
      .order('scheduled_at', { ascending: true });

    if (!error && data) {
      setCampaigns(data as CampaignItem[]);
    }
    setLoading(false);
  }, [clientId, year, month]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const goToToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const getCampaignsForDay = (day: number): CampaignItem[] => {
    return campaigns.filter(c => {
      if (!c.scheduled_at) return false;
      const d = new Date(c.scheduled_at);
      return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
    });
  };

  const isToday = (day: number): boolean => {
    return day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  };

  const handleQuickCreate = (day: number) => {
    setQuickCreateDay(day);
  };

  const handleQuickSelect = (type: CampaignType) => {
    if (quickCreateDay !== null) {
      const date = new Date(year, month, quickCreateDay, 10, 0, 0);
      onCreateCampaign(type, date);
    }
    setQuickCreateDay(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">
            {MONTH_NAMES[month]} {year}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Hoy
          </Button>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Day of week headers */}
      <div className="grid grid-cols-7 gap-1">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) {
            return <CalendarDayCell key={`empty-${idx}`} day={null} isToday={false} campaigns={[]} onCampaignClick={onEditCampaign} onQuickCreate={handleQuickCreate} />;
          }

          const dayCampaigns = getCampaignsForDay(day);

          return (
            <QuickCreatePopover
              key={day}
              open={quickCreateDay === day}
              onOpenChange={open => { if (!open) setQuickCreateDay(null); }}
              onSelect={handleQuickSelect}
            >
              <div>
                <CalendarDayCell
                  day={day}
                  isToday={isToday(day)}
                  campaigns={dayCampaigns}
                  onCampaignClick={onEditCampaign}
                  onQuickCreate={handleQuickCreate}
                />
              </div>
            </QuickCreatePopover>
          );
        })}
      </div>

      {loading && (
        <div className="text-center text-sm text-muted-foreground py-2">
          Cargando campañas...
        </div>
      )}
    </div>
  );
}
