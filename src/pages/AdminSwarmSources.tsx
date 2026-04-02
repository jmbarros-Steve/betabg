import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radar, ArrowLeft, RefreshCw, Plus, Trash2, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';

interface SwarmSource {
  id: string;
  name: string;
  url: string;
  category: string;
  active: boolean;
  last_used_at: string | null;
  hits: number;
  created_at: string;
}

const CATEGORIES = [
  'meta_ads',
  'google_ads',
  'klaviyo',
  'shopify',
  'anuncios',
  'cross_channel',
  'analisis',
  'sales_learning',
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  meta_ads: 'bg-blue-100 text-blue-700',
  google_ads: 'bg-green-100 text-green-700',
  klaviyo: 'bg-purple-100 text-purple-700',
  shopify: 'bg-emerald-100 text-emerald-700',
  anuncios: 'bg-orange-100 text-orange-700',
  cross_channel: 'bg-indigo-100 text-indigo-700',
  analisis: 'bg-yellow-100 text-yellow-700',
  sales_learning: 'bg-pink-100 text-pink-700',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminSwarmSources() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  const [sources, setSources] = useState<SwarmSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newSource, setNewSource] = useState({ name: '', url: '', category: 'meta_ads' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
    if (!roleLoading && !authLoading && !isSuperAdmin) navigate('/portal');
  }, [authLoading, roleLoading, user, isSuperAdmin]);

  useEffect(() => {
    if (user && isSuperAdmin) fetchSources();
  }, [user, isSuperAdmin]);

  async function fetchSources() {
    setLoading(true);
    const { data } = await supabase
      .from('swarm_sources')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    setSources((data || []) as SwarmSource[]);
    setLoading(false);
  }

  async function handleCreate() {
    if (!newSource.name.trim() || !newSource.url.trim()) return;
    setCreateError('');

    try {
      new URL(newSource.url);
    } catch {
      setCreateError('URL inválida');
      return;
    }

    setCreating(true);
    const { error } = await supabase
      .from('swarm_sources')
      .insert({
        name: newSource.name.trim(),
        url: newSource.url.trim(),
        category: newSource.category,
      });

    if (error) {
      setCreateError(error.message);
      setCreating(false);
      return;
    }

    setNewSource({ name: '', url: '', category: 'meta_ads' });
    setCreateOpen(false);
    setCreating(false);
    await fetchSources();
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase
      .from('swarm_sources')
      .update({ active: !active })
      .eq('id', id);
    setSources((prev) => prev.map((s) => s.id === id ? { ...s, active: !active } : s));
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta fuente?')) return;
    await supabase.from('swarm_sources').delete().eq('id', id);
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return sources;
    return sources.filter((s) => s.category === categoryFilter);
  }, [sources, categoryFilter]);

  const activeSources = sources.filter((s) => s.active);
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of activeSources) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    }
    return counts;
  }, [activeSources]);

  const totalHits = sources.reduce((sum, s) => sum + (s.hits || 0), 0);

  if (authLoading || roleLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Radar className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Fuentes del Swarm</h1>
              <p className="text-sm text-muted-foreground">Autores, canales y blogs preferidos para investigación</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" /> Agregar fuente
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agregar Fuente</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label htmlFor="source-name">Nombre</Label>
                    <Input
                      id="source-name"
                      value={newSource.name}
                      onChange={(e) => setNewSource((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Ej: Sabri Suby, HubSpot Blog"
                    />
                  </div>
                  <div>
                    <Label htmlFor="source-url">URL</Label>
                    <Input
                      id="source-url"
                      value={newSource.url}
                      onChange={(e) => setNewSource((p) => ({ ...p, url: e.target.value }))}
                      placeholder="https://youtube.com/@SabriSuby"
                    />
                  </div>
                  <div>
                    <Label>Categoría</Label>
                    <Select value={newSource.category} onValueChange={(v) => setNewSource((p) => ({ ...p, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat.replace('_', ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {createError && <p className="text-sm text-red-600">{createError}</p>}
                  <Button onClick={handleCreate} disabled={creating || !newSource.name.trim() || !newSource.url.trim()} className="w-full">
                    {creating ? 'Agregando...' : 'Agregar Fuente'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" onClick={fetchSources}>
              <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Activas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{activeSources.length}</div>
              <p className="text-xs text-muted-foreground">{sources.length} total</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Categorías</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{Object.keys(categoryCounts).length}</div>
              <p className="text-xs text-muted-foreground">con fuentes activas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Hits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalHits}</div>
              <p className="text-xs text-muted-foreground">insights generados</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Por Categoría</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {Object.entries(categoryCounts).map(([cat, count]) => (
                  <Badge key={cat} className={`text-xs ${CATEGORY_COLORS[cat] || ''}`}>
                    {cat.replace('_', ' ')} {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter + Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base">
                Fuentes {categoryFilter !== 'all' ? `(${categoryFilter.replace('_', ' ')})` : ''} — {filtered.length}
              </CardTitle>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin fuentes{categoryFilter !== 'all' ? ' en esta categoría' : ''}. Agrega una con el botón +.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3">Nombre</th>
                      <th className="pb-2 pr-3">URL</th>
                      <th className="pb-2 pr-3">Categoría</th>
                      <th className="pb-2 pr-3">Activa</th>
                      <th className="pb-2 pr-3">Hits</th>
                      <th className="pb-2 pr-3">Última vez</th>
                      <th className="pb-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium max-w-[200px] truncate">{s.name}</td>
                        <td className="py-2 pr-3 max-w-[250px] truncate">
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            {s.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge className={`text-xs ${CATEGORY_COLORS[s.category] || ''}`}>
                            {s.category.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">
                          <Switch
                            checked={s.active}
                            onCheckedChange={() => toggleActive(s.id, s.active)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-center">{s.hits}</td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(s.last_used_at)}
                        </td>
                        <td className="py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(s.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
