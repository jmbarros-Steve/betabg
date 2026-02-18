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
  Upload, Trash2, Loader2, Globe, Search,
  Camera, Palette, FileImage, X, Key, Trophy
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
  const [analysisProgress, setAnalysisProgress] = useState<string>('');
  const [autoTriggered, setAutoTriggered] = useState(false);
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
    const [clientResult, personaResult] = await Promise.all([
      supabase.from('clients').select('website_url').eq('id', clientId).single(),
      supabase.from('buyer_personas').select('persona_data').eq('client_id', clientId).maybeSingle(),
    ]);

    const savedWebUrl = clientResult.data?.website_url || '';
    if (savedWebUrl) setWebsiteUrl(savedWebUrl);

    // Extract competitor URLs from brief responses
    let extractedCompUrls: string[] = [];
    if (personaResult.data?.persona_data) {
      const pd = personaResult.data.persona_data as any;
      const questions: string[] = pd.questions || [];
      const responses: string[] = pd.raw_responses || [];

      // Try competitors question
      const competitorIdx = questions.indexOf('competitors');
      if (competitorIdx >= 0 && responses[competitorIdx]) {
        const compResponse = responses[competitorIdx];
        const urlMatches = compResponse.match(/(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:com|cl|mx|ar|co|pe|es|io|store|shop)(?:\/\S*)?/gi) || [];
        extractedCompUrls = urlMatches.slice(0, 3).map(u => u.startsWith('http') ? u : `https://${u}`);
      }
    }

    if (extractedCompUrls.length > 0) {
      setCompetitorUrls(prev => {
        const newUrls = [...prev];
        extractedCompUrls.forEach((url, i) => {
          if (url) newUrls[i] = url;
        });
        return newUrls;
      });
    }

    // Auto-trigger analysis if we have website_url and no existing research
    if (savedWebUrl && !autoTriggered) {
      const { data: existingResearch } = await supabase
        .from('brand_research')
        .select('id')
        .eq('client_id', clientId)
        .limit(1);

      if (!existingResearch || existingResearch.length === 0) {
        setAutoTriggered(true);
        // Small delay to let state settle
        setTimeout(() => {
          handleAnalyzeAuto(savedWebUrl, extractedCompUrls);
        }, 800);
      }
    }
  }

  async function handleAnalyzeAuto(url: string, compUrls: string[]) {
    setAnalyzing(true);
    setAnalysisProgress('Analizando tu sitio web...');
    try {
      setAnalysisProgress('Analizando competidores...');
      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: {
          client_id: clientId,
          website_url: url.trim(),
          competitor_urls: compUrls.filter(u => u.trim()),
        },
      });
      if (error) throw error;
      setAnalysisProgress('');
      toast.success('✅ Análisis SEO, Keywords y Competencia completado automáticamente');
      onResearchComplete?.();
    } catch (error: any) {
      setAnalysisProgress('');
      console.error('Auto-analysis error:', error);
    } finally {
      setAnalyzing(false);
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
    setAnalysisProgress('Analizando sitio web...');
    try {
      setTimeout(() => setAnalysisProgress('Analizando SEO y keywords...'), 5000);
      setTimeout(() => setAnalysisProgress('Comparando con competidores...'), 15000);
      setTimeout(() => setAnalysisProgress('Generando recomendaciones estratégicas...'), 25000);

      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: {
          client_id: clientId,
          website_url: websiteUrl.trim(),
          competitor_urls: competitorUrls.filter(u => u.trim()),
        },
      });

      if (error) throw error;
      setAnalysisProgress('');
      toast.success('¡Análisis SEO, Keywords y Competencia completado!');
      onResearchComplete?.();
    } catch (error: any) {
      setAnalysisProgress('');
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
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Análisis Automático — SEO, Keywords & Competencia
          </CardTitle>
          <CardDescription>
            Steve analizará tu sitio web y el de tus competidores para generar un informe completo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Auto-analysis notice */}
          {analyzing && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-primary animate-spin flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary">Steve está analizando...</p>
                <p className="text-xs text-muted-foreground">{analysisProgress || 'Procesando información...'}</p>
                <p className="text-xs text-muted-foreground mt-1">Esto puede tomar 30-60 segundos</p>
              </div>
            </div>
          )}

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
            <Label className="text-sm font-medium flex items-center gap-2">
              URLs de Competidores (hasta 3)
              <Badge variant="secondary" className="text-xs font-normal">Auto-detectados del brief</Badge>
            </Label>
            {competitorUrls.map((url, i) => (
              <div key={i} className="flex gap-2 mt-1.5">
                <Badge variant="outline" className="flex-shrink-0 mt-1.5 text-xs w-6 justify-center">
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
                  className={url ? 'border-primary/40' : ''}
                />
              </div>
            ))}
          </div>

          {/* What will be analyzed */}
          <div className="grid grid-cols-3 gap-2 py-2">
            {[
              { icon: <Globe className="h-3.5 w-3.5" />, label: 'Auditoría SEO' },
              { icon: <Key className="h-3.5 w-3.5" />, label: 'Keywords' },
              { icon: <Trophy className="h-3.5 w-3.5" />, label: 'Competencia' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                <span className="text-primary">{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={analyzing || !websiteUrl.trim()}
            className="w-full"
            size="lg"
          >
            {analyzing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {analysisProgress || 'Analizando...'}</>
            ) : (
              <><Search className="h-4 w-4 mr-2" /> 🐕 Que Steve Analice Todo</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
