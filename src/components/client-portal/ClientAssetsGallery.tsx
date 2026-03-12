import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Pencil, Check, ImageIcon, Loader2, AlertTriangle, Plus, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ClientAsset {
  id: string;
  url: string;
  nombre: string;
  tipo: string;
  created_at: string;
}

interface ClientAssetsGalleryProps {
  clientId: string;
  /** When true, show a compact banner-only version (used inside CopyGenerator) */
  compact?: boolean;
  onAssetsLoaded?: (assets: ClientAsset[]) => void;
}

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  producto: { label: 'Producto', color: 'bg-blue-100 text-blue-700' },
  lifestyle: { label: 'Lifestyle', color: 'bg-purple-100 text-purple-700' },
  logo: { label: 'Logo', color: 'bg-amber-100 text-amber-700' },
  otro: { label: 'Otro', color: 'bg-gray-100 text-gray-600' },
};

const MAX_ASSETS = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ClientAssetsGallery({ clientId, compact = false, onAssetsLoaded }: ClientAssetsGalleryProps) {
  const [assets, setAssets] = useState<ClientAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<ClientAsset | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showGallery, setShowGallery] = useState(!compact);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAssets();
  }, [clientId]);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('client_assets')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAssets(data || []);
      onAssetsLoaded?.(data || []);
    } catch {
      // Error handled by toast
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = MAX_ASSETS - assets.length;
    if (remaining <= 0) {
      toast.error(`Límite de ${MAX_ASSETS} imágenes alcanzado`);
      return;
    }

    const toUpload = files.slice(0, remaining);
    const invalid = toUpload.filter(f => !ALLOWED_TYPES.includes(f.type) || f.size > MAX_FILE_SIZE);
    if (invalid.length) {
      toast.error('Algunos archivos no son válidos (solo jpg/png/webp, max 10MB)');
    }

    const valid = toUpload.filter(f => ALLOWED_TYPES.includes(f.type) && f.size <= MAX_FILE_SIZE);
    if (!valid.length) return;

    setUploading(true);
    let uploaded = 0;

    for (const file of valid) {
      try {
        const ext = file.name.split('.').pop();
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const path = `assets/${clientId}/products/${filename}`;

        const { error: storageError } = await supabase.storage
          .from('client-assets')
          .upload(path, file, { upsert: false });

        if (storageError) throw storageError;

        const { data: { publicUrl } } = supabase.storage
          .from('client-assets')
          .getPublicUrl(path);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: asset, error: dbError } = await (supabase as any)
          .from('client_assets')
          .insert({
            client_id: clientId,
            url: publicUrl,
            nombre: file.name.replace(/\.[^.]+$/, ''),
            tipo: 'producto',
          })
          .select()
          .single();

        if (dbError) throw dbError;
        setAssets(prev => [asset, ...prev]);
        onAssetsLoaded?.([asset, ...assets]);
        uploaded++;
      } catch {
        toast.error(`Error subiendo ${file.name}`);
      }
    }

    if (uploaded > 0) {
      toast.success(`${uploaded} imagen${uploaded > 1 ? 'es' : ''} subida${uploaded > 1 ? 's' : ''} correctamente`);
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (asset: ClientAsset) => {
    try {
      // Extract path from URL
      const url = new URL(asset.url);
      const pathParts = url.pathname.split('/object/public/client-assets/');
      const storagePath = pathParts[1];

      if (storagePath) {
        await supabase.storage.from('client-assets').remove([storagePath]);
      }

      await (supabase as any).from('client_assets').delete().eq('id', asset.id);
      const updated = assets.filter(a => a.id !== asset.id);
      setAssets(updated);
      onAssetsLoaded?.(updated);
      setSelectedAsset(null);
      toast.success('Imagen eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const handleUpdateNombre = async (asset: ClientAsset) => {
    if (!editName.trim()) return;
    try {
      await (supabase as any).from('client_assets').update({ nombre: editName.trim() }).eq('id', asset.id);
      setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, nombre: editName.trim() } : a));
      setEditingId(null);
      toast.success('Nombre actualizado');
    } catch (err) {
      toast.error('Error al actualizar');
    }
  };

  const handleUpdateTipo = async (asset: ClientAsset, tipo: string) => {
    try {
      await (supabase as any).from('client_assets').update({ tipo }).eq('id', asset.id);
      setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, tipo } : a));
    } catch (err) {
      toast.error('Error al actualizar tipo');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Cargando fotos...</span>
      </div>
    );
  }

  // Compact mode: only show warning banner if < 3 photos
  if (compact) {
    if (assets.length >= 3) return null;
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 mb-4">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-800 flex-1">
          ⚠️ Sube al menos 3 fotos de tus productos para que Steve genere copies más precisos
        </p>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-400 text-amber-700 hover:bg-amber-100 shrink-0"
          onClick={() => {
            const el = document.getElementById('assets-tab-trigger');
            el?.click();
          }}
        >
          Subir ahora
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <ImageIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Mis Assets</h3>
            <p className="text-xs text-muted-foreground">{assets.length}/{MAX_ASSETS} imágenes</p>
          </div>
        </div>
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || assets.length >= MAX_ASSETS}
          size="sm"
        >
          {uploading ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" />Subiendo...</>
          ) : (
            <><Plus className="w-4 h-4 mr-2" />Subir fotos</>
          )}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Empty state */}
      {assets.length === 0 && (
        <div
          className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium mb-1">Sube fotos de tus productos</p>
          <p className="text-sm text-muted-foreground">JPG, PNG, WEBP — máx. 10MB por imagen, hasta 20 imágenes</p>
        </div>
      )}

      {/* Grid gallery */}
      {assets.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {assets.map(asset => (
            <motion.div
              key={asset.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="group relative aspect-square rounded-lg overflow-hidden border border-border cursor-pointer hover:border-primary/60 transition-colors"
              onClick={() => setSelectedAsset(asset)}
            >
              <img
                src={asset.url}
                alt={asset.nombre}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="absolute top-1 left-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TIPO_LABELS[asset.tipo]?.color || TIPO_LABELS.otro.color}`}>
                  {TIPO_LABELS[asset.tipo]?.label || 'Otro'}
                </span>
              </div>
            </motion.div>
          ))}

          {/* Upload more tile */}
          {assets.length < MAX_ASSETS && (
            <div
              className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-6 h-6 text-muted-foreground mb-1" />
              <span className="text-xs text-muted-foreground">Subir más</span>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {selectedAsset && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setSelectedAsset(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-card rounded-xl overflow-hidden shadow-2xl max-w-lg w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative">
                <img
                  src={selectedAsset.url}
                  alt={selectedAsset.nombre}
                  className="w-full max-h-80 object-contain bg-muted"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white"
                  onClick={() => setSelectedAsset(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="p-4 space-y-3">
                {/* Nombre editable */}
                <div className="flex items-center gap-2">
                  {editingId === selectedAsset.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="flex-1"
                        onKeyDown={e => e.key === 'Enter' && handleUpdateNombre(selectedAsset)}
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" onClick={() => handleUpdateNombre(selectedAsset)}>
                        <Check className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="font-medium flex-1 truncate">{selectedAsset.nombre}</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => { setEditingId(selectedAsset.id); setEditName(selectedAsset.nombre); }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>

                {/* Tipo selector */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Tipo:</span>
                  <Select
                    value={selectedAsset.tipo}
                    onValueChange={val => {
                      handleUpdateTipo(selectedAsset, val);
                      setSelectedAsset(prev => prev ? { ...prev, tipo: val } : null);
                    }}
                  >
                    <SelectTrigger className="w-36 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="producto">Producto</SelectItem>
                      <SelectItem value="lifestyle">Lifestyle</SelectItem>
                      <SelectItem value="logo">Logo</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Delete */}
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => handleDelete(selectedAsset)}
                >
                  <X className="w-4 h-4 mr-2" />
                  Eliminar imagen
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
