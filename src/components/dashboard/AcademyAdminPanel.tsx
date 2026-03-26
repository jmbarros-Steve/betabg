import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Trash2, Edit2, Eye, EyeOff, BookOpen, HelpCircle,
  BarChart3, GraduationCap, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/* ───────── types ───────── */

interface Course {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  thumbnail_url: string | null;
  category: string;
  difficulty: string;
  estimated_hours: number;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  lesson_count?: number;
}

interface Lesson {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  youtube_video_id: string | null;
  duration_minutes: number;
  sort_order: number;
  is_free_preview: boolean;
  created_at: string;
}

interface Quiz {
  id: string;
  course_id: string;
  title: string;
  passing_score: number;
  created_at: string;
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

interface CourseStats {
  course_id: string;
  title: string;
  enrolled: number;
  completed: number;
  avg_score: number | null;
  certificates: number;
}

type SubTab = 'cursos' | 'lecciones' | 'quizzes' | 'stats';

const CATEGORIES = ['paid_media', 'email', 'analytics', 'strategy', 'shopify', 'social'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

/* ───────── helpers ───────── */

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/* ───────── component ───────── */

export function AcademyAdminPanel() {
  const [subTab, setSubTab] = useState<SubTab>('cursos');

  const subTabs: { id: SubTab; label: string; icon: typeof BookOpen }[] = [
    { id: 'cursos', label: 'Cursos', icon: GraduationCap },
    { id: 'lecciones', label: 'Lecciones', icon: BookOpen },
    { id: 'quizzes', label: 'Quizzes', icon: HelpCircle },
    { id: 'stats', label: 'Estadísticas', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Academy Admin</h2>
        <p className="text-muted-foreground">Gestiona cursos, lecciones y quizzes</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {subTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              subTab === t.id
                ? 'bg-[#1E3A7B] text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'cursos' && <CoursesTab />}
      {subTab === 'lecciones' && <LessonsTab />}
      {subTab === 'quizzes' && <QuizzesTab />}
      {subTab === 'stats' && <StatsTab />}
    </div>
  );
}

/* ═══════════════════════════════════════════
   SUB-TAB 1: CURSOS
   ═══════════════════════════════════════════ */

function CoursesTab() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', slug: '', category: 'paid_media',
    difficulty: 'beginner', estimated_hours: '2', thumbnail_url: '',
    is_published: false,
  });

  useEffect(() => { fetchCourses(); }, []);

  const fetchCourses = async () => {
    const { data, error } = await supabase
      .from('academy_courses')
      .select('*')
      .order('sort_order');
    if (error) { toast.error('Error al cargar cursos'); }
    else {
      // count lessons per course
      const { data: lessons } = await supabase.from('academy_lessons').select('course_id');
      const countMap = new Map<string, number>();
      (lessons || []).forEach((l: { course_id: string }) => {
        countMap.set(l.course_id, (countMap.get(l.course_id) || 0) + 1);
      });
      setCourses((data || []).map((c: Course) => ({ ...c, lesson_count: countMap.get(c.id) || 0 })));
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('El título es requerido'); return; }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      slug: form.slug.trim() || slugify(form.title),
      category: form.category,
      difficulty: form.difficulty,
      estimated_hours: parseFloat(form.estimated_hours) || 2,
      thumbnail_url: form.thumbnail_url.trim() || null,
      is_published: form.is_published,
    };

    if (editing) {
      const { error } = await supabase.from('academy_courses').update(payload).eq('id', editing.id);
      if (error) toast.error('Error al actualizar curso');
      else { toast.success('Curso actualizado'); fetchCourses(); }
    } else {
      const { error } = await supabase.from('academy_courses').insert(payload);
      if (error) toast.error('Error al crear curso');
      else { toast.success('Curso creado'); fetchCourses(); }
    }
    resetForm();
  };

  const handleEdit = (c: Course) => {
    setEditing(c);
    setForm({
      title: c.title, description: c.description || '', slug: c.slug,
      category: c.category, difficulty: c.difficulty,
      estimated_hours: String(c.estimated_hours), thumbnail_url: c.thumbnail_url || '',
      is_published: c.is_published,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este curso y todo su contenido?')) return;
    const { error } = await supabase.from('academy_courses').delete().eq('id', id);
    if (error) toast.error('Error al eliminar');
    else { toast.success('Curso eliminado'); fetchCourses(); }
  };

  const togglePublish = async (c: Course) => {
    const { error } = await supabase.from('academy_courses').update({ is_published: !c.is_published }).eq('id', c.id);
    if (error) toast.error('Error');
    else { toast.success(c.is_published ? 'Curso despublicado' : 'Curso publicado'); fetchCourses(); }
  };

  const resetForm = () => {
    setForm({ title: '', description: '', slug: '', category: 'paid_media', difficulty: 'beginner', estimated_hours: '2', thumbnail_url: '', is_published: false });
    setEditing(null);
    setDialogOpen(false);
  };

  if (loading) return <div className="animate-pulse h-40 bg-white rounded-xl border border-slate-200" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button variant="hero"><Plus className="w-4 h-4 mr-2" />Nuevo Curso</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Curso' : 'Nuevo Curso'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Título *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value, slug: slugify(e.target.value) })} placeholder="Ej: Meta Ads desde cero" required />
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generado" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Categoría</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Dificultad</Label>
                  <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DIFFICULTIES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Horas estimadas</Label>
                <Input type="number" step="0.5" min="0.5" value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} />
              </div>
              <div>
                <Label>Descripción</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Descripción del curso..." />
              </div>
              <div>
                <Label>Thumbnail URL</Label>
                <Input value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />
                <Label>Publicado</Label>
              </div>
              <Button type="submit" className="w-full">{editing ? 'Actualizar' : 'Crear Curso'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {courses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-muted-foreground">No hay cursos aún</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {courses.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="p-4 bg-white border border-slate-200 rounded-xl card-hover flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <h3 className="font-semibold truncate">{c.title}</h3>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${c.is_published ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'}`}>
                    {c.is_published ? 'Publicado' : 'Borrador'}
                  </span>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/10 text-blue-600">{c.category}</span>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/10 text-purple-600">{c.difficulty}</span>
                </div>
                <p className="text-sm text-muted-foreground">{c.lesson_count || 0} lecciones · {c.estimated_hours}h</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="icon" onClick={() => togglePublish(c)} title={c.is_published ? 'Despublicar' : 'Publicar'}>
                  {c.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}><Edit2 className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   SUB-TAB 2: LECCIONES
   ═══════════════════════════════════════════ */

function LessonsTab() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', youtube_video_id: '',
    duration_minutes: '10', sort_order: '1', is_free_preview: false,
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('academy_courses').select('id, title').order('sort_order');
      setCourses((data as Course[]) || []);
      if (data && data.length > 0) setSelectedCourse(data[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (selectedCourse) fetchLessons();
  }, [selectedCourse]);

  const fetchLessons = async () => {
    const { data, error } = await supabase
      .from('academy_lessons')
      .select('*')
      .eq('course_id', selectedCourse)
      .order('sort_order');
    if (error) toast.error('Error al cargar lecciones');
    else setLessons(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !selectedCourse) { toast.error('Título y curso requeridos'); return; }

    const payload = {
      course_id: selectedCourse,
      title: form.title.trim(),
      description: form.description.trim() || null,
      youtube_video_id: form.youtube_video_id.trim() || null,
      duration_minutes: parseInt(form.duration_minutes) || 10,
      sort_order: parseInt(form.sort_order) || 1,
      is_free_preview: form.is_free_preview,
    };

    if (editing) {
      const { error } = await supabase.from('academy_lessons').update(payload).eq('id', editing.id);
      if (error) toast.error('Error al actualizar lección');
      else { toast.success('Lección actualizada'); fetchLessons(); }
    } else {
      const { error } = await supabase.from('academy_lessons').insert(payload);
      if (error) toast.error('Error al crear lección');
      else { toast.success('Lección creada'); fetchLessons(); }
    }
    resetForm();
  };

  const handleEdit = (l: Lesson) => {
    setEditing(l);
    setForm({
      title: l.title, description: l.description || '',
      youtube_video_id: l.youtube_video_id || '',
      duration_minutes: String(l.duration_minutes), sort_order: String(l.sort_order),
      is_free_preview: l.is_free_preview,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta lección?')) return;
    const { error } = await supabase.from('academy_lessons').delete().eq('id', id);
    if (error) toast.error('Error al eliminar');
    else { toast.success('Lección eliminada'); fetchLessons(); }
  };

  const resetForm = () => {
    setForm({ title: '', description: '', youtube_video_id: '', duration_minutes: '10', sort_order: '1', is_free_preview: false });
    setEditing(null);
    setDialogOpen(false);
  };

  if (loading) return <div className="animate-pulse h-40 bg-white rounded-xl border border-slate-200" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="w-72">
          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger><SelectValue placeholder="Selecciona un curso" /></SelectTrigger>
            <SelectContent>
              {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button variant="hero" disabled={!selectedCourse}><Plus className="w-4 h-4 mr-2" />Nueva Lección</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Lección' : 'Nueva Lección'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Título *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div>
                <Label>Descripción</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>YouTube Video ID</Label>
                <Input value={form.youtube_video_id} onChange={(e) => setForm({ ...form, youtube_video_id: e.target.value })} placeholder="Ej: dQw4w9WgXcQ" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Duración (min)</Label>
                  <Input type="number" min="1" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} />
                </div>
                <div>
                  <Label>Orden</Label>
                  <Input type="number" min="1" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.is_free_preview} onCheckedChange={(v) => setForm({ ...form, is_free_preview: v })} />
                <Label>Preview gratuito</Label>
              </div>
              <Button type="submit" className="w-full">{editing ? 'Actualizar' : 'Crear Lección'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!selectedCourse ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-muted-foreground">Selecciona un curso para ver sus lecciones</p>
        </div>
      ) : lessons.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-muted-foreground">No hay lecciones en este curso</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {lessons.map((l, i) => (
            <motion.div key={l.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="p-4 bg-white border border-slate-200 rounded-xl card-hover flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <span className="text-xs font-bold text-slate-400">#{l.sort_order}</span>
                  <h3 className="font-semibold truncate">{l.title}</h3>
                  {l.is_free_preview && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/10 text-green-600">Free</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{l.duration_minutes} min{l.youtube_video_id ? ` · Video: ${l.youtube_video_id}` : ''}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(l)}><Edit2 className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(l.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   SUB-TAB 3: QUIZZES & PREGUNTAS
   ═══════════════════════════════════════════ */

function QuizzesTab() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<QuizQuestion | null>(null);
  const [passingScore, setPassingScore] = useState('70');
  const [form, setForm] = useState({
    question: '', option0: '', option1: '', option2: '', option3: '',
    correct_option: '0', explanation: '', sort_order: '1',
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('academy_courses').select('id, title').order('sort_order');
      setCourses((data as Course[]) || []);
      if (data && data.length > 0) setSelectedCourse(data[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (selectedCourse) fetchQuiz();
  }, [selectedCourse]);

  const fetchQuiz = async () => {
    const { data: quizData } = await supabase
      .from('academy_quizzes')
      .select('*')
      .eq('course_id', selectedCourse)
      .limit(1)
      .maybeSingle();

    if (quizData) {
      setQuiz(quizData);
      setPassingScore(String(quizData.passing_score));
      const { data: qData } = await supabase
        .from('academy_quiz_questions')
        .select('*')
        .eq('quiz_id', quizData.id)
        .order('sort_order');
      setQuestions((qData || []).map((q: any) => ({
        ...q,
        options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
      })));
    } else {
      setQuiz(null);
      setQuestions([]);
    }
  };

  const createQuiz = async () => {
    if (!selectedCourse) return;
    const course = courses.find((c) => c.id === selectedCourse);
    const { error } = await supabase.from('academy_quizzes').insert({
      course_id: selectedCourse,
      title: `Quiz: ${course?.title || 'Curso'}`,
      passing_score: 70,
    });
    if (error) toast.error('Error al crear quiz');
    else { toast.success('Quiz creado'); fetchQuiz(); }
  };

  const updatePassingScore = async () => {
    if (!quiz) return;
    const score = parseInt(passingScore);
    if (isNaN(score) || score < 0 || score > 100) { toast.error('Score entre 0 y 100'); return; }
    const { error } = await supabase.from('academy_quizzes').update({ passing_score: score }).eq('id', quiz.id);
    if (error) toast.error('Error');
    else toast.success('Passing score actualizado');
  };

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quiz) return;
    if (!form.question.trim() || !form.option0.trim() || !form.option1.trim()) {
      toast.error('Pregunta y al menos 2 opciones requeridas'); return;
    }

    const options = [form.option0, form.option1, form.option2, form.option3].filter((o) => o.trim());
    const payload = {
      quiz_id: quiz.id,
      question: form.question.trim(),
      options: JSON.stringify(options),
      correct_option: parseInt(form.correct_option),
      explanation: form.explanation.trim() || null,
      sort_order: parseInt(form.sort_order) || 1,
    };

    if (editing) {
      const { error } = await supabase.from('academy_quiz_questions').update(payload).eq('id', editing.id);
      if (error) toast.error('Error al actualizar');
      else { toast.success('Pregunta actualizada'); fetchQuiz(); }
    } else {
      const { error } = await supabase.from('academy_quiz_questions').insert(payload);
      if (error) toast.error('Error al crear');
      else { toast.success('Pregunta creada'); fetchQuiz(); }
    }
    resetForm();
  };

  const handleEditQuestion = (q: QuizQuestion) => {
    setEditing(q);
    setForm({
      question: q.question,
      option0: q.options[0] || '', option1: q.options[1] || '',
      option2: q.options[2] || '', option3: q.options[3] || '',
      correct_option: String(q.correct_option),
      explanation: q.explanation || '', sort_order: String(q.sort_order),
    });
    setDialogOpen(true);
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('¿Eliminar esta pregunta?')) return;
    const { error } = await supabase.from('academy_quiz_questions').delete().eq('id', id);
    if (error) toast.error('Error');
    else { toast.success('Pregunta eliminada'); fetchQuiz(); }
  };

  const resetForm = () => {
    setForm({ question: '', option0: '', option1: '', option2: '', option3: '', correct_option: '0', explanation: '', sort_order: '1' });
    setEditing(null);
    setDialogOpen(false);
  };

  if (loading) return <div className="animate-pulse h-40 bg-white rounded-xl border border-slate-200" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-72">
          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger><SelectValue placeholder="Selecciona un curso" /></SelectTrigger>
            <SelectContent>
              {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedCourse ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-muted-foreground">Selecciona un curso</p>
        </div>
      ) : !quiz ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 space-y-3">
          <p className="text-muted-foreground">Este curso no tiene quiz</p>
          <Button onClick={createQuiz} variant="hero"><Plus className="w-4 h-4 mr-2" />Crear Quiz</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quiz info */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center gap-4 flex-wrap">
            <span className="font-semibold">{quiz.title}</span>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Passing Score:</Label>
              <Input type="number" min="0" max="100" className="w-20" value={passingScore}
                onChange={(e) => setPassingScore(e.target.value)} />
              <span className="text-sm text-muted-foreground">%</span>
              <Button size="sm" variant="outline" onClick={updatePassingScore}>Guardar</Button>
            </div>
          </div>

          {/* Questions */}
          <div className="flex justify-end">
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button variant="hero"><Plus className="w-4 h-4 mr-2" />Nueva Pregunta</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editing ? 'Editar Pregunta' : 'Nueva Pregunta'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmitQuestion} className="space-y-4">
                  <div>
                    <Label>Pregunta *</Label>
                    <Textarea value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} rows={2} required />
                  </div>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i}>
                      <Label>Opción {i + 1} {i < 2 ? '*' : ''}</Label>
                      <Input
                        value={(form as any)[`option${i}`]}
                        onChange={(e) => setForm({ ...form, [`option${i}`]: e.target.value })}
                        required={i < 2}
                      />
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Respuesta correcta</Label>
                      <Select value={form.correct_option} onValueChange={(v) => setForm({ ...form, correct_option: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[0, 1, 2, 3].map((i) => <SelectItem key={i} value={String(i)}>Opción {i + 1}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Orden</Label>
                      <Input type="number" min="1" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>Explicación</Label>
                    <Textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} rows={2} placeholder="Explica por qué esta es la respuesta correcta..." />
                  </div>
                  <Button type="submit" className="w-full">{editing ? 'Actualizar' : 'Crear Pregunta'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {questions.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-xl border border-slate-200">
              <p className="text-muted-foreground">No hay preguntas en este quiz</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {questions.map((q, i) => (
                <motion.div key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className="p-4 bg-white border border-slate-200 rounded-xl card-hover"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-slate-400">#{q.sort_order}</span>
                        <h3 className="font-semibold">{q.question}</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {q.options.map((opt, oi) => (
                          <span key={oi} className={`text-sm px-2 py-1 rounded ${oi === q.correct_option ? 'bg-green-500/10 text-green-700 font-medium' : 'text-slate-500'}`}>
                            {String.fromCharCode(65 + oi)}) {opt}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => handleEditQuestion(q)}><Edit2 className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteQuestion(q.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   SUB-TAB 4: ESTADÍSTICAS
   ═══════════════════════════════════════════ */

function StatsTab() {
  const [stats, setStats] = useState<CourseStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    const { data: courses } = await supabase.from('academy_courses').select('id, title').order('sort_order');
    if (!courses) { setLoading(false); return; }

    const results: CourseStats[] = [];
    for (const course of courses) {
      const [enrollRes, completedRes, certRes, attemptsRes] = await Promise.all([
        supabase.from('academy_enrollments').select('id', { count: 'exact', head: true }).eq('course_id', course.id),
        supabase.from('academy_enrollments').select('id', { count: 'exact', head: true }).eq('course_id', course.id).not('completed_at', 'is', null),
        supabase.from('academy_certificates').select('id', { count: 'exact', head: true }).eq('course_id', course.id),
        supabase.from('academy_quiz_attempts').select('score, quiz_id').eq(
          'quiz_id',
          // get quiz_id for this course
          (await supabase.from('academy_quizzes').select('id').eq('course_id', course.id).limit(1).maybeSingle()).data?.id || ''
        ),
      ]);

      const scores = (attemptsRes.data || []).map((a: any) => a.score);
      results.push({
        course_id: course.id,
        title: course.title,
        enrolled: enrollRes.count || 0,
        completed: completedRes.count || 0,
        avg_score: scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : null,
        certificates: certRes.count || 0,
      });
    }

    setStats(results);
    setLoading(false);
  };

  if (loading) return <div className="animate-pulse h-40 bg-white rounded-xl border border-slate-200" />;

  const totalEnrolled = stats.reduce((s, c) => s + c.enrolled, 0);
  const totalCompleted = stats.reduce((s, c) => s + c.completed, 0);
  const totalCerts = stats.reduce((s, c) => s + c.certificates, 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Inscritos', value: totalEnrolled },
          { label: 'Completados', value: totalCompleted },
          { label: 'Tasa Completación', value: totalEnrolled > 0 ? `${Math.round((totalCompleted / totalEnrolled) * 100)}%` : '—' },
          { label: 'Certificados', value: totalCerts },
        ].map((card) => (
          <div key={card.label} className="p-4 bg-white border border-slate-200 rounded-xl text-center">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="text-2xl font-bold mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Per course */}
      <div className="grid gap-3">
        {stats.map((s, i) => (
          <motion.div key={s.course_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className="p-4 bg-white border border-slate-200 rounded-xl"
          >
            <h3 className="font-semibold mb-2">{s.title}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Inscritos</span>
                <p className="font-medium">{s.enrolled}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Completados</span>
                <p className="font-medium">{s.completed}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Promedio Quiz</span>
                <p className="font-medium">{s.avg_score !== null ? `${s.avg_score}%` : '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Certificados</span>
                <p className="font-medium">{s.certificates}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
