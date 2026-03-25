import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle2, PlayCircle, Lock, Trophy, ClipboardCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { LessonPlayer } from './LessonPlayer';
import { QuizView } from './QuizView';
import { CertificateView } from './CertificateView';

interface CourseViewProps {
  courseId: string;
  onBack: () => void;
}

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  youtube_video_id: string;
  duration_minutes: number;
  sort_order: number;
  is_free_preview: boolean;
}

interface Quiz {
  id: string;
  title: string;
  passing_score: number;
  course_id: string;
}

interface QuizQuestion {
  id: string;
  quiz_id: string;
  question: string;
  options: string[];
  correct_option: number;
  explanation: string | null;
  sort_order: number;
}

interface Certificate {
  id: string;
  certificate_number: string;
  issued_at: string;
}

type ViewMode = 'lessons' | 'quiz' | 'certificate';

export function CourseView({ courseId, onBack }: CourseViewProps) {
  const { user } = useAuth();
  const [course, setCourse] = useState<any>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [bestScore, setBestScore] = useState<number | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>('lessons');
  const [loading, setLoading] = useState(true);

  const allLessonsCompleted = lessons.length > 0 && lessons.every(l => completedLessons.has(l.id));

  // Load course data
  useEffect(() => {
    if (!courseId || !user) return;

    async function load() {
      setLoading(true);
      try {
        // Fetch course
        const { data: courseData } = await supabase
          .from('academy_courses')
          .select('*')
          .eq('id', courseId)
          .single();
        setCourse(courseData);

        // Fetch lessons
        const { data: lessonData } = await supabase
          .from('academy_lessons')
          .select('*')
          .eq('course_id', courseId)
          .order('sort_order');
        const fetchedLessons = (lessonData || []) as Lesson[];
        setLessons(fetchedLessons);
        if (fetchedLessons.length > 0) setActiveLesson(fetchedLessons[0]);

        // Fetch quiz + questions
        const { data: quizData } = await supabase
          .from('academy_quizzes')
          .select('*')
          .eq('course_id', courseId)
          .limit(1)
          .single();
        if (quizData) {
          setQuiz(quizData as Quiz);
          const { data: qData } = await supabase
            .from('academy_quiz_questions')
            .select('*')
            .eq('quiz_id', quizData.id)
            .order('sort_order');
          setQuizQuestions((qData || []) as QuizQuestion[]);
        }

        // Ensure enrollment
        await supabase
          .from('academy_enrollments')
          .upsert({ user_id: user.id, course_id: courseId }, { onConflict: 'user_id,course_id' });

        // Fetch progress
        const lessonIds = fetchedLessons.map(l => l.id);
        if (lessonIds.length > 0) {
          const { data: progressData } = await supabase
            .from('academy_lesson_progress')
            .select('lesson_id, completed')
            .eq('user_id', user.id)
            .in('lesson_id', lessonIds);
          const completed = new Set((progressData || []).filter(p => p.completed).map(p => p.lesson_id));
          setCompletedLessons(completed);
        }

        // Fetch certificate
        const { data: certData } = await supabase
          .from('academy_certificates')
          .select('*')
          .eq('user_id', user.id)
          .eq('course_id', courseId)
          .limit(1)
          .maybeSingle();
        if (certData) setCertificate(certData as Certificate);

        // Best quiz score
        if (quizData) {
          const { data: attempts } = await supabase
            .from('academy_quiz_attempts')
            .select('score')
            .eq('user_id', user.id)
            .eq('quiz_id', quizData.id)
            .order('score', { ascending: false })
            .limit(1);
          if (attempts && attempts.length > 0) setBestScore(attempts[0].score);
        }
      } catch (err) {
        console.error('Error loading course:', err);
        toast.error('Error al cargar el curso');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [courseId, user]);

  const handleLessonComplete = useCallback(async (lessonId: string) => {
    if (!user || completedLessons.has(lessonId)) return;

    try {
      await supabase
        .from('academy_lesson_progress')
        .upsert(
          { user_id: user.id, lesson_id: lessonId, completed: true, completed_at: new Date().toISOString() },
          { onConflict: 'user_id,lesson_id' }
        );

      setCompletedLessons(prev => new Set([...prev, lessonId]));
      toast.success('Leccion completada');

      // Check if all lessons now completed
      const newCompleted = new Set([...completedLessons, lessonId]);
      const allDone = lessons.every(l => newCompleted.has(l.id));
      if (allDone) {
        // Mark enrollment as completed
        await supabase
          .from('academy_enrollments')
          .update({ completed_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('course_id', courseId);
      }

      // Auto-advance to next lesson
      const currentIndex = lessons.findIndex(l => l.id === lessonId);
      if (currentIndex < lessons.length - 1) {
        setActiveLesson(lessons[currentIndex + 1]);
      }
    } catch {
      toast.error('Error al guardar progreso');
    }
  }, [user, completedLessons, lessons, courseId]);

  const handleQuizSubmit = async (quizId: string, answers: number[], score: number, passed: boolean) => {
    if (!user) return;

    try {
      await supabase
        .from('academy_quiz_attempts')
        .insert({
          user_id: user.id,
          quiz_id: quizId,
          score,
          passed,
          answers: JSON.stringify(answers),
        });

      if (score > (bestScore ?? 0)) setBestScore(score);

      if (passed && !certificate) {
        // Generate certificate
        const certNumber = `SA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const { data: certData } = await supabase
          .from('academy_certificates')
          .insert({
            user_id: user.id,
            course_id: courseId,
            certificate_number: certNumber,
          })
          .select()
          .single();

        if (certData) {
          setCertificate(certData as Certificate);
          toast.success('Certificado generado!');
          setViewMode('certificate');
        }
      }
    } catch {
      toast.error('Error al guardar resultado del quiz');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!course) return null;

  const progress = lessons.length > 0 ? (completedLessons.size / lessons.length) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{course.title}</h1>
          <p className="text-sm text-muted-foreground">{Math.round(progress)}% completado</p>
        </div>
        {certificate && (
          <Button variant="outline" size="sm" onClick={() => setViewMode('certificate')}>
            <Trophy className="w-4 h-4 mr-1" />
            Ver Certificado
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {/* View mode tabs */}
      <div className="flex gap-2">
        <Button
          variant={viewMode === 'lessons' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('lessons')}
        >
          <PlayCircle className="w-4 h-4 mr-1" />
          Lecciones
        </Button>
        {quiz && (
          <Button
            variant={viewMode === 'quiz' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('quiz')}
            disabled={!allLessonsCompleted}
          >
            <ClipboardCheck className="w-4 h-4 mr-1" />
            Examen
            {!allLessonsCompleted && <Lock className="w-3 h-3 ml-1" />}
          </Button>
        )}
        {certificate && (
          <Button
            variant={viewMode === 'certificate' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('certificate')}
          >
            <Trophy className="w-4 h-4 mr-1" />
            Certificado
          </Button>
        )}
      </div>

      {/* Content */}
      {viewMode === 'lessons' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lesson list - sidebar */}
          <div className="lg:col-span-1 space-y-1 order-2 lg:order-1">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
              Lecciones ({completedLessons.size}/{lessons.length})
            </h3>
            {lessons.map((lesson, idx) => {
              const isCompleted = completedLessons.has(lesson.id);
              const isActive = activeLesson?.id === lesson.id;

              return (
                <button
                  key={lesson.id}
                  onClick={() => setActiveLesson(lesson)}
                  className={`w-full text-left p-3 rounded-lg transition-all flex items-start gap-3 ${
                    isActive
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    isCompleted
                      ? 'bg-green-100 text-green-600'
                      : isActive
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-primary' : ''}`}>
                      {lesson.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{lesson.duration_minutes} min</p>
                  </div>
                </button>
              );
            })}

            {/* Quiz unlock indicator */}
            {quiz && (
              <div className={`p-3 rounded-lg border mt-4 ${
                allLessonsCompleted ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'
              }`}>
                <div className="flex items-center gap-2">
                  {allLessonsCompleted ? (
                    <ClipboardCheck className="w-5 h-5 text-amber-600" />
                  ) : (
                    <Lock className="w-5 h-5 text-slate-400" />
                  )}
                  <div>
                    <p className={`text-sm font-medium ${allLessonsCompleted ? 'text-amber-800' : 'text-slate-500'}`}>
                      Examen Final
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {allLessonsCompleted
                        ? 'Disponible — toma el examen'
                        : `Completa todas las lecciones (${completedLessons.size}/${lessons.length})`}
                    </p>
                  </div>
                </div>
                {allLessonsCompleted && (
                  <Button size="sm" className="w-full mt-2" onClick={() => setViewMode('quiz')}>
                    Tomar Examen
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Video player - main area */}
          <div className="lg:col-span-2 order-1 lg:order-2">
            {activeLesson ? (
              <LessonPlayer
                lesson={activeLesson}
                completed={completedLessons.has(activeLesson.id)}
                onComplete={handleLessonComplete}
              />
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <PlayCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Selecciona una leccion para comenzar</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {viewMode === 'quiz' && quiz && (
        <QuizView
          quiz={quiz}
          questions={quizQuestions}
          onSubmit={handleQuizSubmit}
          previousBestScore={bestScore}
        />
      )}

      {viewMode === 'certificate' && certificate && (
        <CertificateView
          certificate={certificate}
          courseName={course.title}
          userName={user?.email || 'Estudiante'}
        />
      )}
    </div>
  );
}
