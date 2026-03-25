import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, BookOpen, BarChart } from 'lucide-react';

interface CourseCardProps {
  course: {
    id: string;
    title: string;
    description: string | null;
    slug: string;
    thumbnail_url: string | null;
    category: string;
    difficulty: string;
    estimated_hours: number;
    lesson_count?: number;
  };
  progress?: number; // 0-100
  enrolled?: boolean;
  onClick: () => void;
}

const difficultyColors: Record<string, string> = {
  beginner: 'bg-green-100 text-green-700',
  intermediate: 'bg-yellow-100 text-yellow-700',
  advanced: 'bg-red-100 text-red-700',
};

const difficultyLabels: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};

const categoryLabels: Record<string, string> = {
  paid_media: 'Paid Media',
  email: 'Email Marketing',
  analytics: 'Analytics',
  strategy: 'Estrategia',
  marketing: 'Marketing',
};

export function CourseCard({ course, progress = 0, enrolled, onClick }: CourseCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:-translate-y-1 overflow-hidden"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative h-40 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
        {course.thumbnail_url ? (
          <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover" />
        ) : (
          <BookOpen className="w-12 h-12 text-primary/40" />
        )}
        <Badge className={`absolute top-3 right-3 text-xs ${difficultyColors[course.difficulty] || ''}`}>
          {difficultyLabels[course.difficulty] || course.difficulty}
        </Badge>
      </div>

      <CardContent className="p-4 space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {categoryLabels[course.category] || course.category}
          </p>
          <h3 className="font-semibold text-base mt-1 line-clamp-2">{course.title}</h3>
        </div>

        {course.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{course.description}</p>
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {course.estimated_hours}h
          </span>
          {course.lesson_count !== undefined && (
            <span className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              {course.lesson_count} lecciones
            </span>
          )}
          <span className="flex items-center gap-1">
            <BarChart className="w-3.5 h-3.5" />
            {difficultyLabels[course.difficulty]}
          </span>
        </div>

        {/* Progress bar */}
        {enrolled && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Progreso</span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
