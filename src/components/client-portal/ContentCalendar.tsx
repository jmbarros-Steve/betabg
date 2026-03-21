import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, ChevronRight, CalendarDays, Instagram, Plus, X,
  Clock, CheckCircle, AlertTriangle, Loader2, ImagePlus, Film, Images,
} from 'lucide-react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';

interface ContentCalendarProps {
  clientId: string;
  onNewPost?: (date: string) => void;
}

interface ScheduledPost {
  id: string;
  media_type: 'IMAGE' | 'CAROUSEL' | 'REELS';
  image_url: string | null;
  image_urls: string[] | null;
  video_url: string | null;
  caption: string;
  hashtags: string[];
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
  scheduled_at: string | null;
  published_at: string | null;
  permalink: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Borrador', color: 'bg-slate-100 text-slate-700', icon: ImagePlus },
  scheduled: { label: 'Programado', color: 'bg-blue-100 text-blue-700', icon: Clock },
  publishing: { label: 'Publicando', color: 'bg-yellow-100 text-yellow-700', icon: Loader2 },
  published: { label: 'Publicado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  failed: { label: 'Error', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
};

const MEDIA_ICONS: Record<string, any> = {
  IMAGE: ImagePlus,
  CAROUSEL: Images,
  REELS: Film,
};

function getWeekDays(baseDate: Date): Date[] {
  const start = new Date(baseDate);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1)); // Monday
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DAY_NAMES = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 8:00 - 21:00

export function ContentCalendar({ clientId, onNewPost }: ContentCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragPost, setDragPost] = useState<string | null>(null);

  const weekDays = getWeekDays(currentDate);
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<{ posts: ScheduledPost[] }>('publish-instagram', {
        body: { action: 'list', client_id: clientId, limit: 100 },
      });
      if (error) { toast.error(error); return; }
      setPosts(data?.posts || []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const prevWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };

  const nextWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const today = () => setCurrentDate(new Date());

  const getPostsForDay = (day: Date) => {
    return posts.filter(p => {
      const postDate = new Date(p.scheduled_at || p.published_at || p.created_at);
      return isSameDay(postDate, day);
    });
  };

  const getPostHour = (post: ScheduledPost) => {
    const d = new Date(post.scheduled_at || post.published_at || post.created_at);
    return d.getHours();
  };

  const handleDrop = async (postId: string, day: Date, hour: number) => {
    const newDate = new Date(day);
    newDate.setHours(hour, 0, 0, 0);

    const { error } = await callApi('publish-instagram', {
      body: { action: 'update', client_id: clientId, post_id: postId, scheduled_at: newDate.toISOString() },
    });

    if (error) { toast.error(error); return; }
    toast.success('Publicacion movida');
    loadPosts();
    setDragPost(null);
  };

  const handleDelete = async (postId: string) => {
    const { error } = await callApi('publish-instagram', {
      body: { action: 'delete', client_id: clientId, post_id: postId },
    });
    if (error) { toast.error(error); return; }
    toast.success('Publicacion eliminada');
    loadPosts();
  };

  const handleSlotClick = (day: Date, hour: number) => {
    const date = new Date(day);
    date.setHours(hour, 0, 0, 0);
    const isoLocal = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`;
    onNewPost?.(isoLocal);
  };

  const formatWeekRange = () => {
    const s = weekStart;
    const e = weekEnd;
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    if (s.getMonth() === e.getMonth()) {
      return `${s.getDate()} - ${e.getDate()} ${months[s.getMonth()]} ${s.getFullYear()}`;
    }
    return `${s.getDate()} ${months[s.getMonth()]} - ${e.getDate()} ${months[e.getMonth()]} ${s.getFullYear()}`;
  };

  const isToday = (day: Date) => isSameDay(day, new Date());

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            Calendario de contenido
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevWeek}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={today}>
              Hoy
            </Button>
            <Button variant="outline" size="sm" onClick={nextWeek}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{formatWeekRange()}</p>
      </CardHeader>

      <CardContent className="p-0 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="min-w-[700px]">
            {/* Header: Day names */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
              <div className="p-2 text-xs text-muted-foreground" />
              {weekDays.map((day, i) => (
                <div
                  key={i}
                  className={`p-2 text-center border-l ${isToday(day) ? 'bg-primary/5' : ''}`}
                >
                  <p className="text-xs text-muted-foreground">{DAY_NAMES[i]}</p>
                  <p className={`text-lg font-semibold ${isToday(day) ? 'text-primary' : ''}`}>
                    {day.getDate()}
                  </p>
                </div>
              ))}
            </div>

            {/* Time grid */}
            {HOURS.map(hour => (
              <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b min-h-[60px]">
                <div className="p-1 text-xs text-muted-foreground text-right pr-2 pt-1">
                  {hour}:00
                </div>
                {weekDays.map((day, di) => {
                  const dayPosts = getPostsForDay(day).filter(p => getPostHour(p) === hour);
                  return (
                    <div
                      key={di}
                      className={`border-l p-1 cursor-pointer hover:bg-muted/30 transition-colors relative ${isToday(day) ? 'bg-primary/[0.02]' : ''}`}
                      onClick={() => dayPosts.length === 0 && handleSlotClick(day, hour)}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('bg-primary/10'); }}
                      onDragLeave={e => { e.currentTarget.classList.remove('bg-primary/10'); }}
                      onDrop={e => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('bg-primary/10');
                        if (dragPost) handleDrop(dragPost, day, hour);
                      }}
                    >
                      {dayPosts.map(post => {
                        const status = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
                        const MediaIcon = MEDIA_ICONS[post.media_type] || ImagePlus;
                        const canDrag = post.status === 'scheduled' || post.status === 'draft';

                        return (
                          <div
                            key={post.id}
                            className={`${status.color} rounded p-1.5 text-xs cursor-pointer mb-1 group relative`}
                            draggable={canDrag}
                            onDragStart={() => canDrag && setDragPost(post.id)}
                            onDragEnd={() => setDragPost(null)}
                            onClick={e => {
                              e.stopPropagation();
                              if (post.permalink) window.open(post.permalink, '_blank');
                            }}
                          >
                            <div className="flex items-center gap-1">
                              <MediaIcon className="w-3 h-3 flex-shrink-0" />
                              <Instagram className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate flex-1">{post.caption.substring(0, 30)}</span>
                            </div>
                            {post.image_url && (
                              <img src={post.image_url} alt="" className="w-full h-10 object-cover rounded mt-1" />
                            )}
                            {canDrag && (
                              <button
                                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full hidden group-hover:flex items-center justify-center"
                                onClick={e => { e.stopPropagation(); handleDelete(post.id); }}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {dayPosts.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <Plus className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
