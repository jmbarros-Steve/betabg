import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  ThumbsUp, ThumbsDown, MessageSquare, Plus, Trash2, Edit, 
  Brain, Sparkles, Target, TrendingUp, TrendingDown, BookOpen,
  Save, X, Filter
} from 'lucide-react';
import logoMeta from '@/assets/logo-meta-clean.png';
import logoGoogle from '@/assets/logo-google-ads.png';

interface TrainingFeedback {
  id: string;
  campaign_id: string;
  platform: string;
  recommendation_type: string;
  original_recommendation: string;
  feedback_rating: 'positive' | 'negative' | 'neutral';
  feedback_notes: string | null;
  improved_recommendation: string | null;
  campaign_metrics: unknown;
  created_at: string;
}

interface TrainingExample {
  id: string;
  title: string;
  platform: string;
  scenario_description: string;
  campaign_metrics: unknown;
  correct_analysis: string;
  incorrect_analysis: string | null;
  tags: string[];
  is_active: boolean;
  created_at: string;
}

interface CampaignRecommendation {
  id: string;
  campaign_id: string;
  platform: string;
  recommendation_type: string;
  recommendation_text: string;
  priority: string;
  connection_id: string;
}

const ratingConfig = {
  positive: { color: 'bg-green-500/10 text-green-500 border-green-500/30', icon: ThumbsUp, label: 'Buena' },
  negative: { color: 'bg-red-500/10 text-red-500 border-red-500/30', icon: ThumbsDown, label: 'Mala' },
  neutral: { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30', icon: MessageSquare, label: 'Neutral' },
};

export function SteveTrainingPanel() {
  const [activeTab, setActiveTab] = useState<'feedback' | 'examples' | 'pending'>('pending');
  const [feedbackList, setFeedbackList] = useState<TrainingFeedback[]>([]);
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [pendingRecs, setPendingRecs] = useState<CampaignRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExampleDialog, setShowExampleDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [selectedRec, setSelectedRec] = useState<CampaignRecommendation | null>(null);
  const [feedbackForm, setFeedbackForm] = useState({
    rating: 'positive' as 'positive' | 'negative' | 'neutral',
    notes: '',
    improved: '',
  });
  const [exampleForm, setExampleForm] = useState({
    title: '',
    platform: 'both',
    scenario: '',
    metrics: '{}',
    correct: '',
    incorrect: '',
    tags: '',
  });
  const [filterPlatform, setFilterPlatform] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [feedbackRes, examplesRes, recsRes] = await Promise.all([
        supabase
          .from('steve_training_feedback')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('steve_training_examples')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('campaign_recommendations')
          .select('*')
          .eq('is_dismissed', false)
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      if (feedbackRes.data) {
        setFeedbackList(feedbackRes.data.map(f => ({
          ...f,
          feedback_rating: f.feedback_rating as 'positive' | 'negative' | 'neutral',
          campaign_metrics: f.campaign_metrics as unknown
        })));
      }
      if (examplesRes.data) {
        setExamples(examplesRes.data.map(e => ({
          ...e,
          campaign_metrics: e.campaign_metrics as unknown
        })));
      }
      if (recsRes.data) setPendingRecs(recsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error cargando datos');
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback() {
    if (!selectedRec) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { error } = await supabase
        .from('steve_training_feedback')
        .insert({
          recommendation_id: selectedRec.id,
          campaign_id: selectedRec.campaign_id,
          platform: selectedRec.platform,
          recommendation_type: selectedRec.recommendation_type,
          original_recommendation: selectedRec.recommendation_text,
          feedback_rating: feedbackForm.rating,
          feedback_notes: feedbackForm.notes || null,
          improved_recommendation: feedbackForm.improved || null,
          campaign_metrics: {},
          created_by: user.id,
        });

      if (error) throw error;

      toast.success('Feedback guardado');
      setShowFeedbackDialog(false);
      setSelectedRec(null);
      setFeedbackForm({ rating: 'positive', notes: '', improved: '' });
      fetchData();
    } catch (error) {
      console.error('Error saving feedback:', error);
      toast.error('Error guardando feedback');
    }
  }

  async function submitExample() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      let metricsJson = {};
      try {
        metricsJson = JSON.parse(exampleForm.metrics);
      } catch {
        metricsJson = {};
      }

      const { error } = await supabase
        .from('steve_training_examples')
        .insert({
          title: exampleForm.title,
          platform: exampleForm.platform,
          scenario_description: exampleForm.scenario,
          campaign_metrics: metricsJson,
          correct_analysis: exampleForm.correct,
          incorrect_analysis: exampleForm.incorrect || null,
          tags: exampleForm.tags.split(',').map(t => t.trim()).filter(Boolean),
          created_by: user.id,
        });

      if (error) throw error;

      toast.success('Ejemplo creado');
      setShowExampleDialog(false);
      setExampleForm({
        title: '',
        platform: 'both',
        scenario: '',
        metrics: '{}',
        correct: '',
        incorrect: '',
        tags: '',
      });
      fetchData();
    } catch (error) {
      console.error('Error saving example:', error);
      toast.error('Error guardando ejemplo');
    }
  }

  async function deleteExample(id: string) {
    try {
      await supabase.from('steve_training_examples').delete().eq('id', id);
      toast.success('Ejemplo eliminado');
      fetchData();
    } catch (error) {
      toast.error('Error eliminando');
    }
  }

  async function toggleExampleActive(id: string, current: boolean) {
    try {
      await supabase
        .from('steve_training_examples')
        .update({ is_active: !current })
        .eq('id', id);
      fetchData();
    } catch (error) {
      toast.error('Error actualizando');
    }
  }

  const openFeedbackDialog = (rec: CampaignRecommendation) => {
    setSelectedRec(rec);
    setFeedbackForm({ rating: 'positive', notes: '', improved: '' });
    setShowFeedbackDialog(true);
  };

  const stats = {
    total: feedbackList.length,
    positive: feedbackList.filter(f => f.feedback_rating === 'positive').length,
    negative: feedbackList.filter(f => f.feedback_rating === 'negative').length,
    examples: examples.filter(e => e.is_active).length,
  };

  const filteredRecs = filterPlatform === 'all' 
    ? pendingRecs 
    : pendingRecs.filter(r => r.platform === filterPlatform);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" />
            Entrenamiento de Steve
          </h2>
          <p className="text-muted-foreground text-sm">
            Mejora las recomendaciones de IA con tu feedback
          </p>
        </div>
        <Button onClick={() => setShowExampleDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Ejemplo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <MessageSquare className="w-3 h-3" />
              Total Feedback
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-green-500 text-xs mb-1">
              <ThumbsUp className="w-3 h-3" />
              Positivos
            </div>
            <p className="text-2xl font-bold text-green-500">{stats.positive}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-red-500 text-xs mb-1">
              <ThumbsDown className="w-3 h-3" />
              Negativos
            </div>
            <p className="text-2xl font-bold text-red-500">{stats.negative}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-primary text-xs mb-1">
              <BookOpen className="w-3 h-3" />
              Ejemplos Activos
            </div>
            <p className="text-2xl font-bold">{stats.examples}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="pending">
              Pendientes ({filteredRecs.length})
            </TabsTrigger>
            <TabsTrigger value="feedback">
              Historial
            </TabsTrigger>
            <TabsTrigger value="examples">
              Ejemplos ({examples.length})
            </TabsTrigger>
          </TabsList>

          {activeTab === 'pending' && (
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="w-40">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="meta">Meta</SelectItem>
                <SelectItem value="google">Google</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Pending Recommendations */}
        <TabsContent value="pending" className="mt-4 space-y-3">
          {filteredRecs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Sparkles className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No hay recomendaciones pendientes de revisar
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredRecs.map((rec, idx) => (
              <motion.div
                key={rec.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <Card className="hover:border-primary/30 transition-colors">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <img 
                            src={rec.platform === 'meta' ? logoMeta : logoGoogle}
                            alt={rec.platform}
                            className="w-5 h-5"
                          />
                          <Badge variant="outline" className="text-xs">
                            {rec.recommendation_type}
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">
                            {rec.priority}
                          </Badge>
                        </div>
                        <p className="text-sm">{rec.recommendation_text}</p>
                      </div>
                      
                      <div className="flex gap-2 shrink-0">
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="text-green-500 hover:bg-green-500/10"
                          onClick={() => {
                            setSelectedRec(rec);
                            setFeedbackForm({ rating: 'positive', notes: '', improved: '' });
                            setShowFeedbackDialog(true);
                          }}
                        >
                          <ThumbsUp className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="text-red-500 hover:bg-red-500/10"
                          onClick={() => {
                            setSelectedRec(rec);
                            setFeedbackForm({ rating: 'negative', notes: '', improved: '' });
                            setShowFeedbackDialog(true);
                          }}
                        >
                          <ThumbsDown className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </TabsContent>

        {/* Feedback History */}
        <TabsContent value="feedback" className="mt-4 space-y-3">
          {feedbackList.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  Aún no has dado feedback. Revisa las recomendaciones pendientes.
                </p>
              </CardContent>
            </Card>
          ) : (
            feedbackList.map((fb, idx) => {
              const config = ratingConfig[fb.feedback_rating];
              const Icon = config.icon;

              return (
                <motion.div
                  key={fb.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  <Card>
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${config.color.split(' ').slice(0, 2).join(' ')}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <img 
                              src={fb.platform === 'meta' ? logoMeta : logoGoogle}
                              alt={fb.platform}
                              className="w-4 h-4"
                            />
                            <Badge variant="outline" className="text-xs">
                              {fb.recommendation_type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(fb.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {fb.original_recommendation}
                          </p>
                          {fb.feedback_notes && (
                            <p className="text-sm bg-muted/50 p-2 rounded">
                              <strong>Notas:</strong> {fb.feedback_notes}
                            </p>
                          )}
                          {fb.improved_recommendation && (
                            <p className="text-sm bg-green-500/10 p-2 rounded mt-2">
                              <strong>Mejor versión:</strong> {fb.improved_recommendation}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })
          )}
        </TabsContent>

        {/* Training Examples */}
        <TabsContent value="examples" className="mt-4 space-y-3">
          {examples.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-4">
                  No hay ejemplos de entrenamiento. Crea el primero.
                </p>
                <Button onClick={() => setShowExampleDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Ejemplo
                </Button>
              </CardContent>
            </Card>
          ) : (
            examples.map((ex, idx) => (
              <motion.div
                key={ex.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <Card className={!ex.is_active ? 'opacity-50' : ''}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium">{ex.title}</h4>
                          <Badge variant="outline" className="text-xs capitalize">
                            {ex.platform}
                          </Badge>
                          {!ex.is_active && (
                            <Badge variant="secondary" className="text-xs">
                              Inactivo
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {ex.scenario_description}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {ex.tags.map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => toggleExampleActive(ex.id, ex.is_active)}
                        >
                          {ex.is_active ? <X className="w-4 h-4" /> : <ThumbsUp className="w-4 h-4" />}
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => deleteExample(ex.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Feedback Dialog */}
      <Dialog open={showFeedbackDialog} onOpenChange={setShowFeedbackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar Feedback</DialogTitle>
          </DialogHeader>
          
          {selectedRec && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-lg text-sm">
                {selectedRec.recommendation_text}
              </div>

              <div className="space-y-2">
                <Label>Rating</Label>
                <div className="flex gap-2">
                  {(['positive', 'negative', 'neutral'] as const).map(rating => {
                    const config = ratingConfig[rating];
                    const Icon = config.icon;
                    return (
                      <Button
                        key={rating}
                        variant={feedbackForm.rating === rating ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFeedbackForm(prev => ({ ...prev, rating }))}
                        className={feedbackForm.rating === rating ? '' : config.color}
                      >
                        <Icon className="w-4 h-4 mr-1" />
                        {config.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <Textarea
                  value={feedbackForm.notes}
                  onChange={(e) => setFeedbackForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="¿Por qué es buena/mala esta recomendación?"
                  rows={2}
                />
              </div>

              {feedbackForm.rating === 'negative' && (
                <div className="space-y-2">
                  <Label>¿Cómo debería ser la recomendación?</Label>
                  <Textarea
                    value={feedbackForm.improved}
                    onChange={(e) => setFeedbackForm(prev => ({ ...prev, improved: e.target.value }))}
                    placeholder="Escribe una mejor versión..."
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFeedbackDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={submitFeedback}>
              <Save className="w-4 h-4 mr-2" />
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Example Dialog */}
      <Dialog open={showExampleDialog} onOpenChange={setShowExampleDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear Ejemplo de Entrenamiento</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={exampleForm.title}
                  onChange={(e) => setExampleForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Ej: ROAS bajo con alto CTR"
                />
              </div>
              <div className="space-y-2">
                <Label>Plataforma</Label>
                <Select 
                  value={exampleForm.platform} 
                  onValueChange={(v) => setExampleForm(prev => ({ ...prev, platform: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Ambas</SelectItem>
                    <SelectItem value="meta">Meta</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Escenario / Situación</Label>
              <Textarea
                value={exampleForm.scenario}
                onChange={(e) => setExampleForm(prev => ({ ...prev, scenario: e.target.value }))}
                placeholder="Describe la situación de la campaña..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Métricas del escenario (JSON)</Label>
              <Textarea
                value={exampleForm.metrics}
                onChange={(e) => setExampleForm(prev => ({ ...prev, metrics: e.target.value }))}
                placeholder='{"roas": 0.8, "ctr": 2.5, "spend": 500}'
                rows={2}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label>Análisis CORRECTO ✅</Label>
              <Textarea
                value={exampleForm.correct}
                onChange={(e) => setExampleForm(prev => ({ ...prev, correct: e.target.value }))}
                placeholder="El análisis que Steve debería dar..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Análisis INCORRECTO ❌ (opcional)</Label>
              <Textarea
                value={exampleForm.incorrect}
                onChange={(e) => setExampleForm(prev => ({ ...prev, incorrect: e.target.value }))}
                placeholder="Ejemplo de lo que NO debería decir..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Tags (separados por coma)</Label>
              <Input
                value={exampleForm.tags}
                onChange={(e) => setExampleForm(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="roas, escalar, pausar, ctr"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExampleDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={submitExample} disabled={!exampleForm.title || !exampleForm.correct}>
              <Save className="w-4 h-4 mr-2" />
              Crear Ejemplo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}