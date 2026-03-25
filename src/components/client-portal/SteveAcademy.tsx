import { useEffect, useState } from 'react';
import { GraduationCap, BookOpen, Trophy, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CourseCard } from './academy/CourseCard';
import { CourseView } from './academy/CourseView';

interface SteveAcademyProps {
  clientId: string;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  thumbnail_url: string | null;
  category: string;
  difficulty: string;
  estimated_hours: number;
  sort_order: number;
  lesson_count?: number;
}

interface Enrollment {
  course_id: string;
  completed_at: string | null;
}

interface LessonProgress {
  lesson_id: string;
  completed: boolean;
}

export function SteveAcademy({ clientId }: SteveAcademyProps) {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Map<string, Enrollment>>(new Map());
  const [progressMap, setProgressMap] = useState<Map<string, number>>(new Map()); // courseId -> % progress
  const [certificates, setCertificates] = useState<Set<string>>(new Set()); // courseIds with cert
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      setLoading(true);
      try {
        // Fetch published courses
        const { data: coursesData } = await supabase
          .from('academy_courses')
          .select('*')
          .eq('is_published', true)
          .order('sort_order');

        const fetchedCourses = (coursesData || []) as Course[];

        // Fetch lesson counts per course
        const courseIds = fetchedCourses.map(c => c.id);
        if (courseIds.length > 0) {
          const { data: lessonsData } = await supabase
            .from('academy_lessons')
            .select('id, course_id')
            .in('course_id', courseIds);

          const lessonCountMap = new Map<string, number>();
          const lessonsByCourse = new Map<string, string[]>();
          (lessonsData || []).forEach(l => {
            lessonCountMap.set(l.course_id, (lessonCountMap.get(l.course_id) || 0) + 1);
            const existing = lessonsByCourse.get(l.course_id) || [];
            existing.push(l.id);
            lessonsByCourse.set(l.course_id, existing);
          });

          fetchedCourses.forEach(c => {
            c.lesson_count = lessonCountMap.get(c.id) || 0;
          });

          // Fetch enrollments
          const { data: enrollData } = await supabase
            .from('academy_enrollments')
            .select('course_id, completed_at')
            .eq('user_id', user.id);

          const enrollMap = new Map<string, Enrollment>();
          (enrollData || []).forEach(e => enrollMap.set(e.course_id, e as Enrollment));
          setEnrollments(enrollMap);

          // Fetch all lesson progress
          const allLessonIds = (lessonsData || []).map(l => l.id);
          if (allLessonIds.length > 0) {
            const { data: progressData } = await supabase
              .from('academy_lesson_progress')
              .select('lesson_id, completed')
              .eq('user_id', user.id)
              .in('lesson_id', allLessonIds);

            const completedSet = new Set(
              (progressData || []).filter(p => p.completed).map(p => p.lesson_id)
            );

            const pMap = new Map<string, number>();
            lessonsByCourse.forEach((lessonIds, courseId) => {
              const completed = lessonIds.filter(id => completedSet.has(id)).length;
              pMap.set(courseId, lessonIds.length > 0 ? (completed / lessonIds.length) * 100 : 0);
            });
            setProgressMap(pMap);
          }

          // Fetch certificates
          const { data: certData } = await supabase
            .from('academy_certificates')
            .select('course_id')
            .eq('user_id', user.id);
          setCertificates(new Set((certData || []).map(c => c.course_id)));
        }

        setCourses(fetchedCourses);
      } catch (err) {
        console.error('Error loading academy:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user]);

  // Filter courses by search
  const filtered = courses.filter(c =>
    !searchQuery ||
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const enrolledCount = enrollments.size;
  const completedCount = certificates.size;

  if (selectedCourseId) {
    return (
      <CourseView
        courseId={selectedCourseId}
        onBack={() => setSelectedCourseId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Steve Academy</h1>
            <p className="text-sm text-muted-foreground">Aprende marketing digital y certifícate</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {enrolledCount > 0 && (
            <Badge variant="outline" className="text-xs">
              <BookOpen className="w-3 h-3 mr-1" />
              {enrolledCount} inscritos
            </Badge>
          )}
          {completedCount > 0 && (
            <Badge className="bg-amber-100 text-amber-800 text-xs">
              <Trophy className="w-3 h-3 mr-1" />
              {completedCount} certificados
            </Badge>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar cursos..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No se encontraron cursos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(course => (
            <CourseCard
              key={course.id}
              course={course}
              enrolled={enrollments.has(course.id)}
              progress={progressMap.get(course.id) || 0}
              onClick={() => setSelectedCourseId(course.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
