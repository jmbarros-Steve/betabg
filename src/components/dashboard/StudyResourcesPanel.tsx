import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Edit2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface StudyResource {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  resource_type: string;
  duration: string | null;
  published: boolean;
  created_at: string;
}

interface Props {
  userId: string;
}

const resourceTypes = [
  { value: 'article', label: 'Artículo' },
  { value: 'video', label: 'Video/Curso' },
  { value: 'guide', label: 'Guía' },
  { value: 'template', label: 'Plantilla' },
  { value: 'webinar', label: 'Webinar' },
];

export function StudyResourcesPanel({ userId }: Props) {
  const [resources, setResources] = useState<StudyResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<StudyResource | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    content: '',
    resource_type: 'article',
    duration: '',
  });

  useEffect(() => {
    fetchResources();
  }, [userId]);

  const fetchResources = async () => {
    const { data, error } = await supabase
      .from('study_resources')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Error al cargar recursos');
    } else {
      setResources(data || []);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.title.trim()) {
      toast.error('El título es requerido');
      return;
    }

    const resourceData = {
      user_id: userId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      content: form.content.trim() || null,
      resource_type: form.resource_type,
      duration: form.duration.trim() || null,
      published: false,
    };

    if (editingResource) {
      const { error } = await supabase
        .from('study_resources')
        .update(resourceData)
        .eq('id', editingResource.id);

      if (error) {
        toast.error('Error al actualizar recurso');
      } else {
        toast.success('Recurso actualizado');
        fetchResources();
      }
    } else {
      const { error } = await supabase.from('study_resources').insert(resourceData);

      if (error) {
        toast.error('Error al crear recurso');
      } else {
        toast.success('Recurso creado');
        fetchResources();
      }
    }

    resetForm();
  };

  const togglePublish = async (resource: StudyResource) => {
    const { error } = await supabase
      .from('study_resources')
      .update({ published: !resource.published })
      .eq('id', resource.id);

    if (error) {
      toast.error('Error al cambiar estado');
    } else {
      toast.success(resource.published ? 'Recurso despublicado' : 'Recurso publicado');
      fetchResources();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('study_resources').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar recurso');
    } else {
      toast.success('Recurso eliminado');
      fetchResources();
    }
  };

  const handleEdit = (resource: StudyResource) => {
    setEditingResource(resource);
    setForm({
      title: resource.title,
      description: resource.description || '',
      content: resource.content || '',
      resource_type: resource.resource_type,
      duration: resource.duration || '',
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setForm({ title: '', description: '', content: '', resource_type: 'article', duration: '' });
    setEditingResource(null);
    setDialogOpen(false);
  };

  const getTypeLabel = (type: string) => {
    return resourceTypes.find(t => t.value === type)?.label || type;
  };

  if (loading) {
    return <div className="animate-pulse h-40 bg-card rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Centro de Estudios</h2>
          <p className="text-muted-foreground">Gestiona los recursos del centro de estudios (requiere login)</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button variant="hero">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Recurso
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingResource ? 'Editar Recurso' : 'Nuevo Recurso'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Título del recurso"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de recurso</Label>
                  <Select value={form.resource_type} onValueChange={(value) => setForm({ ...form, resource_type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {resourceTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="duration">Duración</Label>
                  <Input
                    id="duration"
                    value={form.duration}
                    onChange={(e) => setForm({ ...form, duration: e.target.value })}
                    placeholder="Ej: 2 horas, 30 min..."
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Breve descripción del recurso..."
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="content">Contenido</Label>
                <Textarea
                  id="content"
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="Contenido completo, enlaces, instrucciones..."
                  rows={8}
                />
              </div>
              <Button type="submit" className="w-full">
                {editingResource ? 'Actualizar' : 'Crear Recurso'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {resources.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground">No hay recursos aún</p>
          <p className="text-sm text-muted-foreground mt-1">Crea tu primer recurso para el centro de estudios</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {resources.map((resource, index) => (
            <motion.div
              key={resource.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold">{resource.title}</h3>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                    {getTypeLabel(resource.resource_type)}
                  </span>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${resource.published ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'}`}>
                    {resource.published ? 'Publicado' : 'Borrador'}
                  </span>
                </div>
                {resource.duration && (
                  <p className="text-sm text-muted-foreground">{resource.duration}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => togglePublish(resource)} title={resource.published ? 'Despublicar' : 'Publicar'}>
                  {resource.published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleEdit(resource)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(resource.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
