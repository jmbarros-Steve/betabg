import { useState, useEffect, useCallback } from 'react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  RefreshCw,
  Loader2,
  Plus,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Type,
  Video,
  X,
  Pause,
  Play,
  Pencil,
  Trash2,
  Sparkles,
} from 'lucide-react';
import CreateAssetGroupDialog from './CreateAssetGroupDialog';

interface AssetGroup {
  id: string;
  name: string;
  status: string;
  ad_strength: string;
  campaign_id: string;
  campaign_name: string;
}

interface AssetDetail {
  resource_name: string;
  field_type: string;
  status: string;
  name: string;
  type: string;
  text?: string;
  image_url?: string;
  youtube_video_id?: string;
}

interface GooglePmaxManagerProps {
  connectionId: string;
  clientId: string;
}

const adStrengthColors: Record<string, string> = {
  EXCELLENT: 'bg-green-500/10 text-green-600 border-green-500/20',
  GOOD: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  AVERAGE: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  POOR: 'bg-red-500/10 text-red-600 border-red-500/20',
  UNSPECIFIED: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  SYNCING: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

const adStrengthLabels: Record<string, string> = {
  EXCELLENT: 'Excelente',
  GOOD: 'Buena',
  AVERAGE: 'Promedio',
  POOR: 'Pobre',
  UNSPECIFIED: 'Sin datos',
  SYNCING: 'Sincronizando...',
};

// Key local para identificar grupos de recursos optimistas (creados pero aún no visibles en GAQL)
type PendingGroup = AssetGroup & { __pendingKey: string; __createdAt: number };
const PENDING_TTL_MS = 2 * 60 * 1000; // 2 min — después de eso avisamos al user
const POLL_FAST_MS = 10_000;           // 10s mientras hay pending
const POLL_IDLE_MS = 30_000;           // 30s normal

const fieldTypeLabels: Record<string, string> = {
  HEADLINE: 'Headline',
  LONG_HEADLINE: 'Headline largo',
  DESCRIPTION: 'Descripcion',
  BUSINESS_NAME: 'Nombre negocio',
  MARKETING_IMAGE: 'Imagen landscape',
  SQUARE_MARKETING_IMAGE: 'Imagen cuadrada',
  PORTRAIT_MARKETING_IMAGE: 'Imagen portrait',
  LOGO: 'Logo',
  LANDSCAPE_LOGO: 'Logo landscape',
  YOUTUBE_VIDEO: 'Video YouTube',
  CALL_TO_ACTION_SELECTION: 'Call to Action',
};

// Configuración de strength: recomendado + peso por field_type.
// Basado en best practices de Google Ads PMAX (min/max/recommended por tipo).
const STRENGTH_CONFIG: Record<string, { recommended: number; weight: number; required?: boolean }> = {
  HEADLINE:                 { recommended: 5, weight: 3 },
  LONG_HEADLINE:            { recommended: 5, weight: 2 },
  DESCRIPTION:              { recommended: 5, weight: 3 },
  BUSINESS_NAME:            { recommended: 1, weight: 1, required: true },
  MARKETING_IMAGE:          { recommended: 3, weight: 3, required: true },
  SQUARE_MARKETING_IMAGE:   { recommended: 3, weight: 3, required: true },
  LOGO:                     { recommended: 1, weight: 2 },
  LANDSCAPE_LOGO:           { recommended: 1, weight: 1 },
  PORTRAIT_MARKETING_IMAGE: { recommended: 1, weight: 1 },
  YOUTUBE_VIDEO:            { recommended: 1, weight: 2 },
  CALL_TO_ACTION_SELECTION: { recommended: 1, weight: 1 },
};

function computeStrength(assets: Record<string, AssetDetail[]>) {
  let earned = 0;
  let total = 0;
  const missing: Array<{ fieldType: string; label: string; current: number; recommended: number; required: boolean; weight: number }> = [];
  for (const [fieldType, config] of Object.entries(STRENGTH_CONFIG)) {
    const current = (assets[fieldType] || []).length;
    total += config.weight;
    const coverage = Math.min(current / config.recommended, 1);
    earned += config.weight * coverage;
    if (current < config.recommended) {
      missing.push({
        fieldType,
        label: fieldTypeLabels[fieldType] || fieldType,
        current,
        recommended: config.recommended,
        required: !!config.required,
        weight: config.weight,
      });
    }
  }
  const score = Math.round((earned / total) * 100);
  return { score, missing: missing.sort((a, b) => (b.required === a.required ? b.weight - a.weight : (b.required ? 1 : -1))) };
}

function scoreColor(score: number): string {
  if (score >= 90) return 'bg-green-500';
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

// El add-asset dialog actual solo soporta campos de texto. Para el resto,
// el "+ Agregar" no puede resolverlo y linkeamos al user a Google Ads.
const TEXT_ADDABLE_FIELDS = new Set(['HEADLINE', 'LONG_HEADLINE', 'DESCRIPTION', 'BUSINESS_NAME']);

// Mapping field_type → formato del endpoint /api/ai/generate-image.
// El backend hace auto-fit con sharp al spec exacto (ratio + dimensions).
const IMAGE_FIELD_TO_FORMAT: Record<string, string> = {
  MARKETING_IMAGE: 'landscape',            // 1200x628
  SQUARE_MARKETING_IMAGE: 'square',        // 1200x1200
  PORTRAIT_MARKETING_IMAGE: 'portrait',    // 960x1200
  LOGO: 'logo',                             // 1200x1200
  LANDSCAPE_LOGO: 'landscape_logo',        // 1200x300
};
const IMAGE_FIELDS = new Set(Object.keys(IMAGE_FIELD_TO_FORMAT));

export default function GooglePmaxManager({ connectionId, clientId }: GooglePmaxManagerProps) {
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([]);
  const [pendingGroups, setPendingGroups] = useState<PendingGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [groupDetails, setGroupDetails] = useState<Record<string, { assets: Record<string, AssetDetail[]>; count: number }>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});

  // Create dialog (ahora manejado por CreateAssetGroupDialog shared component)
  const [createOpen, setCreateOpen] = useState(false);

  // Add asset dialog
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [addAssetGroupId, setAddAssetGroupId] = useState<string | null>(null);
  const [addAssetLoading, setAddAssetLoading] = useState(false);
  const [newAsset, setNewAsset] = useState({ field_type: 'HEADLINE', text: '' });

  // Rename / Delete dialogs (reemplazan window.prompt / window.confirm)
  const [renameTarget, setRenameTarget] = useState<AssetGroup | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssetGroup | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Steve AI suggest dialog (scorecard accionable)
  const [steveOpen, setSteveOpen] = useState(false);
  const [steveGroupId, setSteveGroupId] = useState<string | null>(null);
  const [steveField, setSteveField] = useState<string>('HEADLINE');
  const [steveUserIntent, setSteveUserIntent] = useState('');
  const [steveLoading, setSteveLoading] = useState(false);
  const [steveAdding, setSteveAdding] = useState(false);
  const [steveOptions, setSteveOptions] = useState<Array<{ text: string; angle?: string | null }>>([]);
  const [steveReasoning, setSteveReasoning] = useState<string | null>(null);
  const [steveSelectedIdx, setSteveSelectedIdx] = useState<number | null>(null);
  const [steveMaxChars, setSteveMaxChars] = useState<number>(90);
  // Image mode: cuando steveField es IMAGE/LOGO, usamos generate-image en vez de suggest_asset_content
  const [steveImageUrl, setSteveImageUrl] = useState<string | null>(null);
  // Variaciones (solo LOGO) — galería de 3 previews alternativas
  const [steveImageVariations, setSteveImageVariations] = useState<string[]>([]);
  const [steveVariationsLoading, setSteveVariationsLoading] = useState(false);

  // Audience Signal dialog (agregar a un AG existente)
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [audienceGroupId, setAudienceGroupId] = useState<string | null>(null);
  const [audienceName, setAudienceName] = useState('Audiencia PMAX');
  const [audienceAges, setAudienceAges] = useState<string[]>([]);
  const [audienceGenders, setAudienceGenders] = useState<string[]>([]);
  const [audienceLoading, setAudienceLoading] = useState(false);

  // Edit text asset (Asset es inmutable en Google Ads — editar = remove + add nuevo)
  const [editAssetOpen, setEditAssetOpen] = useState(false);
  const [editAssetGroupId, setEditAssetGroupId] = useState<string | null>(null);
  const [editAssetOld, setEditAssetOld] = useState<AssetDetail | null>(null);
  const [editAssetFieldType, setEditAssetFieldType] = useState<string>('HEADLINE');
  const [editAssetText, setEditAssetText] = useState('');
  const [editAssetLoading, setEditAssetLoading] = useState(false);

  const fetchAssetGroups = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setRefreshing(true);
    const { data, error } = await callApi('manage-google-pmax', {
      body: { action: 'list_asset_groups', connection_id: connectionId },
    });

    setRefreshing(false);
    if (error) {
      if (!opts?.silent) toast.error('Error cargando grupos de recursos: ' + error);
      setLoading(false);
      return;
    }

    const groups: AssetGroup[] = data?.asset_groups || [];
    setAssetGroups(groups);
    setLoading(false);

    // Limpiar pending groups cuyo nombre+campaña ya apareció en el fetch real
    // o que ya superaron el TTL (timeout — Google no procesó aún).
    setPendingGroups(prev => {
      const kept: PendingGroup[] = [];
      const expired: PendingGroup[] = [];
      for (const p of prev) {
        const matched = groups.some(g => g.name === p.name && g.campaign_id === p.campaign_id);
        if (matched) continue; // apareció en Google → drop
        const aged = Date.now() - p.__createdAt > PENDING_TTL_MS;
        if (aged) expired.push(p); else kept.push(p);
      }
      if (expired.length > 0) {
        expired.forEach(p => toast.warning(
          `"${p.name}" aún no aparece en Google tras 2 min. Verificalo directamente en Google Ads.`,
          { duration: 8_000 }
        ));
      }
      return kept;
    });
  }, [connectionId]);

  // Auto-refresh: al mount + interval (rápido si hay pending, lento si no) + al volver a la tab.
  useEffect(() => {
    fetchAssetGroups();
  }, [fetchAssetGroups]);

  // isVisible: pausamos el poll cuando la tab está oculta para no quemar cuota de Google Ads API.
  const [isVisible, setIsVisible] = useState(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  useEffect(() => {
    const onFocus = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);
      if (visible) fetchAssetGroups({ silent: true });
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchAssetGroups]);

  useEffect(() => {
    if (!isVisible) return; // no pollear si la tab no está visible
    const hasPending = pendingGroups.length > 0;
    const ms = hasPending ? POLL_FAST_MS : POLL_IDLE_MS;
    const interval = setInterval(() => fetchAssetGroups({ silent: true }), ms);
    return () => clearInterval(interval);
  }, [fetchAssetGroups, pendingGroups.length, isVisible]);

  const toggleGroup = async (groupId: string) => {
    if (expandedGroup === groupId) {
      setExpandedGroup(null);
      return;
    }

    setExpandedGroup(groupId);

    // Fetch details if not cached
    if (!groupDetails[groupId]) {
      setDetailLoading(prev => ({ ...prev, [groupId]: true }));
      const { data, error } = await callApi('manage-google-pmax', {
        body: { action: 'get_asset_group_detail', connection_id: connectionId, asset_group_id: groupId },
      });

      setDetailLoading(prev => ({ ...prev, [groupId]: false }));

      if (error) {
        toast.error('Error cargando detalle: ' + error);
        return;
      }

      setGroupDetails(prev => ({
        ...prev,
        [groupId]: { assets: data?.assets || {}, count: data?.asset_count || 0 },
      }));
    }
  };

  // Callback post-create del shared dialog: optimistic update + refresh silencioso.
  const handleAssetGroupCreated = (result: { campaign_id: string; name: string }) => {
    const pmaxMatch = pmaxCampaigns.find(c => c.id === result.campaign_id);
    setPendingGroups(prev => [
      ...prev,
      {
        __pendingKey: `pending-${Date.now()}`,
        __createdAt: Date.now(),
        id: `pending-${Date.now()}`,
        name: result.name,
        status: 'ENABLED',
        ad_strength: 'SYNCING',
        campaign_id: result.campaign_id,
        campaign_name: pmaxMatch?.name || '',
      },
    ]);
    fetchAssetGroups({ silent: true });
  };

  // Acciones por grupo de recursos: pause/resume/rename/delete (todos via update_asset_group del backend).
  const handleUpdateAssetGroup = async (groupId: string, updates: Record<string, any>, successMsg: string) => {
    const { error } = await callApi('manage-google-pmax', {
      body: {
        action: 'update_asset_group',
        connection_id: connectionId,
        asset_group_id: groupId,
        data: updates,
      },
    });
    if (error) {
      toast.error('Error: ' + error);
      return false;
    }
    toast.success(successMsg);
    fetchAssetGroups({ silent: true });
    return true;
  };

  const handleToggleStatus = async (group: AssetGroup) => {
    const nextStatus = group.status === 'ENABLED' ? 'PAUSED' : 'ENABLED';
    await handleUpdateAssetGroup(
      group.id,
      { status: nextStatus },
      nextStatus === 'PAUSED' ? 'Grupo de recursos pausado' : 'Grupo de recursos activado'
    );
  };

  const handleRename = (group: AssetGroup) => {
    setRenameTarget(group);
    setRenameValue(group.name);
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (trimmed === '' || trimmed === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    setRenameLoading(true);
    const ok = await handleUpdateAssetGroup(renameTarget.id, { name: trimmed }, 'Nombre actualizado');
    setRenameLoading(false);
    if (ok) setRenameTarget(null);
  };

  const handleDelete = (group: AssetGroup) => {
    setDeleteTarget(group);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const { error } = await callApi('manage-google-pmax', {
      body: {
        action: 'remove_asset_group',
        connection_id: connectionId,
        asset_group_id: deleteTarget.id,
      },
    });
    setDeleteLoading(false);
    if (error) {
      toast.error('Error eliminando grupo de recursos: ' + error);
      return;
    }
    toast.success('Grupo de recursos eliminado');
    setDeleteTarget(null);
    fetchAssetGroups({ silent: true });
  };

  const handleAddAsset = async () => {
    if (!addAssetGroupId || !newAsset.text) return;

    setAddAssetLoading(true);
    const { error } = await callApi('manage-google-pmax', {
      body: {
        action: 'add_asset',
        connection_id: connectionId,
        asset_group_id: addAssetGroupId,
        data: { field_type: newAsset.field_type, text: newAsset.text },
      },
    });
    setAddAssetLoading(false);

    if (error) {
      toast.error('Error agregando asset: ' + error);
      return;
    }

    toast.success('Asset agregado');
    setAddAssetOpen(false);
    setNewAsset({ field_type: 'HEADLINE', text: '' });

    // Refresh details
    setGroupDetails(prev => {
      const copy = { ...prev };
      delete copy[addAssetGroupId];
      return copy;
    });
    if (expandedGroup === addAssetGroupId) {
      toggleGroup(addAssetGroupId);
    }
  };

  // Prompt base por formato (para el flujo imagen). El backend concatena brief,
  // brand colors y logo del cliente como referencia.
  const buildImagePrompt = (fieldType: string): string => {
    const map: Record<string, string> = {
      MARKETING_IMAGE: 'Foto publicitaria horizontal panorámica de producto para Google Ads. Aspecto 1.91:1, 1200x628px, profesional, luz natural.',
      SQUARE_MARKETING_IMAGE: 'Foto publicitaria cuadrada de producto para Google Ads. Aspecto 1:1, 1200x1200px, composición centrada, profesional.',
      PORTRAIT_MARKETING_IMAGE: 'Foto publicitaria vertical de producto para Google Ads móvil. Aspecto 4:5, 960x1200px, formato stories, profesional.',
      LOGO: 'Logo de la marca, fondo transparente o blanco, centrado, 1200x1200px, crisp, high-resolution.',
      LANDSCAPE_LOGO: 'Logo horizontal de la marca, fondo transparente o blanco, 1200x300px, wide format.',
    };
    return map[fieldType] || map.MARKETING_IMAGE;
  };

  // Steve AI suggest: abre dialog y pide sugerencias al backend.
  const openSteveSuggest = async (groupId: string, fieldType: string) => {
    setSteveGroupId(groupId);
    setSteveField(fieldType);
    setSteveOptions([]);
    setSteveReasoning(null);
    setSteveSelectedIdx(null);
    setSteveUserIntent('');
    setSteveImageUrl(null);
    setSteveImageVariations([]); // reset galería al cambiar field
    setSteveOpen(true);

    if (fieldType === 'CALL_TO_ACTION_SELECTION') {
      // CTA: enum fijo, no llama IA
      const CTA = ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'SUBSCRIBE', 'BOOK_NOW',
                   'GET_QUOTE', 'CONTACT_US', 'APPLY_NOW', 'DOWNLOAD', 'ORDER_NOW', 'BUY_NOW'];
      setSteveOptions(CTA.map(v => ({ text: v, angle: null })));
      setSteveMaxChars(40);
      return;
    }

    if (IMAGE_FIELDS.has(fieldType)) {
      // Imagen: genera automáticamente al abrir
      await generateSteveImage(fieldType, '');
      return;
    }

    setSteveLoading(true);
    const { data, error } = await callApi('manage-google-campaign', {
      body: {
        action: 'suggest_asset_content',
        connection_id: connectionId,
        data: { asset_group_id: groupId, field_type: fieldType, count: 5 },
      },
    });
    setSteveLoading(false);

    if (error) {
      toast.error('Steve no pudo sugerir: ' + error);
      return;
    }
    setSteveOptions(data?.options || []);
    setSteveReasoning(data?.reasoning || null);
    setSteveMaxChars(data?.max_chars || 90);
  };

  const generateSteveImage = async (fieldType: string, intent: string) => {
    setSteveLoading(true);
    setSteveImageUrl(null);
    setSteveImageVariations([]);
    const format = IMAGE_FIELD_TO_FORMAT[fieldType] || 'landscape';
    const { data, error } = await callApi('generate-image', {
      body: {
        clientId,
        promptGeneracion: buildImagePrompt(fieldType),
        formato: format,
        engine: 'imagen',
        userIntent: intent || undefined,
      },
    });
    setSteveLoading(false);
    if (error || !data?.asset_url) {
      toast.error('Steve no pudo generar imagen: ' + (error || 'sin URL'));
      return;
    }
    setSteveImageUrl(data.asset_url);
  };

  // Genera 3 variaciones del logo (u otra imagen) en paralelo.
  // Prompts con ángulos distintos (fondo blanco, transparente, colorido).
  const generateLogoVariations = async () => {
    if (!steveGroupId) return;
    const format = IMAGE_FIELD_TO_FORMAT[steveField] || 'logo';
    const variationPrompts = [
      `${buildImagePrompt(steveField)} Fondo blanco limpio, minimalista.`,
      `${buildImagePrompt(steveField)} Fondo transparente o neutro, crisp.`,
      `${buildImagePrompt(steveField)} Fondo sutilmente colorido que complementa la marca.`,
    ];
    setSteveVariationsLoading(true);
    try {
      const results = await Promise.all(variationPrompts.map(prompt =>
        callApi('generate-image', {
          body: {
            clientId,
            promptGeneracion: prompt,
            formato: format,
            engine: 'imagen',
            userIntent: steveUserIntent || undefined,
          },
        })
      ));
      const urls = results
        .map(r => r.data?.asset_url)
        .filter((u): u is string => typeof u === 'string' && u.length > 0);
      if (urls.length === 0) {
        toast.error('No se pudieron generar variaciones');
        return;
      }
      setSteveImageVariations(urls);
      toast.success(`${urls.length} variaciones listas`);
    } finally {
      setSteveVariationsLoading(false);
    }
  };

  const requestSteveSuggestions = async () => {
    if (!steveGroupId) return;

    if (IMAGE_FIELDS.has(steveField)) {
      await generateSteveImage(steveField, steveUserIntent);
      return;
    }

    setSteveLoading(true);
    const { data, error } = await callApi('manage-google-campaign', {
      body: {
        action: 'suggest_asset_content',
        connection_id: connectionId,
        data: {
          asset_group_id: steveGroupId,
          field_type: steveField,
          count: 5,
          user_intent: steveUserIntent || undefined,
        },
      },
    });
    setSteveLoading(false);
    if (error) {
      toast.error('Steve no pudo sugerir: ' + error);
      return;
    }
    setSteveOptions(data?.options || []);
    setSteveReasoning(data?.reasoning || null);
    setSteveMaxChars(data?.max_chars || 90);
    setSteveSelectedIdx(null);
  };

  // Edit text asset: Google Ads no permite mutar el texto de un Asset.
  // Workflow: add nuevo primero (si falla, no se pierde el original) + remove viejo.
  const openEditAsset = (groupId: string, asset: AssetDetail, fieldType: string) => {
    setEditAssetGroupId(groupId);
    setEditAssetOld(asset);
    setEditAssetFieldType(fieldType);
    setEditAssetText(asset.text || asset.name || '');
    setEditAssetOpen(true);
  };

  const submitEditAsset = async () => {
    if (!editAssetGroupId || !editAssetOld) return;
    const trimmed = editAssetText.trim();
    if (!trimmed || trimmed === (editAssetOld.text || editAssetOld.name)) {
      setEditAssetOpen(false);
      return;
    }
    const MAX_BY_TYPE: Record<string, number> = { HEADLINE: 30, LONG_HEADLINE: 90, DESCRIPTION: 90, BUSINESS_NAME: 25 };
    const maxLen = MAX_BY_TYPE[editAssetFieldType] ?? 90;
    if (trimmed.length > maxLen) {
      toast.error(`Texto excede ${maxLen} caracteres`);
      return;
    }

    setEditAssetLoading(true);
    // Paso 1: add nuevo
    const { error: addError } = await callApi('manage-google-pmax', {
      body: {
        action: 'add_asset',
        connection_id: connectionId,
        asset_group_id: editAssetGroupId,
        data: { field_type: editAssetFieldType, text: trimmed },
      },
    });
    if (addError) {
      setEditAssetLoading(false);
      toast.error('Error agregando nueva versión: ' + addError);
      return;
    }
    // Paso 2: remove viejo
    const { error: removeError } = await callApi('manage-google-pmax', {
      body: {
        action: 'remove_asset',
        connection_id: connectionId,
        asset_group_id: editAssetGroupId,
        data: { asset_resource_name: editAssetOld.resource_name, field_type: editAssetFieldType },
      },
    });
    setEditAssetLoading(false);
    if (removeError) {
      toast.warning(`Nueva versión agregada, pero no se pudo eliminar la vieja: ${removeError}. Eliminala manualmente.`);
    } else {
      toast.success('Asset actualizado');
    }
    // Refresh detail
    setGroupDetails(prev => {
      const copy = { ...prev };
      delete copy[editAssetGroupId];
      return copy;
    });
    if (expandedGroup === editAssetGroupId) {
      toggleGroup(editAssetGroupId);
    }
    setEditAssetOpen(false);
  };

  // Abre dialog Audience Signal para un AG existente
  const openAudienceDialog = (groupId: string) => {
    setAudienceGroupId(groupId);
    setAudienceName('Audiencia PMAX');
    setAudienceAges([]);
    setAudienceGenders([]);
    setAudienceOpen(true);
  };

  const submitAudienceSignal = async () => {
    if (!audienceGroupId) return;
    if (audienceAges.length === 0 && audienceGenders.length === 0) {
      toast.error('Elegí al menos una edad o género');
      return;
    }
    setAudienceLoading(true);
    const { error } = await callApi('manage-google-pmax', {
      body: {
        action: 'add_audience_signal',
        connection_id: connectionId,
        asset_group_id: audienceGroupId,
        data: {
          name: audienceName || 'Audiencia PMAX',
          age_ranges: audienceAges,
          genders: audienceGenders,
        },
      },
    });
    setAudienceLoading(false);
    if (error) {
      toast.error('Error agregando audience signal: ' + error);
      return;
    }
    toast.success('Audience signal agregado al grupo de recursos');
    setAudienceOpen(false);
  };

  // Convierte URL pública a base64 (sin header data:). Requerido por add_asset
  // que espera image_data como string base64 puro (imageAsset.data en v23).
  const urlToBase64 = async (url: string): Promise<string> => {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        // dataURL formato: data:image/png;base64,XXXX → extraer solo XXXX
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  };

  const steveAddSelected = async () => {
    if (!steveGroupId) return;

    setSteveAdding(true);
    try {
      if (IMAGE_FIELDS.has(steveField)) {
        if (!steveImageUrl) {
          toast.error('Genera una imagen primero');
          setSteveAdding(false);
          return;
        }
        const base64 = await urlToBase64(steveImageUrl);
        const { error } = await callApi('manage-google-pmax', {
          body: {
            action: 'add_asset',
            connection_id: connectionId,
            asset_group_id: steveGroupId,
            data: {
              field_type: steveField,
              image_data: base64,
              image_name: `Steve-${steveField}`,
            },
          },
        });
        if (error) {
          toast.error('Error agregando imagen: ' + error);
          setSteveAdding(false);
          return;
        }
      } else {
        if (steveSelectedIdx === null) { setSteveAdding(false); return; }
        const option = steveOptions[steveSelectedIdx];
        if (!option?.text) { setSteveAdding(false); return; }
        const isCta = steveField === 'CALL_TO_ACTION_SELECTION';
        const { error } = await callApi('manage-google-pmax', {
          body: {
            action: 'add_asset',
            connection_id: connectionId,
            asset_group_id: steveGroupId,
            data: isCta
              ? { field_type: steveField, cta_enum: option.text }
              : { field_type: steveField, text: option.text.slice(0, steveMaxChars) },
          },
        });
        if (error) {
          toast.error('Error agregando asset: ' + error);
          setSteveAdding(false);
          return;
        }
      }
      toast.success('Asset agregado por Steve');
      // Refresh detail
      setGroupDetails(prev => {
        const copy = { ...prev };
        delete copy[steveGroupId];
        return copy;
      });
      if (expandedGroup === steveGroupId) {
        toggleGroup(steveGroupId);
      }
      setSteveOpen(false);
    } finally {
      setSteveAdding(false);
    }
  };

  const handleRemoveAsset = async (groupId: string, asset: AssetDetail) => {
    const { error } = await callApi('manage-google-pmax', {
      body: {
        action: 'remove_asset',
        connection_id: connectionId,
        asset_group_id: groupId,
        data: { asset_resource_name: asset.resource_name, field_type: asset.field_type },
      },
    });

    if (error) {
      toast.error('Error eliminando asset: ' + error);
      return;
    }

    toast.success('Asset eliminado');
    // Refresh
    setGroupDetails(prev => {
      const copy = { ...prev };
      delete copy[groupId];
      return copy;
    });
    toggleGroup(groupId);
  };


  // Get unique PMAX campaign IDs for the create dialog
  const pmaxCampaigns = [...new Map(assetGroups.map(ag => [ag.campaign_id, { id: ag.campaign_id, name: ag.campaign_name }])).values()];

  // Merge real grupos de recursos con los pending (optimistic) — los pending quedan primero para visibilidad.
  const displayGroups: (AssetGroup | PendingGroup)[] = [...pendingGroups, ...assetGroups];

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-muted-foreground">
            {displayGroups.length} grupo{displayGroups.length !== 1 ? 's' : ''} de recursos PMAX
            {pendingGroups.length > 0 && (
              <span className="ml-2 text-xs text-blue-600">
                ({pendingGroups.length} sincronizando)
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            Auto-refresco {pendingGroups.length > 0 ? 'cada 10s' : 'cada 30s'}. Los grupos de recursos recién creados tardan unos minutos en aparecer desde Google.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchAssetGroups()} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Actualizando...' : 'Refrescar'}
          </Button>
          {pmaxCampaigns.length > 0 && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Crear Grupo de recursos
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {displayGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay grupos de recursos PMAX en esta cuenta.
            <br />
            <span className="text-xs">Crea una campana Performance Max primero.</span>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayGroups.map(group => {
            const isPending = '__pendingKey' in group;
            return (
            <Card key={isPending ? (group as PendingGroup).__pendingKey : group.id} className={`overflow-hidden ${isPending ? 'opacity-70 border-blue-500/30' : ''}`}>
              {/* Group header: área clickeable a la izquierda + acciones a la derecha */}
              <div className={`w-full flex items-center gap-3 p-4 transition-colors ${isPending ? '' : 'hover:bg-muted/30'}`}>
                <button
                  className={`flex-1 flex items-center gap-3 text-left min-w-0 ${isPending ? 'cursor-wait' : ''}`}
                  onClick={() => !isPending && toggleGroup(group.id)}
                  disabled={isPending}
                >
                  {isPending
                    ? <Loader2 className="w-4 h-4 text-blue-500 shrink-0 animate-spin" />
                    : expandedGroup === group.id
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{group.name}</p>
                    <p className="text-xs text-muted-foreground">{group.campaign_name}</p>
                  </div>
                  <Badge variant="outline" className={adStrengthColors[group.ad_strength] || adStrengthColors.UNSPECIFIED}>
                    {adStrengthLabels[group.ad_strength] || group.ad_strength}
                  </Badge>
                  <Badge variant="outline" className={group.status === 'ENABLED' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}>
                    {group.status === 'ENABLED' ? 'Activo' : group.status}
                  </Badge>
                </button>
                {!isPending && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleToggleStatus(group)}
                      title={group.status === 'ENABLED' ? 'Pausar' : 'Activar'}
                    >
                      {group.status === 'ENABLED'
                        ? <Pause className="w-4 h-4" />
                        : <Play className="w-4 h-4" />
                      }
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleRename(group)}
                      title="Renombrar"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      onClick={() => handleDelete(group)}
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Expanded detail */}
              {expandedGroup === group.id && (
                <div className="border-t p-4 space-y-4">
                  {detailLoading[group.id] ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Cargando assets...
                    </div>
                  ) : groupDetails[group.id] ? (
                    <>
                      {(() => {
                        const { score, missing } = computeStrength(groupDetails[group.id].assets);
                        return (
                          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">Calidad del grupo de recursos</span>
                              <span className="text-muted-foreground">
                                Google: <span className="font-semibold">{adStrengthLabels[group.ad_strength] || group.ad_strength}</span>
                                {' '}· Steve: <span className="font-semibold">{score}%</span>
                              </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full transition-all ${scoreColor(score)}`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            {missing.length > 0 && (
                              <div className="space-y-1 pt-2 border-t border-border/50">
                                <p className="text-xs font-medium text-muted-foreground">Qué mejorar:</p>
                                <ul className="space-y-1 text-xs">
                                  {missing.map(m => {
                                    const canAddInline = TEXT_ADDABLE_FIELDS.has(m.fieldType);
                                    const canSteveText = canAddInline; // HEADLINE, LONG_HEADLINE, DESCRIPTION, BUSINESS_NAME
                                    const canSteveCta = m.fieldType === 'CALL_TO_ACTION_SELECTION';
                                    const canSteveImage = IMAGE_FIELDS.has(m.fieldType);
                                    const canSteve = canSteveText || canSteveCta || canSteveImage;
                                    const isVideo = m.fieldType === 'YOUTUBE_VIDEO';
                                    return (
                                    <li key={m.fieldType} className="flex items-center justify-between gap-2">
                                      <span className="flex items-center gap-1.5">
                                        {m.required && <span className="text-red-500" title="Requerido">●</span>}
                                        <span>
                                          {m.label}: <span className="font-medium">{m.current}/{m.recommended}</span>
                                        </span>
                                      </span>
                                      <span className="flex items-center gap-2">
                                        {canSteve && (
                                          <button
                                            className="text-primary hover:underline flex items-center gap-1"
                                            onClick={() => openSteveSuggest(group.id, m.fieldType)}
                                            title={canSteveImage ? 'Steve genera la imagen con Gemini' : 'Steve sugiere según tu brief'}
                                          >
                                            <Sparkles className="w-3 h-3" />
                                            {canSteveImage ? 'Steve genera' : 'Steve sugiere'}
                                          </button>
                                        )}
                                        {canAddInline && (
                                          <button
                                            className="text-blue-600 hover:underline"
                                            onClick={() => {
                                              setAddAssetGroupId(group.id);
                                              setNewAsset({ field_type: m.fieldType, text: '' });
                                              setAddAssetOpen(true);
                                            }}
                                          >
                                            + Manual
                                          </button>
                                        )}
                                        {isVideo && (
                                          <span className="text-muted-foreground/60 text-[11px]" title="Videos: agregalos desde Google Ads (Steve aún no genera video).">
                                            desde Google Ads
                                          </span>
                                        )}
                                      </span>
                                    </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm text-muted-foreground">{groupDetails[group.id].count} assets</span>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAudienceDialog(group.id)}
                            title="Agregar Audience Signal a este grupo"
                          >
                            <Sparkles className="w-3.5 h-3.5 mr-1" />
                            Audience Signal
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAddAssetGroupId(group.id);
                              setNewAsset({ field_type: 'HEADLINE', text: '' });
                              setAddAssetOpen(true);
                            }}
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Agregar asset
                          </Button>
                        </div>
                      </div>

                      {/* Assets by type */}
                      {Object.entries(groupDetails[group.id].assets).map(([fieldType, assets]) => (
                        <div key={fieldType}>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                            {fieldType.includes('IMAGE') || fieldType.includes('LOGO')
                              ? <ImageIcon className="w-3 h-3" />
                              : fieldType.includes('VIDEO')
                              ? <Video className="w-3 h-3" />
                              : <Type className="w-3 h-3" />
                            }
                            {fieldTypeLabels[fieldType] || fieldType}
                            <span className="text-muted-foreground/60">({(assets as AssetDetail[]).length})</span>
                          </p>

                          <div className="space-y-1">
                            {(assets as AssetDetail[]).map((asset, idx) => {
                              const isText = TEXT_ADDABLE_FIELDS.has(fieldType);
                              return (
                              <div key={idx} className="flex items-center gap-2 text-sm group">
                                {asset.image_url ? (
                                  <img
                                    src={asset.image_url}
                                    alt={asset.name}
                                    className="w-10 h-10 rounded object-cover border"
                                  />
                                ) : asset.youtube_video_id ? (
                                  <a
                                    href={`https://youtube.com/watch?v=${asset.youtube_video_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 hover:underline truncate"
                                  >
                                    youtube.com/watch?v={asset.youtube_video_id}
                                  </a>
                                ) : (
                                  <span className="truncate flex-1">{asset.text || asset.name}</span>
                                )}
                                {isText && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-blue-500 hover:text-blue-600"
                                    onClick={() => openEditAsset(group.id, asset, fieldType)}
                                    title="Editar texto"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"
                                  onClick={() => handleRemoveAsset(group.id, asset)}
                                  title="Eliminar"
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {Object.keys(groupDetails[group.id].assets).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">Sin assets</p>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </Card>
            );
          })}
        </div>
      )}

      {/* Create Asset Group Dialog (shared component) */}
      <CreateAssetGroupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        connectionId={connectionId}
        pmaxCampaigns={pmaxCampaigns}
        onCreated={handleAssetGroupCreated}
      />

      {/* Add Asset Dialog */}
      <Dialog open={addAssetOpen} onOpenChange={setAddAssetOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Agregar Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={newAsset.field_type}
                onChange={e => setNewAsset(prev => ({ ...prev, field_type: e.target.value }))}
              >
                <option value="HEADLINE">Headline (max 30 chars)</option>
                <option value="LONG_HEADLINE">Headline largo (max 90 chars)</option>
                <option value="DESCRIPTION">Descripcion (max 90 chars)</option>
                <option value="BUSINESS_NAME">Nombre negocio</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Texto</Label>
              {(() => {
                const MAX_BY_TYPE: Record<string, number> = { HEADLINE: 30, LONG_HEADLINE: 90, DESCRIPTION: 90, BUSINESS_NAME: 25 };
                const max = MAX_BY_TYPE[newAsset.field_type] ?? 90;
                return (
                  <>
                    <Input
                      value={newAsset.text}
                      onChange={e => setNewAsset(prev => ({ ...prev, text: e.target.value }))}
                      placeholder="Texto del asset..."
                      maxLength={max}
                    />
                    <p className="text-xs text-muted-foreground">
                      {newAsset.text.length}/{max} chars
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAssetOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddAsset} disabled={addAssetLoading || !newAsset.text}>
              {addAssetLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Asset Group Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open && !renameLoading) setRenameTarget(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Renombrar grupo de recursos</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ag-rename-input">Nombre</Label>
            <Input
              id="ag-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={120}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && !renameLoading) confirmRename(); }}
            />
            <p className="text-xs text-muted-foreground">{renameValue.length}/120 chars</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)} disabled={renameLoading}>
              Cancelar
            </Button>
            <Button
              onClick={confirmRename}
              disabled={renameLoading || renameValue.trim() === '' || renameValue === renameTarget?.name}
            >
              {renameLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Steve AI Suggest Dialog — modo texto (options), CTA (enum), imagen (preview) */}
      <Dialog open={steveOpen} onOpenChange={(open) => { if (!open && !steveAdding) setSteveOpen(open); }}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              {IMAGE_FIELDS.has(steveField) ? 'Steve genera' : 'Steve sugiere'}: {fieldTypeLabels[steveField] || steveField}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {steveField !== 'CALL_TO_ACTION_SELECTION' && (
              <div className="space-y-1">
                <Label className="text-xs">
                  {IMAGE_FIELDS.has(steveField)
                    ? '¿Cómo quieres la imagen? (opcional — describe escena, estilo, objetos)'
                    : '¿Algo específico que deba enfatizar? (opcional)'}
                </Label>
                <Textarea
                  value={steveUserIntent}
                  onChange={e => setSteveUserIntent(e.target.value)}
                  placeholder={IMAGE_FIELDS.has(steveField)
                    ? 'Ej: producto sobre mesa de madera, luz de ventana, tono cálido...'
                    : 'Ej: queremos destacar el envío gratis, o foco en mujeres 25-40...'}
                  maxLength={500}
                  rows={2}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{steveUserIntent.length}/500</p>
                  <Button size="sm" variant="outline" onClick={requestSteveSuggestions} disabled={steveLoading}>
                    {steveLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                    {IMAGE_FIELDS.has(steveField) ? 'Regenerar imagen' : 'Regenerar'}
                  </Button>
                </div>
              </div>
            )}

            {steveLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {IMAGE_FIELDS.has(steveField) ? 'Steve está generando la imagen...' : 'Steve está pensando...'}
              </div>
            ) : IMAGE_FIELDS.has(steveField) ? (
              // Modo imagen: preview + galería de variaciones (solo LOGO)
              <div className="space-y-2">
                {steveImageUrl ? (
                  <div className="space-y-2">
                    <div className="border-2 border-primary/60 rounded-md overflow-hidden bg-muted/20 flex items-center justify-center">
                      <img
                        src={steveImageUrl}
                        alt="Steve generated"
                        className="max-w-full max-h-[400px] object-contain"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center">
                      Preview activo. "Agregar" sube ésta a Google Ads.
                    </p>

                    {(steveField === 'LOGO' || steveField === 'LANDSCAPE_LOGO') && (
                      <div className="pt-2 border-t border-border/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Variaciones</Label>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={generateLogoVariations}
                            disabled={steveVariationsLoading}
                          >
                            {steveVariationsLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                            Generar 3 variaciones
                          </Button>
                        </div>
                        {steveImageVariations.length > 0 && (
                          <div className="grid grid-cols-3 gap-2">
                            {steveImageVariations.map((url, idx) => (
                              <button
                                key={idx}
                                className="border rounded-md overflow-hidden hover:border-primary transition-colors bg-muted/20"
                                onClick={() => setSteveImageUrl(url)}
                                title="Click para usar esta variación"
                              >
                                <img src={url} alt={`Variación ${idx + 1}`} className="w-full h-24 object-contain" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Sin imagen. Usa "Regenerar" para generar una.
                  </p>
                )}
              </div>
            ) : (
              // Modo texto / CTA: lista de opciones
              <div className="space-y-2">
                <Label className="text-xs">Elige una opción (editable)</Label>
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {steveOptions.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Sin sugerencias. Prueba dando contexto arriba y Regenerar.
                    </p>
                  )}
                  {steveOptions.map((opt, idx) => {
                    const selected = steveSelectedIdx === idx;
                    return (
                      <div
                        key={idx}
                        className={`border rounded-md p-2 cursor-pointer transition-colors ${
                          selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                        }`}
                        onClick={() => setSteveSelectedIdx(idx)}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="radio"
                            checked={selected}
                            onChange={() => setSteveSelectedIdx(idx)}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-1">
                            {selected ? (
                              <Input
                                value={opt.text}
                                maxLength={steveMaxChars}
                                onChange={e => {
                                  const v = e.target.value;
                                  setSteveOptions(prev => prev.map((o, i) => i === idx ? { ...o, text: v } : o));
                                }}
                                onClick={e => e.stopPropagation()}
                              />
                            ) : (
                              <p className="text-sm">{opt.text}</p>
                            )}
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              {opt.angle && <span className="uppercase">{opt.angle}</span>}
                              <span>{opt.text.length}/{steveMaxChars} chars</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {steveReasoning && (
                  <p className="text-[11px] text-muted-foreground italic pt-2 border-t border-border/50">
                    Steve: {steveReasoning}
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSteveOpen(false)} disabled={steveAdding}>
              Cancelar
            </Button>
            <Button
              onClick={steveAddSelected}
              disabled={
                steveAdding ||
                steveLoading ||
                (IMAGE_FIELDS.has(steveField) ? !steveImageUrl : steveSelectedIdx === null)
              }
            >
              {steveAdding && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Text Asset Dialog — remove old + add new (Asset inmutable en v23) */}
      <Dialog open={editAssetOpen} onOpenChange={(open) => { if (!open && !editAssetLoading) setEditAssetOpen(open); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Editar {fieldTypeLabels[editAssetFieldType] || editAssetFieldType}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(() => {
              const MAX_BY_TYPE: Record<string, number> = { HEADLINE: 30, LONG_HEADLINE: 90, DESCRIPTION: 90, BUSINESS_NAME: 25 };
              const maxLen = MAX_BY_TYPE[editAssetFieldType] ?? 90;
              return (
                <>
                  <Input
                    value={editAssetText}
                    onChange={(e) => setEditAssetText(e.target.value)}
                    maxLength={maxLen}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter' && !editAssetLoading) submitEditAsset(); }}
                  />
                  <p className="text-xs text-muted-foreground">{editAssetText.length}/{maxLen} chars</p>
                  <p className="text-[11px] text-muted-foreground italic">
                    Google Ads no permite modificar el texto de un asset. Steve crea la versión nueva y elimina la vieja.
                  </p>
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAssetOpen(false)} disabled={editAssetLoading}>
              Cancelar
            </Button>
            <Button
              onClick={submitEditAsset}
              disabled={editAssetLoading || editAssetText.trim() === '' || editAssetText.trim() === (editAssetOld?.text || editAssetOld?.name)}
            >
              {editAssetLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audience Signal Dialog — agregar a un AG existente */}
      <Dialog open={audienceOpen} onOpenChange={(open) => { if (!open && !audienceLoading) setAudienceOpen(open); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Agregar Audience Signal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={audienceName}
                onChange={e => setAudienceName(e.target.value)}
                maxLength={40}
                placeholder="Ej: Dueños de perros Santiago"
              />
              <p className="text-[11px] text-muted-foreground">
                Steve le agrega sufijo único automático para evitar colisión.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Edades</Label>
              <div className="grid grid-cols-2 gap-2 border rounded-md p-2">
                {[
                  { id: 'AGE_RANGE_18_24', label: '18-24' },
                  { id: 'AGE_RANGE_25_34', label: '25-34' },
                  { id: 'AGE_RANGE_35_44', label: '35-44' },
                  { id: 'AGE_RANGE_45_54', label: '45-54' },
                  { id: 'AGE_RANGE_55_64', label: '55-64' },
                  { id: 'AGE_RANGE_65_UP', label: '65+' },
                ].map(age => {
                  const checked = audienceAges.includes(age.id);
                  return (
                    <label key={age.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => setAudienceAges(prev =>
                          e.target.checked ? [...prev, age.id] : prev.filter(x => x !== age.id)
                        )}
                      />
                      {age.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Género</Label>
              <div className="flex gap-3 border rounded-md p-2">
                {[
                  { id: 'MALE', label: 'Masculino' },
                  { id: 'FEMALE', label: 'Femenino' },
                ].map(g => {
                  const checked = audienceGenders.includes(g.id);
                  return (
                    <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => setAudienceGenders(prev =>
                          e.target.checked ? [...prev, g.id] : prev.filter(x => x !== g.id)
                        )}
                      />
                      {g.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAudienceOpen(false)} disabled={audienceLoading}>
              Cancelar
            </Button>
            <Button onClick={submitAudienceSignal} disabled={audienceLoading}>
              {audienceLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Asset Group Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleteLoading) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Eliminar grupo de recursos</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              ¿Seguro que quieres eliminar <strong>"{deleteTarget?.name}"</strong>?
            </p>
            <p className="text-xs text-muted-foreground">
              Google Ads lo marcará como removido y quedará oculto del panel. Esta acción no se puede deshacer.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteLoading}>
              {deleteLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
