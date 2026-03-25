import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, PlayCircle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LessonPlayerProps {
  lesson: {
    id: string;
    title: string;
    description: string | null;
    youtube_video_id: string;
    duration_minutes: number;
    sort_order: number;
  };
  completed: boolean;
  onComplete: (lessonId: string) => void;
}

export function LessonPlayer({ lesson, completed, onComplete }: LessonPlayerProps) {
  const [watchTime, setWatchTime] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasVideo = !!lesson.youtube_video_id;

  // Track watch time for auto-complete (mark complete after 80% of video duration)
  useEffect(() => {
    if (!hasVideo || completed) return;

    intervalRef.current = setInterval(() => {
      setWatchTime(prev => {
        const next = prev + 1;
        const thresholdSeconds = lesson.duration_minutes * 60 * 0.8;
        if (next >= thresholdSeconds && !completed) {
          onComplete(lesson.id);
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hasVideo, completed, lesson.duration_minutes, lesson.id, onComplete]);

  return (
    <div className="space-y-4">
      {/* Video player */}
      <div className="aspect-video bg-black rounded-lg overflow-hidden">
        {hasVideo ? (
          <iframe
            src={`https://www.youtube.com/embed/${lesson.youtube_video_id}?rel=0&modestbranding=1`}
            title={lesson.title}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-white/60">
            <PlayCircle className="w-16 h-16" />
            <p className="text-sm">Video no disponible todavia</p>
            <p className="text-xs text-white/40">El contenido sera agregado pronto</p>
          </div>
        )}
      </div>

      {/* Lesson info */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-lg">{lesson.title}</h3>
          {lesson.description && (
            <p className="text-sm text-muted-foreground mt-1">{lesson.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Duracion: {lesson.duration_minutes} min
          </p>
        </div>

        {completed ? (
          <div className="flex items-center gap-1.5 text-green-600 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">Completada</span>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onComplete(lesson.id)}
            className="shrink-0"
          >
            Marcar completada
          </Button>
        )}
      </div>
    </div>
  );
}
