import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  Upload, Image, Trash2, Loader2, Globe, Search,
  Camera, Palette, FileImage, X
} from 'lucide-react';

interface BrandAssetUploaderProps {
  clientId: string;
  onResearchComplete?: () => void;
}

type AssetCategory = 'logo' | 'products' | 'ads';

const CATEGORY_CONFIG: Record<AssetCategory, { label: string; icon: React.ReactNode; description: string; accept: string }> = {
  logo: { label: 'Logo', icon: <Palette className="h-5 w-5" />, description: 'Logo de tu marca (PNG, SVG, JPG)', accept: 'image/*' },
  products: { label: 'Productos', icon: <Camera className="h-5 w-5" />, description: 'Fotos de tus productos principales', accept: 'image/*' },
  ads: { label: 'Anuncios', icon: <FileImage className="h-5 w-5" />, description: 'Creativos de anuncios actuales', accept: 'image/*,video/*' },
};

export function BrandAssetUploader({ clientId, onResearchComplete }: BrandAssetUploaderProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState<AssetCategory | null>(null);
  const [assets, setAssets] = useState<Record<AssetCategory, string[]>>({ logo: [], products: [], ads: [] });
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [competitorUrls, setCompetitorUrls] = useState(['', '', '']);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRefs = useRef<Record<AssetCategory, HTMLInputElement | null>>({ logo: null, products: null, ads: null });

  useEffect(() => {
    loadAssets();
  }, [clientId]);

  async function loadAssets() {
    if (!user) return;
    const categories: AssetCategory[] = ['logo', 'products', 'ads'];
    const loaded: Record<AssetCategory, string[]> = { logo: [], products: [], ads: [] };

    for (const cat of categories) {
      const { data } = await supabase.storage
        .from('client-assets')
        .list(`${user.id}/${cat}`, { limit: 20 });

      if (data) {
        loaded[cat] = data.map(f => {
          const { data: urlData } = supabase.storage.from('client-assets').getPublicUrl(`${user.id}/${cat}/${f.name}`);
          return urlData.publicUrl;
        });
      }
    }
    setAssets(loaded);

    // Load website URL and competitor URLs from client + brief
    const { data: clientData } = await supabase
      .from('clients')
      .select('website_url')
      .eq('id', clientId)
      .single();
    if (clientData?.website_url) setWebsiteUrl(clientData.website_url);

    // Auto-populate competitor URLs from brief (Q9 competitors response)
    const { data: persona } = await supabase
      .from('buyer_personas')
      .select('persona_data')
      .eq('client_id', clientId)
      .maybeSingle();

    if (persona?.persona_data) {
      const pd = persona.persona_data as any;
      const questions: string[] = pd.questions || [];
      const responses: string[] = pd.raw_responses || [];
      const competitorIdx = questions.indexOf('competitors');
      if (competitorIdx >= 0 && responses[competitorIdx]) {
        const compResponse = responses[competitorIdx];
        // Extract URLs from competitor response text
        const urlMatches = compResponse.match(/(?:https?:\/\/)?(?:www\.)?[\w-]+\.[\w.]+(?:\/\S*)?/g) || [];
        const extractedUrls = urlMatches.slice(0, 3);
        if (extractedUrls.length > 0) {
          setCompetitorUrls(prev => {
            const newUrls = [...prev];
            extractedUrls.forEach((url, i) => {
              if (!newUrls[i] && url) {
                newUrls[i] = url.startsWith('http') ? url : `https://${url}`;
              }
            });
            return newUrls;
          });
        }
      }
    }
  }

  async function handleUpload(category: AssetCategory, files: FileList | null) {
    if (!files || !user) return;
    setUploading(category);

    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop();
        const path = `${user.id}/${category}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

        const { error } = await supabase.storage.from('client-assets').upload(path, file);
        if (error) throw error;

        const { data: urlData } = supabase.storage.from('client-assets').getPublicUrl(path);
        newUrls.push(urlData.publicUrl);
      }

      setAssets(prev => ({ ...prev, [category]: [...prev[category], ...newUrls] }));

      // If it's a logo, also update client record
      if (category === 'logo' && newUrls.length > 0) {
        await supabase.from('clients').update({ logo_url: newUrls[newUrls.length - 1] }).eq('id', clientId);
      }

      toast.success(`${files.length} archivo(s) subido(s)`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Error al subir archivo');
    } finally {
      setUploading(null);
    }
  }

  async function handleDeleteAsset(category: AssetCategory, url: string) {
    if (!user) return;
    try {
      // Extract path from URL
      const pathMatch = url.match(/client-assets\/(.+)$/);
      if (pathMatch) {
        await supabase.storage.from('client-assets').remove([pathMatch[1]]);
      }
      setAssets(prev => ({ ...prev, [category]: prev[category].filter(u => u !== url) }));
      toast.success('Archivo eliminado');
    } catch (error) {
      console.error('Delete error:', error);
    }
  }

  async function handleAnalyze() {
    if (!websiteUrl.trim()) {
      toast.error('Ingresa la URL de tu sitio web');
      return;
    }
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: {
          client_id: clientId,
          website_url: websiteUrl.trim(),
          competitor_urls: competitorUrls.filter(u => u.trim()),
        },
      });

      if (error) throw error;
      toast.success('¡Análisis completado! Revisa tu Brief.');
      onResearchComplete?.();
    } catch (error: any) {
      console.error('Analysis error:', error);
      if (error?.status === 429) {
        toast.error('Demasiadas solicitudes. Espera un momento.');
      } else {
        toast.error('Error en el análisis. Intenta de nuevo.');
      }
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Asset Upload Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.entries(CATEGORY_CONFIG) as [AssetCategory, typeof CATEGORY_CONFIG.logo][]).map(([cat, config]) => (
          <Card key={cat} className="relative">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                {config.icon}
                {config.label}
              </CardTitle>
              <CardDescription className="text-xs">{config.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Preview thumbnails */}
              {assets[cat].length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {assets[cat].map((url, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={url}
                        alt={`${config.label} ${i + 1}`}
                        className="h-16 w-16 object-cover rounded-lg border border-border"
                      />
                      <button
                        onClick={() => handleDeleteAsset(cat, url)}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                type="file"
                ref={el => fileRefs.current[cat] = el}
                accept={config.accept}
                multiple={cat !== 'logo'}
                onChange={e => handleUpload(cat, e.target.files)}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={uploading === cat}
                onClick={() => fileRefs.current[cat]?.click()}
              >
                {uploading === cat ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Subiendo...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Subir {config.label}</>
                )}
              </Button>
              {assets[cat].length > 0 && (
                <Badge variant="secondary" className="mt-2 text-xs">
                  {assets[cat].length} archivo(s)
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Website & Competitor Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Análisis Automático
          </CardTitle>
          <CardDescription>
            Steve analiza tu sitio web, competidores, SEO y palabras clave automáticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Tu Sitio Web *</Label>
            <div className="flex gap-2 mt-1">
              <Globe className="h-4 w-4 mt-2.5 text-muted-foreground flex-shrink-0" />
              <Input
                value={websiteUrl}
                onChange={e => setWebsiteUrl(e.target.value)}
                placeholder="https://tusitio.com"
                type="url"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">URLs de Competidores (hasta 3)</Label>
            {competitorUrls.map((url, i) => (
              <div key={i} className="flex gap-2 mt-1.5">
                <Badge variant="outline" className="flex-shrink-0 mt-1.5 text-xs">
                  {i + 1}
                </Badge>
                <Input
                  value={url}
                  onChange={e => {
                    const newUrls = [...competitorUrls];
                    newUrls[i] = e.target.value;
                    setCompetitorUrls(newUrls);
                  }}
                  placeholder={`https://competidor${i + 1}.com`}
                  type="url"
                />
              </div>
            ))}
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={analyzing || !websiteUrl.trim()}
            className="w-full"
          >
            {analyzing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analizando (puede tomar 30-60s)...</>
            ) : (
              <><Search className="h-4 w-4 mr-2" /> 🐕 Que Steve Analice Todo</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
