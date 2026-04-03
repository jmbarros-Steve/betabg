import { useMemo } from 'react';
import {
  MessageSquare, ArrowRight, TrendingUp, Calendar,
  FileText, CheckCircle, Send, Clock, XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TimelineEvent {
  id: string;
  event_type: string;
  event_data: Record<string, any>;
  created_by: string | null;
  created_at: string;
}

const EVENT_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  message_in: { icon: MessageSquare, label: 'Mensaje recibido', color: 'text-blue-500' },
  message_out: { icon: Send, label: 'Mensaje enviado', color: 'text-green-500' },
  stage_change: { icon: ArrowRight, label: 'Cambio de etapa', color: 'text-purple-500' },
  score_change: { icon: TrendingUp, label: 'Cambio de score', color: 'text-amber-500' },
  meeting_booked: { icon: Calendar, label: 'Reunión agendada', color: 'text-cyan-500' },
  meeting_cancelled: { icon: XCircle, label: 'Reunión cancelada', color: 'text-red-500' },
  note_added: { icon: FileText, label: 'Nota agregada', color: 'text-slate-500' },
  task_created: { icon: CheckCircle, label: 'Tarea creada', color: 'text-emerald-500' },
  proposal_sent: { icon: Send, label: 'Propuesta enviada', color: 'text-indigo-500' },
};

function formatRelative(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

export function ProspectTimeline({ events }: { events: TimelineEvent[] }) {
  const sorted = useMemo(
    () => [...events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [events],
  );

  if (sorted.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <Clock className="w-8 h-8 mx-auto mb-2" />
        <p>Sin eventos registrados</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {sorted.map((event) => {
        const config = EVENT_CONFIG[event.event_type] || {
          icon: Clock,
          label: event.event_type,
          color: 'text-slate-400',
        };
        const Icon = config.icon;
        const data = event.event_data || {};

        return (
          <div key={event.id} className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
            <div className={`mt-0.5 ${config.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">{config.label}</span>
                <span className="text-xs text-slate-400">{formatRelative(event.created_at)}</span>
              </div>
              {event.event_type === 'stage_change' && data.from && data.to && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {data.from} → {data.to}
                  {data.method === 'drag_drop' && <Badge variant="outline" className="ml-1 text-[10px] py-0">manual</Badge>}
                </p>
              )}
              {event.event_type === 'score_change' && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {data.old_score} → {data.new_score}
                </p>
              )}
              {event.event_type === 'note_added' && data.note && (
                <p className="text-xs text-slate-500 mt-0.5 truncate">{data.note}</p>
              )}
              {event.event_type === 'task_created' && data.title && (
                <p className="text-xs text-slate-500 mt-0.5 truncate">{data.title}</p>
              )}
              {event.event_type === 'proposal_sent' && data.title && (
                <p className="text-xs text-slate-500 mt-0.5 truncate">{data.title}</p>
              )}
              {event.created_by && event.created_by !== 'system' && (
                <p className="text-[10px] text-slate-300 mt-0.5">por {event.created_by}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
