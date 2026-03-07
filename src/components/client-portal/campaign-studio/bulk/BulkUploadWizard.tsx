import { useState, useCallback, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import type { BrandIdentity } from '../templates/BrandHtmlGenerator';
import { generateBrandEmail } from '../templates/BrandHtmlGenerator';
import { renderBlockToHtml } from '../../email-blocks/blockRenderer';
import type { EmailBlock } from '../../email-blocks/blockTypes';
import { CAMPAIGN_TEMPLATES } from '../templates/TemplatePresets';
import {
  Upload, Sparkles, LayoutTemplate, Eye, CalendarDays, CheckCircle2,
  ArrowLeft, ArrowRight, Loader2, FileText, Trash2, GripVertical,
  Clock, ChevronRight, Check, AlertTriangle, Package, Tag, Calendar,
  Megaphone, Star, Zap, Send,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ContentItem {
  id: string;
  name: string;
  type: 'producto' | 'promocion' | 'evento' | 'noticia' | 'lanzamiento' | 'coleccion';
  description: string;
  priority: 'alta' | 'media' | 'baja';
  emailAngle: 'promotional' | 'informativo' | 'urgency' | 'storytelling' | 'social_proof';
  imageUrl: string;
  price: string;
  selected: boolean;
}

interface GeneratedEmail {
  itemId: string;
  itemName: string;
  subject: string;
  previewText: string;
  title: string;
  introText: string;
  ctaText: string;
  templateId: string | null;
  scheduledDate: string;
  scheduledTime: string;
  html: string;
  approved: boolean;
}

interface TemplateOption {
  id: string;
  name: string;
  contentBlocks: string | null;
}

interface BulkUploadWizardProps {
  clientId: string;
  brand: BrandIdentity;
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEP_LABELS = ['Contenido', 'Analisis', 'Templates', 'Emails', 'Calendario', 'Aprobar'];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const TYPE_ICONS: Record<ContentItem['type'], React.ElementType> = {
  producto: Package,
  promocion: Tag,
  evento: Calendar,
  noticia: Megaphone,
  lanzamiento: Star,
  coleccion: Zap,
};

const TYPE_LABELS: Record<ContentItem['type'], string> = {
  producto: 'Producto',
  promocion: 'Promocion',
  evento: 'Evento',
  noticia: 'Noticia',
  lanzamiento: 'Lanzamiento',
  coleccion: 'Coleccion',
};

const PRIORITY_COLORS: Record<ContentItem['priority'], string> = {
  alta: 'bg-red-100 text-red-700 border-red-200',
  media: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  baja: 'bg-gray-100 text-gray-500 border-gray-200',
};

const ANGLE_LABELS: Record<ContentItem['emailAngle'], string> = {
  promotional: 'Promocional',
  informativo: 'Informativo',
  urgency: 'Urgencia',
  storytelling: 'Storytelling',
  social_proof: 'Social Proof',
};

const TYPE_BADGE_COLORS: Record<ContentItem['type'], string> = {
  producto: 'bg-blue-100 text-blue-700',
  promocion: 'bg-orange-100 text-orange-700',
  evento: 'bg-purple-100 text-purple-700',
  noticia: 'bg-green-100 text-green-700',
  lanzamiento: 'bg-pink-100 text-pink-700',
  coleccion: 'bg-cyan-100 text-cyan-700',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function detectContentType(content: string): 'text' | 'csv' | 'json' | 'urls' {
  const trimmed = content.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return 'json';
  const lines = trimmed.split('\n');
  const urlPattern = /https?:\/\//;
  const urlCount = lines.filter(l => urlPattern.test(l)).length;
  if (urlCount > lines.length * 0.5 && urlCount >= 2) return 'urls';
  const commaLines = lines.filter(l => (l.match(/,/g) || []).length >= 2).length;
  if (commaLines > lines.length * 0.5 && commaLines >= 2) return 'csv';
  return 'text';
}

function formatDateToYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

function getWeekNumber(year: number, month: number, day: number): number {
  const date = new Date(year, month, day);
  const firstDayOfMonth = new Date(year, month, 1);
  const daysSinceFirst = Math.floor((date.getTime() - firstDayOfMonth.getTime()) / 86400000);
  return Math.floor(daysSinceFirst / 7) + 1;
}

async function generateHtmlForEmail(
  email: GeneratedEmail,
  brand: BrandIdentity,
  templates: TemplateOption[],
): Promise<string> {
  if (email.templateId) {
    const tmpl = templates.find(t => t.id === email.templateId);
    if (tmpl?.contentBlocks) {
      try {
        const blocks: EmailBlock[] = typeof tmpl.contentBlocks === 'string'
          ? JSON.parse(tmpl.contentBlocks)
          : tmpl.contentBlocks;
        if (Array.isArray(blocks) && blocks.length > 0) {
          const templateColors = {
            primary: brand.colors.primary,
            secondary: brand.colors.secondaryBg,
            accent: brand.colors.accent,
            button: brand.colors.accent,
            buttonText: '#ffffff',
            font: `'${brand.fonts.body}', ${brand.fonts.bodyType || 'sans-serif'}`,
          };
          const bodyHtml = blocks.map(b => renderBlockToHtml(b, templateColors)).join('\n');
          return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin:0; padding:0; background-color:#f6f6f9; font-family:'${brand.fonts.body}', ${brand.fonts.bodyType || 'sans-serif'}; }
    table { border-spacing:0; }
    td { padding:0; }
    img { border:0; display:block; max-width:100%; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f6f6f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f6f9;">
    <tr><td align="center" style="padding:24px 0;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td>
${bodyHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
        }
      } catch (err) {
        console.error('Error parsing template blocks:', err);
      }
    }
  }

  // Fallback: generate with brand email using the custom template sections
  const customSections = CAMPAIGN_TEMPLATES['custom'].sections;
  return generateBrandEmail({
    brand,
    sections: customSections,
    title: email.title,
    introText: email.introText,
    ctaText: email.ctaText,
    ctaUrl: brand.shopUrl,
    previewText: email.previewText,
  });
}

/* ================================================================== */
/*  BulkUploadWizard Component                                        */
/* ================================================================== */

export function BulkUploadWizard({ clientId, brand, open, onClose, onCreated }: BulkUploadWizardProps) {
  const now = new Date();
  const defaultMonth = now.getMonth() + 1 > 11 ? 0 : now.getMonth() + 1;
  const defaultYear = defaultMonth === 0 ? now.getFullYear() + 1 : now.getFullYear();

  // ---- Shared state ----
  const [step, setStep] = useState(0);
  const [hasContent, setHasContent] = useState(false);

  // Step 0: Content
  const [rawContent, setRawContent] = useState('');
  const [contentType, setContentType] = useState<'text' | 'csv' | 'json' | 'urls'>('text');
  const [fileName, setFileName] = useState('');

  // Step 1: Analysis
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [analysisError, setAnalysisError] = useState('');

  // Step 2: Templates
  const [clientTemplates, setClientTemplates] = useState<TemplateOption[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateMode, setTemplateMode] = useState<'single' | 'per_type'>('single');
  const [singleTemplateId, setSingleTemplateId] = useState<string | null>(null);
  const [templateAssignments, setTemplateAssignments] = useState<Record<string, string | null>>({});

  // Step 3: Email generation
  const [generatingEmails, setGeneratingEmails] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([]);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);

  // Step 4: Calendar
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [selectedYear, setSelectedYear] = useState(defaultYear);

  // Step 5: Approve
  const [previewEmailId, setPreviewEmailId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creationProgress, setCreationProgress] = useState(0);
  const [creationDone, setCreationDone] = useState(false);

  // Optimal send times
  const [optimalSlots, setOptimalSlots] = useState<Array<{day: number; hour: number; score: number}>>([]);

  // ---- Derived ----
  const selectedItems = useMemo(() => contentItems.filter(i => i.selected), [contentItems]);
  const approvedEmails = useMemo(() => generatedEmails.filter(e => e.approved), [generatedEmails]);
  const uniqueTypes = useMemo(() => {
    const types = new Set(selectedItems.map(i => i.type));
    return Array.from(types) as ContentItem['type'][];
  }, [selectedItems]);

  // ---- Reset on open/close ----
  useEffect(() => {
    if (open) {
      setStep(0);
      setRawContent('');
      setContentType('text');
      setFileName('');
      setHasContent(false);
      setContentItems([]);
      setAnalysisError('');
      setAnalyzing(false);
      setAnalyzeProgress(0);
      setClientTemplates([]);
      setTemplateMode('single');
      setSingleTemplateId(null);
      setTemplateAssignments({});
      setGeneratedEmails([]);
      setGeneratingEmails(false);
      setGenerationProgress(0);
      setExpandedEmailId(null);
      setEditingEmailId(null);
      setSelectedMonth(defaultMonth);
      setSelectedYear(defaultYear);
      setPreviewEmailId(null);
      setCreating(false);
      setCreationProgress(0);
      setCreationDone(false);
    }
  }, [open, defaultMonth, defaultYear]);

  // ---- Load optimal send times ----
  useEffect(() => {
    if (!open) return;
    async function loadOptimalTimes() {
      try {
        const { data: conn } = await supabase
          .from('platform_connections')
          .select('id')
          .eq('client_id', clientId)
          .eq('platform', 'klaviyo')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (!conn) return;

        const { data } = await callApi('steve-send-time-analysis', {
          body: { connectionId: conn.id },
        });

        if (data?.bestSlots) {
          setOptimalSlots(data.bestSlots);
        }
      } catch {
        // Silently fail — optimal times are a nice-to-have
      }
    }
    loadOptimalTimes();
  }, [open, clientId]);

  // ---- Auto-detect content type ----
  useEffect(() => {
    if (rawContent.length > 5) {
      setContentType(detectContentType(rawContent));
    }
  }, [rawContent]);

  // ---- Track if user entered any content ----
  useEffect(() => {
    if (rawContent.length > 0 || contentItems.length > 0 || generatedEmails.length > 0) {
      setHasContent(true);
    }
  }, [rawContent, contentItems, generatedEmails]);

  // ---- Close handler with confirmation ----
  const handleClose = useCallback(() => {
    if (hasContent && !creationDone) {
      const confirmed = window.confirm('Tienes contenido sin guardar. ¿Seguro que quieres salir?');
      if (!confirmed) return;
    }
    onClose();
  }, [hasContent, creationDone, onClose]);

  // ---- Can advance logic ----
  const canAdvance = useMemo(() => {
    switch (step) {
      case 0: return rawContent.length > 10;
      case 1: return selectedItems.length >= 1;
      case 2: return true;
      case 3: return generatedEmails.length > 0;
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  }, [step, rawContent, selectedItems, generatedEmails]);

  // ---- Step navigation ----
  const handleNext = useCallback(() => {
    if (step < 5 && canAdvance) {
      setStep(s => s + 1);
    }
  }, [step, canAdvance]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      setStep(s => s - 1);
    }
  }, [step]);

  /* ================================================================ */
  /*  Step 1: Analyze content via edge function                       */
  /* ================================================================ */
  useEffect(() => {
    if (step !== 1 || contentItems.length > 0 || analyzing) return;

    let cancelled = false;

    async function analyze() {
      setAnalyzing(true);
      setAnalysisError('');
      setAnalyzeProgress(10);

      const progressInterval = setInterval(() => {
        setAnalyzeProgress(prev => Math.min(prev + Math.random() * 15, 85));
      }, 800);

      try {
        const { data, error } = await callApi('steve-bulk-analyze', {
          body: { action: 'analyze', content: rawContent, contentType },
        });

        clearInterval(progressInterval);

        if (cancelled) return;

        if (error) {
          setAnalysisError(`Error al analizar: ${error.message}`);
          setAnalyzeProgress(0);
          setAnalyzing(false);
          return;
        }

        const items: ContentItem[] = (data?.items || []).map((item: any) => ({
          id: item.id || crypto.randomUUID(),
          name: item.name || 'Sin nombre',
          type: item.type || 'producto',
          description: item.description || '',
          priority: item.priority || 'media',
          emailAngle: item.emailAngle || 'promotional',
          imageUrl: item.imageUrl || '',
          price: item.price || '',
          selected: true,
        }));

        setContentItems(items);
        setAnalyzeProgress(100);
      } catch (err: any) {
        clearInterval(progressInterval);
        if (!cancelled) {
          setAnalysisError(`Error inesperado: ${err.message || 'Desconocido'}`);
          setAnalyzeProgress(0);
        }
      }

      if (!cancelled) setAnalyzing(false);
    }

    analyze();
    return () => { cancelled = true; };
  }, [step, contentItems.length, analyzing, rawContent, contentType]);

  /* ================================================================ */
  /*  Step 2: Load templates                                          */
  /* ================================================================ */
  useEffect(() => {
    if (step !== 2 || clientTemplates.length > 0 || loadingTemplates) return;

    let cancelled = false;

    async function loadTemplates() {
      setLoadingTemplates(true);
      const { data } = await supabase
        .from('email_templates')
        .select('id, name, content_blocks')
        .eq('client_id', clientId)
        .order('updated_at', { ascending: false });

      if (!cancelled && data) {
        setClientTemplates(data.map(t => ({
          id: t.id,
          name: t.name,
          contentBlocks: t.content_blocks ? JSON.stringify(t.content_blocks) : null,
        })));
      }
      if (!cancelled) setLoadingTemplates(false);
    }

    loadTemplates();
    return () => { cancelled = true; };
  }, [step, clientTemplates.length, loadingTemplates, clientId]);

  /* ================================================================ */
  /*  Step 3: Generate emails via edge function                       */
  /* ================================================================ */
  useEffect(() => {
    if (step !== 3 || generatedEmails.length > 0 || generatingEmails) return;

    let cancelled = false;

    async function generate() {
      setGeneratingEmails(true);
      setGenerationProgress(0);

      const progressInterval = setInterval(() => {
        setGenerationProgress(prev => Math.min(prev + Math.random() * 12, 80));
      }, 600);

      try {
        const { data, error } = await callApi('steve-bulk-analyze', {
          body: {
            action: 'generate',
            items: selectedItems,
            brandTone: brand.aesthetic,
            month: MONTH_NAMES[selectedMonth],
            year: selectedYear,
          },
        });

        clearInterval(progressInterval);

        if (cancelled) return;

        if (error) {
          toast.error(`Error al generar emails: ${error.message}`);
          setGeneratingEmails(false);
          setGenerationProgress(0);
          return;
        }

        const rawEmails: any[] = data?.emails || [];

        // Build template assignment map
        const getTemplateForItem = (item: ContentItem): string | null => {
          if (templateMode === 'single') return singleTemplateId;
          return templateAssignments[item.type] ?? null;
        };

        // Assign dates: spread across the selected month
        const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
        const totalEmails = rawEmails.length;
        const spacing = Math.max(1, Math.floor(daysInMonth / (totalEmails + 1)));

        const emails: GeneratedEmail[] = [];

        for (let i = 0; i < rawEmails.length; i++) {
          const raw = rawEmails[i];
          const item = selectedItems.find(si => si.id === raw.itemId) || selectedItems[i];
          const dayNum = Math.min(Math.max(1, spacing * (i + 1)), daysInMonth);
          const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const assignedTemplateId = item ? getTemplateForItem(item) : null;

          const email: GeneratedEmail = {
            itemId: raw.itemId || item?.id || crypto.randomUUID(),
            itemName: raw.itemName || item?.name || 'Email',
            subject: raw.subject || `Email: ${item?.name || ''}`,
            previewText: raw.previewText || '',
            title: raw.title || item?.name || '',
            introText: raw.introText || '',
            ctaText: raw.ctaText || 'Ver mas',
            templateId: assignedTemplateId,
            scheduledDate: raw.scheduledDate || dateStr,
            scheduledTime: raw.scheduledTime || (optimalSlots.length > 0 ? `${String(optimalSlots[0].hour).padStart(2, '0')}:00` : '10:00'),
            html: '',
            approved: true,
          };

          emails.push(email);
        }

        // Generate HTML for all emails
        setGenerationProgress(85);

        for (let i = 0; i < emails.length; i++) {
          emails[i].html = await generateHtmlForEmail(emails[i], brand, clientTemplates);
          setGenerationProgress(85 + ((i + 1) / emails.length) * 15);
        }

        if (!cancelled) {
          setGeneratedEmails(emails);
          setGenerationProgress(100);
        }
      } catch (err: any) {
        clearInterval(progressInterval);
        if (!cancelled) {
          toast.error(`Error generando emails: ${err.message || 'Desconocido'}`);
          setGenerationProgress(0);
        }
      }

      if (!cancelled) setGeneratingEmails(false);
    }

    generate();
    return () => { cancelled = true; };
  }, [step, generatedEmails.length, generatingEmails, selectedItems, brand, selectedMonth, selectedYear, templateMode, singleTemplateId, templateAssignments, clientTemplates]);

  /* ================================================================ */
  /*  Step 5: Create drafts                                           */
  /* ================================================================ */
  const handleCreateDrafts = useCallback(async () => {
    setCreating(true);
    setCreationProgress(0);

    const toCreate = approvedEmails;
    let successCount = 0;

    for (let i = 0; i < toCreate.length; i++) {
      const email = toCreate[i];
      try {
        const scheduledAt = new Date(`${email.scheduledDate}T${email.scheduledTime}:00`).toISOString();

        const insertPayload: Record<string, any> = {
          client_id: clientId,
          name: email.itemName,
          subject: email.subject,
          preview_text: email.previewText,
          final_html: email.html,
          status: 'draft',
          scheduled_at: scheduledAt,
        };

        if (email.templateId) {
          insertPayload.template_id = email.templateId;
        }

        const { error } = await supabase
          .from('email_campaigns')
          .insert(insertPayload as any);

        if (!error) successCount++;
        else console.error('Error inserting campaign:', error);
      } catch (err) {
        console.error('Error creating draft:', err);
      }

      setCreationProgress(Math.round(((i + 1) / toCreate.length) * 100));
    }

    setCreating(false);
    setCreationDone(true);
    toast.success(`${successCount}/${toCreate.length} borradores creados exitosamente`);
    onCreated?.();
  }, [approvedEmails, clientId, onCreated]);

  /* ================================================================ */
  /*  Update helpers                                                  */
  /* ================================================================ */

  const toggleSelectAll = useCallback((selectAll: boolean) => {
    setContentItems(prev => prev.map(i => ({ ...i, selected: selectAll })));
  }, []);

  const toggleItem = useCallback((id: string) => {
    setContentItems(prev => prev.map(i => i.id === id ? { ...i, selected: !i.selected } : i));
  }, []);

  const updateEmail = useCallback((itemId: string, updates: Partial<GeneratedEmail>) => {
    setGeneratedEmails(prev => prev.map(e => e.itemId === itemId ? { ...e, ...updates } : e));
  }, []);

  const toggleEmailApproval = useCallback((itemId: string) => {
    setGeneratedEmails(prev => prev.map(e => e.itemId === itemId ? { ...e, approved: !e.approved } : e));
  }, []);

  const approveAll = useCallback(() => {
    setGeneratedEmails(prev => prev.map(e => ({ ...e, approved: true })));
  }, []);

  /* ================================================================ */
  /*  File upload handler                                             */
  /* ================================================================ */
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        setRawContent(text);
        setContentType(detectContentType(text));
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        setRawContent(text);
        setContentType(detectContentType(text));
      }
    };
    reader.readAsText(file);
  }, []);

  /* ================================================================ */
  /*  Calendar helpers for Step 4                                     */
  /* ================================================================ */
  const calendarData = useMemo(() => {
    const days = getDaysInMonth(selectedYear, selectedMonth);
    const firstDay = getFirstDayOfWeek(selectedYear, selectedMonth);
    const weeks: Array<Array<{ day: number | null; emails: GeneratedEmail[] }>> = [];
    let currentWeek: Array<{ day: number | null; emails: GeneratedEmail[] }> = [];

    // Leading empty cells
    for (let i = 0; i < firstDay; i++) {
      currentWeek.push({ day: null, emails: [] });
    }

    for (let d = 1; d <= days; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEmails = generatedEmails.filter(e => e.scheduledDate === dateStr);
      currentWeek.push({ day: d, emails: dayEmails });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Trailing empty cells
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ day: null, emails: [] });
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [selectedYear, selectedMonth, generatedEmails]);

  const weekWarnings = useMemo(() => {
    const warnings: Record<number, boolean> = {};
    generatedEmails.forEach(e => {
      const parts = e.scheduledDate.split('-');
      const day = parseInt(parts[2]);
      const weekNum = getWeekNumber(selectedYear, selectedMonth, day);
      if (!warnings[weekNum]) warnings[weekNum] = false;
    });

    // Count emails per week
    const weekCounts: Record<number, number> = {};
    generatedEmails.forEach(e => {
      const parts = e.scheduledDate.split('-');
      const day = parseInt(parts[2]);
      const weekNum = getWeekNumber(selectedYear, selectedMonth, day);
      weekCounts[weekNum] = (weekCounts[weekNum] || 0) + 1;
    });

    Object.entries(weekCounts).forEach(([week, count]) => {
      if (count > 3) warnings[parseInt(week)] = true;
    });

    return warnings;
  }, [generatedEmails, selectedYear, selectedMonth]);

  const hasWeekWarnings = Object.values(weekWarnings).some(Boolean);

  /* ================================================================ */
  /*  Summary stats                                                   */
  /* ================================================================ */
  const typeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    contentItems.forEach(i => {
      counts[i.type] = (counts[i.type] || 0) + 1;
    });
    return counts;
  }, [contentItems]);

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Upload className="w-5 h-5" style={{ color: brand.colors.accent }} />
            Bulk Upload &amp; Email Planner
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Paso {step + 1} de 6 &mdash; {STEP_LABELS[step]}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      i < step
                        ? 'text-white'
                        : i === step
                        ? 'text-white ring-2'
                        : 'bg-muted text-muted-foreground'
                    }`}
                    style={{
                      backgroundColor: i <= step ? brand.colors.accent : undefined,
                      ['--tw-ring-color' as any]: i === step ? `${brand.colors.accent}40` : undefined,
                    }}
                  >
                    {i < step ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-[10px] mt-1 font-medium ${
                    i <= step ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div
                    className="w-6 sm:w-12 h-0.5 mx-1 mt-[-12px]"
                    style={{ backgroundColor: i < step ? brand.colors.accent : '#e5e7eb' }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6 min-h-[400px]">

          {/* ============== STEP 0: Content Upload ============== */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Pega tu contenido</Label>
                <Textarea
                  value={rawContent}
                  onChange={(e) => setRawContent(e.target.value)}
                  placeholder="Pega aqui tu contenido: productos, promociones, eventos, URLs, lo que sea..."
                  className="mt-1.5 min-h-[200px] font-mono text-sm"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {contentType === 'json' ? 'JSON' : contentType === 'csv' ? 'CSV' : contentType === 'urls' ? 'URLs' : 'Texto'}
                    </Badge>
                    {fileName && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {fileName}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {rawContent.length} caracteres
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium">O</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => document.getElementById('bulk-file-input')?.click()}
              >
                <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Arrastra un archivo aqui o haz click para seleccionar
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Formatos: .csv, .xlsx, .json, .txt
                </p>
                <input
                  id="bulk-file-input"
                  type="file"
                  accept=".csv,.xlsx,.json,.txt"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            </div>
          )}

          {/* ============== STEP 1: Analysis Results ============== */}
          {step === 1 && (
            <div className="space-y-4">
              {analyzing ? (
                <div className="text-center py-12 space-y-4">
                  <Sparkles className="w-10 h-10 mx-auto animate-pulse" style={{ color: brand.colors.accent }} />
                  <p className="text-sm font-medium">Steve esta analizando tu contenido...</p>
                  <div className="max-w-xs mx-auto">
                    <Progress value={analyzeProgress} className="h-2" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Detectando productos, promociones, eventos y mas
                  </p>
                </div>
              ) : analysisError ? (
                <div className="text-center py-12 space-y-3">
                  <AlertTriangle className="w-10 h-10 mx-auto text-destructive" />
                  <p className="text-sm text-destructive font-medium">{analysisError}</p>
                  <Button variant="outline" size="sm" onClick={() => { setContentItems([]); setAnalysisError(''); }}>
                    Reintentar
                  </Button>
                </div>
              ) : contentItems.length > 0 ? (
                <>
                  {/* Summary */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge style={{ backgroundColor: brand.colors.accent, color: '#fff' }} className="text-sm px-3 py-1">
                      <Sparkles className="w-3.5 h-3.5 mr-1" />
                      Steve detecto {contentItems.length} items
                    </Badge>
                    {Object.entries(typeBreakdown).map(([type, count]) => {
                      const TypeIcon = TYPE_ICONS[type as ContentItem['type']] || Package;
                      return (
                        <Badge key={type} variant="outline" className="text-xs">
                          <TypeIcon className="w-3 h-3 mr-1" />
                          {count} {TYPE_LABELS[type as ContentItem['type']] || type}
                        </Badge>
                      );
                    })}
                  </div>

                  {/* Select all toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {selectedItems.length} de {contentItems.length} seleccionados
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSelectAll(selectedItems.length < contentItems.length)}
                    >
                      {selectedItems.length === contentItems.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                    </Button>
                  </div>

                  {/* Item list */}
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {contentItems.map((item) => {
                      const TypeIcon = TYPE_ICONS[item.type] || Package;
                      return (
                        <Card key={item.id} className={`transition-opacity ${!item.selected ? 'opacity-50' : ''}`}>
                          <CardContent className="p-3">
                            <div className="flex items-start gap-3">
                              <div className="pt-0.5">
                                <Checkbox
                                  checked={item.selected}
                                  onCheckedChange={() => toggleItem(item.id)}
                                />
                              </div>
                              <TypeIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-muted-foreground" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm">{item.name}</span>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[item.priority]}`}
                                  >
                                    {item.priority}
                                  </Badge>
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${TYPE_BADGE_COLORS[item.type]}`}>
                                    {TYPE_LABELS[item.type]}
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {ANGLE_LABELS[item.emailAngle]}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                                {item.price && (
                                  <span className="text-xs font-medium mt-1 inline-block" style={{ color: brand.colors.accent }}>
                                    {item.price}
                                  </span>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-sm">No se detectaron items. Vuelve atras y revisa tu contenido.</p>
                </div>
              )}
            </div>
          )}

          {/* ============== STEP 2: Template Selection ============== */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecciona como asignar templates a los emails generados.
              </p>

              {loadingTemplates ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  {/* Mode selector */}
                  <div className="flex gap-2">
                    <Button
                      variant={templateMode === 'single' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTemplateMode('single')}
                    >
                      Un template para todos
                    </Button>
                    <Button
                      variant={templateMode === 'per_type' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTemplateMode('per_type')}
                    >
                      Template por tipo
                    </Button>
                  </div>

                  {templateMode === 'single' ? (
                    <div className="space-y-2">
                      <Label className="text-sm">Template</Label>
                      <Select
                        value={singleTemplateId || 'auto'}
                        onValueChange={v => setSingleTemplateId(v === 'auto' ? null : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar template" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">
                            <span className="flex items-center gap-2">
                              <Sparkles className="w-3.5 h-3.5" />
                              Auto-generado (Steve decide)
                            </span>
                          </SelectItem>
                          {clientTemplates.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {uniqueTypes.map(type => {
                        const TypeIcon = TYPE_ICONS[type];
                        const count = selectedItems.filter(i => i.type === type).length;
                        return (
                          <div key={type} className="flex items-center gap-3">
                            <div className="flex items-center gap-2 w-40">
                              <TypeIcon className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{TYPE_LABELS[type]}</span>
                              <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                            </div>
                            <Select
                              value={templateAssignments[type] || 'auto'}
                              onValueChange={v => setTemplateAssignments(prev => ({
                                ...prev,
                                [type]: v === 'auto' ? null : v,
                              }))}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">
                                  <span className="flex items-center gap-2">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Auto-generado (Steve decide)
                                  </span>
                                </SelectItem>
                                {clientTemplates.map(t => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Template grid preview */}
                  {clientTemplates.length > 0 && (
                    <div className="mt-4">
                      <Label className="text-sm text-muted-foreground mb-2 block">
                        Templates disponibles ({clientTemplates.length})
                      </Label>
                      <div className="grid grid-cols-3 gap-2">
                        {clientTemplates.map(t => {
                          const isSelected = templateMode === 'single'
                            ? singleTemplateId === t.id
                            : Object.values(templateAssignments).includes(t.id);
                          return (
                            <Card
                              key={t.id}
                              className={`cursor-pointer transition-all hover:ring-2 ${isSelected ? 'ring-2' : ''}`}
                              style={{ borderColor: isSelected ? brand.colors.accent : undefined, ringColor: brand.colors.accent }}
                              onClick={() => {
                                if (templateMode === 'single') {
                                  setSingleTemplateId(singleTemplateId === t.id ? null : t.id);
                                }
                              }}
                            >
                              <CardContent className="p-3 text-center">
                                <LayoutTemplate className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground" />
                                <p className="text-xs font-medium truncate">{t.name}</p>
                                {isSelected && (
                                  <CheckCircle2 className="w-3.5 h-3.5 mx-auto mt-1" style={{ color: brand.colors.accent }} />
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {clientTemplates.length === 0 && (
                    <Card className="bg-muted/50">
                      <CardContent className="p-4 text-center">
                        <LayoutTemplate className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          No tienes templates guardados. Steve generara los emails automaticamente con tu identidad de marca.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}

          {/* ============== STEP 3: Email Generation ============== */}
          {step === 3 && (
            <div className="space-y-4">
              {generatingEmails ? (
                <div className="text-center py-12 space-y-4">
                  <Sparkles className="w-10 h-10 mx-auto animate-pulse" style={{ color: brand.colors.accent }} />
                  <p className="text-sm font-medium">
                    Steve esta generando {selectedItems.length} emails...
                  </p>
                  <div className="max-w-xs mx-auto">
                    <Progress value={generationProgress} className="h-2" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {generationProgress < 85 ? 'Creando contenido personalizado' : 'Generando HTML'}
                  </p>
                </div>
              ) : generatedEmails.length > 0 ? (
                <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                  {generatedEmails.map((email) => {
                    const item = contentItems.find(i => i.id === email.itemId);
                    const isExpanded = expandedEmailId === email.itemId;
                    const isEditing = editingEmailId === email.itemId;

                    return (
                      <Card key={email.itemId}>
                        <CardContent className="p-3 space-y-2">
                          {/* Main row */}
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Send className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                {isEditing ? (
                                  <Input
                                    value={email.subject}
                                    onChange={e => updateEmail(email.itemId, { subject: e.target.value })}
                                    className="h-7 text-sm font-medium"
                                  />
                                ) : (
                                  <span className="font-medium text-sm truncate">{email.subject}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">{email.previewText || 'Sin preview text'}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[10px]">{email.itemName}</Badge>
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <CalendarDays className="w-3 h-3" />
                                  {email.scheduledDate} {email.scheduledTime}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingEmailId(isEditing ? null : email.itemId)}
                              >
                                {isEditing ? <Check className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpandedEmailId(isExpanded ? null : email.itemId)}
                              >
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                              </Button>
                            </div>
                          </div>

                          {/* Expanded section */}
                          {isExpanded && (
                            <div className="border-t pt-2 space-y-2">
                              {isEditing ? (
                                <div className="space-y-2">
                                  <div>
                                    <Label className="text-xs">Titulo</Label>
                                    <Input
                                      value={email.title}
                                      onChange={e => updateEmail(email.itemId, { title: e.target.value })}
                                      className="h-7 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Preview text</Label>
                                    <Input
                                      value={email.previewText}
                                      onChange={e => updateEmail(email.itemId, { previewText: e.target.value })}
                                      className="h-7 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Intro</Label>
                                    <Textarea
                                      value={email.introText}
                                      onChange={e => updateEmail(email.itemId, { introText: e.target.value })}
                                      className="text-sm min-h-[60px]"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">CTA</Label>
                                    <Input
                                      value={email.ctaText}
                                      onChange={e => updateEmail(email.itemId, { ctaText: e.target.value })}
                                      className="h-7 text-sm"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">Titulo:</span>
                                    <p className="font-medium">{email.title}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">CTA:</span>
                                    <p className="font-medium">{email.ctaText}</p>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-muted-foreground">Intro:</span>
                                    <p className="line-clamp-2">{email.introText}</p>
                                  </div>
                                </div>
                              )}

                              {/* HTML preview thumbnail */}
                              {email.html && (
                                <div className="border rounded overflow-hidden" style={{ height: '120px' }}>
                                  <iframe
                                    srcDoc={email.html}
                                    title={`Preview ${email.itemName}`}
                                    className="w-full border-0 pointer-events-none"
                                    style={{ transform: 'scale(0.3)', transformOrigin: 'top left', width: '333%', height: '333%' }}
                                    sandbox="allow-same-origin"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-sm">No se generaron emails. Vuelve atras y verifica la seleccion.</p>
                </div>
              )}
            </div>
          )}

          {/* ============== STEP 4: Calendar View ============== */}
          {step === 4 && (
            <div className="space-y-4">
              {/* Month/Year selector */}
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((m, i) => (
                        <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28">
                  <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2025, 2026, 2027].map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Send className="w-3.5 h-3.5" />
                  {generatedEmails.length} emails
                </div>
              </div>

              {/* Warnings */}
              {hasWeekWarnings && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  Hay semanas con mas de 3 emails. Considera redistribuir.
                </div>
              )}

              {/* Calendar grid */}
              <div className="border rounded-lg overflow-hidden">
                {/* Day headers */}
                <div className="grid grid-cols-7 bg-muted">
                  {['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map(d => (
                    <div key={d} className="text-center text-xs font-medium py-2 text-muted-foreground">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Calendar rows */}
                {calendarData.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 border-t">
                    {week.map((cell, ci) => (
                      <div
                        key={ci}
                        className={`min-h-[72px] p-1 border-r last:border-r-0 ${
                          cell.day === null ? 'bg-muted/30' : 'bg-white'
                        }`}
                      >
                        {cell.day !== null && (
                          <>
                            <span className="text-xs text-muted-foreground">{cell.day}</span>
                            <div className="space-y-0.5 mt-0.5">
                              {cell.emails.map(email => {
                                const item = contentItems.find(i => i.id === email.itemId);
                                const typeColor = item ? TYPE_BADGE_COLORS[item.type] : 'bg-gray-100 text-gray-700';
                                return (
                                  <div
                                    key={email.itemId}
                                    className={`text-[9px] px-1 py-0.5 rounded truncate ${typeColor}`}
                                    title={`${email.subject} (${email.scheduledTime})`}
                                  >
                                    {email.itemName}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Email schedule editor */}
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                <Label className="text-sm font-medium">Ajustar fechas y horarios</Label>
                {generatedEmails.map(email => (
                  <div key={email.itemId} className="flex items-center gap-2">
                    <span className="text-xs font-medium w-36 truncate">{email.itemName}</span>
                    <Input
                      type="date"
                      value={email.scheduledDate}
                      onChange={e => updateEmail(email.itemId, { scheduledDate: e.target.value })}
                      className="h-7 text-xs w-36"
                    />
                    <Input
                      type="time"
                      value={email.scheduledTime}
                      onChange={e => updateEmail(email.itemId, { scheduledTime: e.target.value })}
                      className="h-7 text-xs w-24"
                    />
                  </div>
                ))}
              </div>

              {/* Distribution stats */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                <span>{generatedEmails.length} emails en total</span>
                <span>
                  {uniqueTypes.map(t => `${selectedItems.filter(i => i.type === t).length} ${TYPE_LABELS[t]}`).join(', ')}
                </span>
              </div>
            </div>
          )}

          {/* ============== STEP 5: Review & Approve ============== */}
          {step === 5 && (
            <div className="space-y-4">
              {creationDone ? (
                <div className="text-center py-12 space-y-4">
                  <CheckCircle2 className="w-14 h-14 mx-auto" style={{ color: brand.colors.accent }} />
                  <p className="text-lg font-semibold">Borradores creados exitosamente</p>
                  <p className="text-sm text-muted-foreground">
                    Se crearon {approvedEmails.length} borradores de email. Puedes encontrarlos en tu panel de campanas.
                  </p>
                  <Button onClick={onClose}>Cerrar</Button>
                </div>
              ) : creating ? (
                <div className="text-center py-12 space-y-4">
                  <Loader2 className="w-10 h-10 mx-auto animate-spin" style={{ color: brand.colors.accent }} />
                  <p className="text-sm font-medium">Creando borradores...</p>
                  <div className="max-w-xs mx-auto">
                    <Progress value={creationProgress} className="h-2" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Math.round((creationProgress / 100) * approvedEmails.length)} de {approvedEmails.length}
                  </p>
                </div>
              ) : (
                <>
                  {/* Top actions */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-sm">
                        {approvedEmails.length} de {generatedEmails.length} aprobados
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm" onClick={approveAll}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Aprobar Todos
                    </Button>
                  </div>

                  {/* Email list */}
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {generatedEmails.map((email) => {
                      const item = contentItems.find(i => i.id === email.itemId);
                      const isPreviewOpen = previewEmailId === email.itemId;
                      const tmpl = clientTemplates.find(t => t.id === email.templateId);

                      return (
                        <Card key={email.itemId} className={`transition-opacity ${!email.approved ? 'opacity-60' : ''}`}>
                          <CardContent className="p-3">
                            <div className="flex items-start gap-3">
                              <div className="pt-0.5">
                                <Checkbox
                                  checked={email.approved}
                                  onCheckedChange={() => toggleEmailApproval(email.itemId)}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{email.subject}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <CalendarDays className="w-3 h-3" />
                                    {email.scheduledDate}
                                  </span>
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {email.scheduledTime}
                                  </span>
                                  {tmpl && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                      <LayoutTemplate className="w-2.5 h-2.5 mr-0.5" />
                                      {tmpl.name}
                                    </Badge>
                                  )}
                                  {!tmpl && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                      <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                                      Auto-generado
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPreviewEmailId(isPreviewOpen ? null : email.itemId)}
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                <span className="text-xs">Vista previa</span>
                              </Button>
                            </div>

                            {/* Preview iframe */}
                            {isPreviewOpen && email.html && (
                              <div className="mt-3 border rounded-lg overflow-hidden bg-muted/30 flex justify-center p-4">
                                <iframe
                                  srcDoc={email.html}
                                  title={`Preview ${email.itemName}`}
                                  className="border-0 bg-white rounded shadow-sm"
                                  style={{ width: '600px', height: '500px', maxWidth: '100%' }}
                                  sandbox="allow-same-origin"
                                />
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Create button */}
                  <div className="pt-3 border-t">
                    <Button
                      onClick={handleCreateDrafts}
                      disabled={approvedEmails.length === 0}
                      size="lg"
                      className="w-full"
                      style={{ backgroundColor: brand.colors.accent }}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Crear {approvedEmails.length} Borradores
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ============== Navigation Bar ============== */}
        {!creationDone && (
          <div className="flex items-center justify-between p-6 pt-0 border-t mt-2">
            <Button
              variant="ghost"
              onClick={step === 0 ? handleClose : handleBack}
              disabled={creating || generatingEmails || analyzing}
            >
              {step === 0 ? (
                'Cancelar'
              ) : (
                <>
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Atras
                </>
              )}
            </Button>

            {step < 5 && (
              <Button
                onClick={handleNext}
                disabled={!canAdvance || creating || generatingEmails || analyzing}
                style={{ backgroundColor: canAdvance ? brand.colors.accent : undefined }}
              >
                Siguiente
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
