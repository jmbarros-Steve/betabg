import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BrandAssetUploader } from './BrandAssetUploader';
import avatarSteve from '@/assets/avatar-steve.png';
import personaFemale from '@/assets/persona-female.jpg';
import personaMale from '@/assets/persona-male.jpg';
import steveSignature from '@/assets/steve-signature.png';
import logo from '@/assets/logo.jpg';
import {
  FileText, RefreshCw, CheckCircle2, AlertCircle, Download,
  Building2, Users, Trophy, MessageSquare, DollarSign, Store,
  Target, Heart, Shield, TrendingUp, Gem, Gift,
  Search, Globe, BarChart3, Key, Megaphone, Image,
  Sparkles, Award, AlertTriangle, TrendingDown, Lightbulb, MapPin, Briefcase
} from 'lucide-react';

interface BrandBriefViewProps {
  clientId: string;
  onEditBrief: () => void;
}

interface BriefData {
  raw_responses?: string[];
  summary?: string;
  completed_at?: string;
  questions?: string[];
  answered_count?: number;
  total_questions?: number;
}

interface ResearchData {
  seo_audit?: any;
  competitor_analysis?: any;
  keywords?: any;
  ads_library_analysis?: any;
  executive_summary?: any;
}

const QUESTION_CONFIG: Record<string, { label: string; icon: React.ReactNode; section: string }> = {
  business_pitch: { label: 'El Negocio', icon: <Building2 className="h-4 w-4" />, section: 'negocio' },
  numbers: { label: 'Números Clave', icon: <DollarSign className="h-4 w-4" />, section: 'negocio' },
  sales_channels: { label: 'Canales de Venta', icon: <Store className="h-4 w-4" />, section: 'negocio' },
  persona_profile: { label: 'Perfil del Cliente', icon: <Users className="h-4 w-4" />, section: 'persona' },
  persona_pain: { label: 'Dolor y Vergüenza', icon: <Heart className="h-4 w-4" />, section: 'persona' },
  persona_words: { label: 'Palabras y Objeciones', icon: <MessageSquare className="h-4 w-4" />, section: 'persona' },
  persona_transformation: { label: 'Transformación', icon: <TrendingUp className="h-4 w-4" />, section: 'persona' },
  persona_lifestyle: { label: 'Estilo de Vida', icon: <Gem className="h-4 w-4" />, section: 'persona' },
  competitors: { label: 'Competidores', icon: <Trophy className="h-4 w-4" />, section: 'competencia' },
  competitors_weakness: { label: 'Fallas Competencia', icon: <Shield className="h-4 w-4" />, section: 'competencia' },
  your_advantage: { label: 'Tu Ventaja', icon: <Trophy className="h-4 w-4" />, section: 'competencia' },
  purple_cow_promise: { label: 'Vaca Púrpura', icon: <Gem className="h-4 w-4" />, section: 'estrategia' },
  villain_guarantee: { label: 'Villano y Garantía', icon: <Shield className="h-4 w-4" />, section: 'estrategia' },
  proof_tone: { label: 'Prueba y Tono', icon: <Target className="h-4 w-4" />, section: 'estrategia' },
  brand_assets: { label: 'Identidad Visual', icon: <Image className="h-4 w-4" />, section: 'estrategia' },
};

const SECTIONS = [
  { id: 'negocio', title: 'El Negocio', icon: Building2 },
  { id: 'persona', title: 'Buyer Persona', icon: Users },
  { id: 'competencia', title: 'Análisis Competitivo', icon: Trophy },
  { id: 'estrategia', title: 'Estrategia', icon: MessageSquare },
];

// Parse persona profile from Q4 response — handles both structured form and text format
function parsePersonaProfile(response: string): Record<string, string> {
  const profile: Record<string, string> = {};
  const lines = response.split('\n');
  for (const line of lines) {
    const match = line.match(/^(.+?):\s*(.+)$/);
    if (match) {
      const key = match[1].replace(/^[^\w]*/, '').replace(/^[\s🎂👤⚧📍💼💰💍🎯]+/, '').trim().toLowerCase();
      profile[key] = match[2].trim();
    }
  }
  return profile;
}

function detectGender(personaData: Record<string, string>): 'female' | 'male' {
  const genderField = Object.entries(personaData).find(([k]) => k.includes('género') || k.includes('genero') || k.includes('gender'));
  if (genderField) {
    const val = genderField[1].toLowerCase();
    if (val.includes('mujer') || val.includes('fem') || val.includes('female')) return 'female';
  }
  return 'male';
}

// Format raw responses into professional third person text
// Format currency with $ and thousand separators (Chilean style: $1.500.000)
function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseInt(value.replace(/[^\d]/g, ''), 10) : value;
  if (isNaN(num)) return String(value);
  return '$' + num.toLocaleString('es-CL');
}

function formatResponseProfessional(qId: string, response: string): string {
  if (!response) return '';
  // Clean emoji prefixes from form submissions
  return response.replace(/^[🎨📷🌐🔍💰📦🚚📣📊🛒🏪🏬📱📸👥👤🎂⚧📍💼💍🎯1️⃣2️⃣3️⃣✅]+\s*/gm, '').trim();
}

export function BrandBriefView({ clientId, onEditBrief }: BrandBriefViewProps) {
  const { user } = useAuth();
  const [briefData, setBriefData] = useState<BriefData | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [research, setResearch] = useState<ResearchData>({});
  const [clientInfo, setClientInfo] = useState<{ name?: string; company?: string; logo_url?: string; website_url?: string } | null>(null);
  const [assets, setAssets] = useState<{ logo: string[]; products: string[]; ads: string[] }>({ logo: [], products: [], ads: [] });

  useEffect(() => {
    fetchAll();
  }, [clientId]);

  async function fetchAll() {
    setLoading(true);
    try {
      await Promise.all([fetchBrief(), fetchResearch(), fetchClientInfo(), fetchAssets()]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchBrief() {
    const { data } = await supabase
      .from('buyer_personas')
      .select('persona_data, is_complete')
      .eq('client_id', clientId)
      .maybeSingle();
    if (data) {
      setBriefData(data.persona_data as BriefData);
      setIsComplete(data.is_complete);
    }
  }

  async function fetchResearch() {
    const { data } = await supabase
      .from('brand_research')
      .select('research_type, research_data')
      .eq('client_id', clientId);
    if (data) {
      const r: ResearchData = {};
      for (const row of data) {
        (r as any)[row.research_type] = row.research_data;
      }
      setResearch(r);
    }
  }

  async function fetchClientInfo() {
    const { data } = await supabase
      .from('clients')
      .select('name, company, logo_url, website_url')
      .eq('id', clientId)
      .single();
    if (data) setClientInfo(data);
  }

  async function fetchAssets() {
    if (!user) return;
    const loaded: typeof assets = { logo: [], products: [], ads: [] };
    for (const cat of ['logo', 'products', 'ads'] as const) {
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
  }

  // Get persona data for the buyer persona card
  const personaResponse = briefData?.questions && briefData?.raw_responses
    ? briefData.raw_responses[briefData.questions.indexOf('persona_profile')] || ''
    : '';
  const personaProfile = parsePersonaProfile(personaResponse);
  const personaGender = detectGender(personaProfile);
  const personaImage = personaGender === 'female' ? personaFemale : personaMale;

  function getResponse(questionId: string): string {
    if (!briefData?.questions || !briefData?.raw_responses) return '';
    const idx = briefData.questions.indexOf(questionId);
    return idx >= 0 ? briefData.raw_responses[idx] || '' : '';
  }

  async function loadImageAsBase64(src: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no ctx')); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg'));
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  async function handleDownloadPDF() {
    if (!briefData) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 18;
    const maxWidth = pageWidth - margin * 2;
    let y = 15;

    const brandR = 30, brandG = 58, brandB = 138;
    const accentR = 79, accentG = 70, accentB = 229;

    // Helper functions
    const checkPage = (needed: number) => { if (y + needed > pageHeight - 25) { doc.addPage(); y = 20; } };

    const addSectionHeader = (num: string, title: string) => {
      checkPage(18);
      y += 4;
      doc.setFillColor(brandR, brandG, brandB);
      doc.roundedRect(margin, y, maxWidth, 10, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text(`${num}. ${title}`, margin + 4, y + 7);
      doc.setTextColor(0, 0, 0);
      y += 15;
    };

    const addSubTitle = (title: string) => {
      checkPage(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(accentR, accentG, accentB);
      doc.text(title, margin + 2, y);
      doc.setTextColor(0, 0, 0);
      y += 5;
    };

    const addBody = (text: string, indent = 0) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      const clean = text.replace(/#{1,4}\s*/g, '').replace(/\*\*/g, '').replace(/\*/g, '')
        .replace(/🐕|🎓|📋|💰|📊|🚀|😤|🎯|💜|🐄|👻|📸|🏆|✅|⚠️|❌|💼|🎂|👤|⚧|📍|💍|🌐|📦|🚚|📣|🛒|🏪|🏬|📱|👥|1️⃣|2️⃣|3️⃣/g, '');
      const lines = doc.splitTextToSize(clean, maxWidth - indent - 4);
      for (const line of lines) {
        checkPage(5);
        doc.text(line, margin + indent + 2, y);
        y += 4.2;
      }
      y += 2;
    };

    const addKeyValue = (label: string, value: string) => {
      checkPage(7);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      doc.text(`${label}:`, margin + 4, y);
      const labelWidth = doc.getTextWidth(`${label}: `);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      const valLines = doc.splitTextToSize(value, maxWidth - labelWidth - 8);
      doc.text(valLines[0], margin + 4 + labelWidth, y);
      y += 4.5;
      for (let i = 1; i < valLines.length; i++) {
        checkPage(5);
        doc.text(valLines[i], margin + 4 + labelWidth, y);
        y += 4.2;
      }
    };

    // === COVER / HEADER ===
    // Top bar
    doc.setFillColor(brandR, brandG, brandB);
    doc.rect(0, 0, pageWidth, 3, 'F');

    // Logo
    try {
      const logoSrc = clientInfo?.logo_url || assets.logo[0] || logo;
      const logoBase64 = await loadImageAsBase64(logoSrc);
      doc.addImage(logoBase64, 'JPEG', margin, y + 2, 28, 11);
    } catch {}
    
    // Date right-aligned
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' }), pageWidth - margin, y + 8, { align: 'right' });
    y += 18;

    // Title block
    doc.setFillColor(brandR, brandG, brandB);
    doc.roundedRect(margin, y, maxWidth, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('BRIEF ESTRATÉGICO DE MARCA', pageWidth / 2, y + 10.5, { align: 'center' });
    y += 22;

    // Client info
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(brandR, brandG, brandB);
    doc.text(`${clientInfo?.name || 'Cliente'}${clientInfo?.company ? ` — ${clientInfo.company}` : ''}`, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Preparado por: Dr. Steve Dogs, PhD Performance Marketing | BG Consult', margin, y);
    y += 3;
    doc.setDrawColor(brandR, brandG, brandB);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    const questions = briefData.questions || [];
    const responses = briefData.raw_responses || [];

    // === 1. RESUMEN EJECUTIVO ===
    if (briefData.summary) {
      addSectionHeader('1', 'RESUMEN EJECUTIVO');
      // Strip informal preamble before first ## header
      let cleanSummary = briefData.summary;
      const firstHeader = cleanSummary.indexOf('## ');
      if (firstHeader > 0) cleanSummary = cleanSummary.slice(firstHeader);
      cleanSummary = cleanSummary
        .replace(/#{1,4}\s+/g, '\n')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '');
      // Split into sections and render cleanly
      const sections = cleanSummary.split(/\n+/).filter(p => p.trim());
      for (const section of sections.slice(0, 40)) {
        const trimmed = section.trim();
        if (!trimmed) continue;
        // Skip table separator lines
        if (trimmed.match(/^\|[\s-:]+\|/)) continue;
        // Detect if it's a section header
        if (trimmed.match(/^\d+\.\s+[A-ZÁÉÍÓÚ]/) || trimmed.match(/^[A-ZÁÉÍÓÚ\s]{5,}$/)) {
          addSubTitle(trimmed);
        } else if (trimmed.startsWith('|')) {
          // Table rows — format as clean key-value
          const cells = trimmed.split('|').filter(c => c.trim() && !c.match(/^[-:\s]+$/));
          if (cells.length >= 2) {
            addKeyValue(cells[0].trim(), cells[1].trim());
          }
        } else {
          addBody(trimmed);
        }
      }
    }

    // === 2. ADN DE MARCA ===
    addSectionHeader('2', 'ADN DE MARCA');
    const q1 = getResponse('business_pitch');
    if (q1) { addSubTitle('Descripción del Negocio'); addBody(q1); }
    
    const q2 = getResponse('numbers');
    if (q2) {
      addSubTitle('Indicadores Financieros Clave');
      // Parse and display as clean key-value pairs
      const nums = q2.split('\n').filter(l => l.trim());
      for (const line of nums) {
        const clean = line.replace(/^[💰📦🚚📣📊]+\s*/, '');
        const kv = clean.match(/^(.+?):\s*(.+)$/);
        if (kv) {
          addKeyValue(kv[1].trim(), kv[2].trim());
        } else {
          addBody(clean);
        }
      }
    }

    const q3 = getResponse('sales_channels');
    if (q3) {
      addSubTitle('Distribución por Canales de Venta');
      const channels = q3.split('\n').filter(l => l.trim());
      for (const ch of channels) {
        const clean = ch.replace(/^[🛒🏪🏬📱📸👥]+\s*/, '');
        addBody(`• ${clean}`, 2);
      }
    }

    // === 3. BUYER PERSONA ===
    addSectionHeader('3', 'PERFIL DEL CONSUMIDOR OBJETIVO');
    
    // Persona image
    try {
      const pImg = await loadImageAsBase64(personaImage);
      checkPage(35);
      doc.addImage(pImg, 'JPEG', margin + 2, y, 22, 22);
      const profileName = personaProfile['nombre ficticio'] || personaProfile['nombre'] || 'Cliente Ideal';
      const profileAge = personaProfile['edad'] || '';
      const profileGender = personaProfile['género'] || personaProfile['genero'] || '';
      const profileCity = personaProfile['ciudad / zona'] || personaProfile['ciudad'] || '';
      const profileOcc = personaProfile['ocupación'] || personaProfile['ocupacion'] || '';
      const profileIncome = personaProfile['ingreso mensual aprox.'] || personaProfile['ingreso'] || '';
      const profileFamily = personaProfile['estado civil / familia'] || personaProfile['familia'] || '';
      const profileWhy = personaProfile['¿por qué te compra?'] || personaProfile['por qué te compra'] || '';
      
      let px = margin + 28;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(brandR, brandG, brandB);
      doc.text(profileName, px, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
      let py = y + 10;
      if (profileAge) { doc.text(`${profileAge} años • ${profileGender} • ${profileCity}`, px, py); py += 4; }
      if (profileOcc) { doc.text(`Ocupación: ${profileOcc}`, px, py); py += 4; }
      if (profileIncome) { doc.text(`Ingreso mensual: ${formatCurrency(profileIncome)}`, px, py); py += 4; }
      if (profileFamily) { doc.text(`${profileFamily}`, px, py); py += 4; }
      if (profileWhy) { doc.text(`Motivación: ${profileWhy}`, px, py); py += 4; }
      
      y = Math.max(y + 25, py + 2);
    } catch {
      // Fallback: text-only persona
      const q4 = getResponse('persona_profile');
      if (q4) addBody(q4);
    }

    const painResp = getResponse('persona_pain');
    if (painResp) { addSubTitle('Dolor Principal'); addBody(painResp); }
    const wordsResp = getResponse('persona_words');
    if (wordsResp) { addSubTitle('Palabras y Objeciones del Cliente'); addBody(`"${wordsResp}"`); }
    const transResp = getResponse('persona_transformation');
    if (transResp) { addSubTitle('Transformación Deseada'); addBody(transResp); }
    const lifeResp = getResponse('persona_lifestyle');
    if (lifeResp) { addSubTitle('Estilo de Vida y Consumo'); addBody(lifeResp); }

    // === 4. ANÁLISIS COMPETITIVO ===
    addSectionHeader('4', 'ANÁLISIS COMPETITIVO ESTRATÉGICO');
    const compResp = getResponse('competitors');
    if (compResp) { addSubTitle('Competidores Identificados'); addBody(compResp); }
    const compWeakResp = getResponse('competitors_weakness');
    if (compWeakResp) { addSubTitle('Análisis de Promesas y Debilidades'); addBody(compWeakResp); }
    const advResp = getResponse('your_advantage');
    if (advResp) { addSubTitle('Ventaja Competitiva Sostenible'); addBody(advResp); }

    // === 5. POSICIONAMIENTO ===
    addSectionHeader('5', 'POSICIONAMIENTO Y DIFERENCIACIÓN');
    const cowResp = getResponse('purple_cow_promise');
    if (cowResp) { addSubTitle('Concepto Diferenciador (Vaca Púrpura)'); addBody(cowResp); }
    const villResp = getResponse('villain_guarantee');
    if (villResp) { addSubTitle('Narrativa de Marca y Garantía'); addBody(villResp); }
    const proofResp = getResponse('proof_tone');
    if (proofResp) { addSubTitle('Prueba Social y Tono de Comunicación'); addBody(proofResp); }
    const assetsResp = getResponse('brand_assets');
    if (assetsResp) { addSubTitle('Identidad Visual'); addBody(assetsResp); }

    // === 6. EVALUACIÓN ESTRATÉGICA ===
    if (briefData.summary) {
      addSectionHeader('6', 'EVALUACIÓN ESTRATÉGICA Y PLAN DE ACCIÓN');
      // Strip preamble and already-rendered sections (1-5)
      let planText = briefData.summary;
      const firstHeader = planText.indexOf('## ');
      if (firstHeader > 0) planText = planText.slice(firstHeader);
      // Find section 6 or 7 to start from
      const section6Match = planText.match(/##\s*6\./);
      if (section6Match && section6Match.index !== undefined) {
        planText = planText.slice(section6Match.index);
      }
      const planLines = planText.split('\n').filter(l => l.trim());
      for (const line of planLines) {
        const trimmed = line.trim()
          .replace(/^#+\s*/, '')
          .replace(/\*\*/g, '');
        if (!trimmed) continue;
        // Skip table separator lines
        if (trimmed.match(/^\|[\s-:]+\|$/)) continue;
        if (trimmed.match(/^\d+\.\s/) || trimmed.match(/^(Fase|KPI|Riesgo|Meta|Plazo)/i)) {
          addSubTitle(trimmed);
        } else if (trimmed.startsWith('|')) {
          const cells = trimmed.split('|').filter(c => c.trim() && !c.match(/^[-:\s]+$/));
          if (cells.length >= 2) {
            addKeyValue(cells[0].trim(), cells.slice(1).map(c => c.trim()).join(' — '));
          }
        } else if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
          addBody(trimmed, 4);
        } else {
          addBody(trimmed);
        }
      }
    }

    // === SIGNATURE ===
    checkPage(45);
    y += 6;
    doc.setDrawColor(brandR, brandG, brandB);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    try {
      const sigBase64 = await loadImageAsBase64(steveSignature);
      doc.addImage(sigBase64, 'PNG', margin, y, 35, 14);
      y += 17;
    } catch {
      y += 3;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(brandR, brandG, brandB);
    doc.text('Dr. Steve Dogs', margin, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('PhD Performance Marketing — Stanford Dog University', margin, y); y += 3.5;
    doc.text('Director de Estrategia, BG Consult', margin, y); y += 3.5;
    doc.text(`Firmado digitalmente: ${new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y);

    // Footer on all pages
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFillColor(brandR, brandG, brandB);
      doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(`BG Consult — Brief Estratégico de Marca | Confidencial | Pág ${i}/${pageCount}`, pageWidth / 2, pageHeight - 4, { align: 'center' });
      // Top accent bar
      doc.setFillColor(brandR, brandG, brandB);
      doc.rect(0, 0, pageWidth, 2, 'F');
    }

    doc.save(`Brief_Estrategico_${clientInfo?.name || 'Marca'}_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF descargado con éxito');
  }

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }

  const questions = briefData?.questions || [];
  const responses = briefData?.raw_responses || [];
  const answeredCount = briefData?.answered_count || responses.length;
  const totalQuestions = briefData?.total_questions || 15;
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100);
  const hasResearch = Object.keys(research).length > 0;

  return (
    <div className="space-y-6">
      {/* Header with logo */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          {(clientInfo?.logo_url || assets.logo[0]) && (
            <img
              src={clientInfo?.logo_url || assets.logo[0]}
              alt="Logo"
              className="h-14 w-14 object-contain rounded-xl border border-border bg-card p-1"
            />
          )}
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Brief Estratégico
            </h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              {clientInfo?.name}{clientInfo?.company ? ` — ${clientInfo.company}` : ''}
              {briefData?.completed_at && ` • ${new Date(briefData.completed_at).toLocaleDateString('es-CL')}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isComplete && (
            <Button onClick={handleDownloadPDF}>
              <Download className="h-4 w-4 mr-2" />
              Descargar PDF
            </Button>
          )}
          <Button variant="outline" onClick={onEditBrief}>
            <MessageSquare className="h-4 w-4 mr-2" />
            {isComplete ? 'Editar con Steve' : 'Hablar con Steve'}
          </Button>
        </div>
      </div>

      {/* Progress bar for in-progress */}
      {!isComplete && answeredCount > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Progreso del Brief</span>
              <span className="font-semibold">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-3 mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SECTIONS.map(section => {
                const sectionQs = questions
                  .map((qId, i) => ({ qId, answered: !!responses[i], config: QUESTION_CONFIG[qId] }))
                  .filter(q => q.config?.section === section.id);
                const done = sectionQs.filter(q => q.answered).length;
                const total = Object.values(QUESTION_CONFIG).filter(c => c.section === section.id).length;
                return (
                  <div key={section.id} className="bg-muted/50 rounded-lg p-3 text-center">
                    <section.icon className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <p className="text-xs font-medium">{section.title}</p>
                    <p className="text-xs text-muted-foreground">{done}/{total}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No brief at all */}
      {(!briefData || answeredCount === 0) && !isComplete && (
        <Card className="text-center py-12">
          <CardContent>
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Sin Brief de Marca</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Habla con Steve para crear tu Brief Estratégico en solo 15 preguntas.
            </p>
            <Button onClick={onEditBrief}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Hablar con Steve
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs for complete brief */}
      {(isComplete || answeredCount > 0) && (
        <Tabs defaultValue="brief" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-5">
            <TabsTrigger value="brief" className="text-xs">📋 Brief</TabsTrigger>
            <TabsTrigger value="assets" className="text-xs">📸 Assets</TabsTrigger>
            <TabsTrigger value="research" className="text-xs">🔍 Investigación</TabsTrigger>
            <TabsTrigger value="seo" className="text-xs">📊 SEO</TabsTrigger>
            <TabsTrigger value="keywords" className="text-xs hidden lg:block">🔑 Keywords</TabsTrigger>
          </TabsList>

          {/* Brief Tab */}
          <TabsContent value="brief" className="space-y-6">
            {isComplete && (
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="default" className="bg-primary">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Brief Completo
                </Badge>
                <Badge variant="secondary">{responses.length} respuestas</Badge>
              </div>
            )}

            {/* BUYER PERSONA CARD */}
            {personaResponse && (
              <Card className="overflow-hidden border-2 border-primary/10">
                <CardHeader className="bg-primary/5 pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Buyer Persona
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid md:grid-cols-[200px_1fr] gap-6">
                    {/* Photo + basic info */}
                    <div className="text-center">
                      <img 
                        src={personaImage} 
                        alt="Buyer Persona"
                        className="w-36 h-36 object-cover rounded-xl mx-auto mb-3 shadow-md border-2 border-primary/10"
                        onError={(e) => {
                          // Fallback if image fails
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <h3 className="font-bold text-lg">{personaProfile['nombre ficticio'] || personaProfile['nombre'] || 'Cliente Ideal'}</h3>
                      <p className="text-sm text-muted-foreground">{personaProfile['edad'] ? `${personaProfile['edad']} años` : ''}</p>
                      {(personaProfile['ciudad / zona'] || personaProfile['ciudad']) && (
                        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {personaProfile['ciudad / zona'] || personaProfile['ciudad']}
                        </p>
                      )}
                      {(personaProfile['ocupación'] || personaProfile['ocupacion']) && (
                        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                          <Briefcase className="h-3 w-3" />
                          {personaProfile['ocupación'] || personaProfile['ocupacion']}
                        </p>
                      )}
                      {(personaProfile['estado civil / familia'] || personaProfile['familia']) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {personaProfile['estado civil / familia'] || personaProfile['familia']}
                        </p>
                      )}
                      {(personaProfile['ingreso mensual aprox.'] || personaProfile['ingreso']) && (
                        <p className="text-xs font-medium text-primary mt-1">
                          {formatCurrency(personaProfile['ingreso mensual aprox.'] || personaProfile['ingreso'] || '')}
                        </p>
                      )}
                    </div>

                    {/* Persona details grid */}
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                          <Heart className="h-3 w-3" /> Dolor Principal
                        </p>
                        <p className="text-sm">{getResponse('persona_pain') || 'Pendiente'}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> Lo que Dice
                        </p>
                        <p className="text-sm italic">"{getResponse('persona_words') || 'Pendiente'}"</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" /> Transformación
                        </p>
                        <p className="text-sm">{getResponse('persona_transformation') || 'Pendiente'}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                          <Gem className="h-3 w-3" /> Estilo de Vida
                        </p>
                        <p className="text-sm">{getResponse('persona_lifestyle') || 'Pendiente'}</p>
                      </div>
                      {(personaProfile['¿por qué te compra?'] || personaProfile['por qué te compra']) && (
                        <div className="bg-primary/5 rounded-lg p-3 sm:col-span-2 border border-primary/10">
                          <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                            <Target className="h-3 w-3" /> ¿Por qué Compra?
                          </p>
                          <p className="text-sm font-medium">{personaProfile['¿por qué te compra?'] || personaProfile['por qué te compra']}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Section Cards — excluding persona (shown above) */}
            <div className="grid gap-4 lg:grid-cols-2">
              {SECTIONS.map(section => {
                const sectionQs = questions
                  .map((qId, i) => ({ qId, response: responses[i], config: QUESTION_CONFIG[qId] }))
                  .filter(q => q.config?.section === section.id);
                if (sectionQs.length === 0) return null;
                if (section.id === 'persona') return null;
                return (
                  <Card key={section.id}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <section.icon className="h-5 w-5 text-primary" />
                        {section.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {sectionQs.map(q => (
                          <div key={q.qId} className="border-b border-border pb-3 last:border-0">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1.5">
                              {q.config?.icon}
                              {q.config?.label}
                              {q.response && <CheckCircle2 className="h-3 w-3 text-green-500 ml-auto" />}
                            </div>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.response || <span className="text-muted-foreground italic">Pendiente</span>}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Product Photos in Brief */}
            {assets.products.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Image className="h-5 w-5 text-primary" />
                    Productos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {assets.products.map((url, i) => (
                      <img key={i} src={url} alt={`Producto ${i + 1}`} className="w-full aspect-square object-cover rounded-lg border border-border" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Steve's Strategic Summary — full-width, properly formatted */}
            {briefData?.summary && isComplete && (
              <Card className="border-primary/20 border-2">
                <CardHeader className="pb-3 bg-primary/5">
                  <div className="flex items-center gap-3">
                    <img src={avatarSteve} alt="Steve" className="h-12 w-12 rounded-full border-2 border-primary/20 shadow-md" />
                    <div>
                      <CardTitle className="text-lg">Evaluación Estratégica</CardTitle>
                      <CardDescription className="text-xs">Dr. Steve Dogs — PhD Performance Marketing, Stanford</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed [&>h1]:text-lg [&>h1]:font-bold [&>h1]:text-primary [&>h1]:mt-6 [&>h1]:mb-3 [&>h2]:text-base [&>h2]:font-bold [&>h2]:text-primary [&>h2]:mt-5 [&>h2]:mb-2 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:text-primary/80 [&>h3]:mt-4 [&>h3]:mb-2 [&>p]:mb-3 [&>table]:text-sm [&>table]:w-full [&_th]:bg-primary/10 [&_th]:text-left [&_th]:p-2 [&_td]:p-2 [&_td]:border-b [&_td]:border-border [&>ul]:my-2 [&>ol]:my-2 [&>ul>li]:mb-1 [&>ol>li]:mb-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{
                      // Strip any informal preamble before the first ## header
                      (() => {
                        const raw = briefData.summary || '';
                        const firstHeader = raw.indexOf('## ');
                        return firstHeader > 0 ? raw.slice(firstHeader) : raw;
                      })()
                    }</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Signature */}
            {isComplete && (
              <Card className="bg-muted/30">
                <CardContent className="pt-6 pb-4 text-center">
                  <img src={steveSignature} alt="Firma Steve Dogs" className="h-16 mx-auto mb-2 opacity-80" />
                  <img src={avatarSteve} alt="Steve Dogs" className="h-14 w-14 rounded-full mx-auto mb-2 border-2 border-primary shadow-lg" />
                  <p className="text-lg font-bold text-primary">Dr. Steve Dogs</p>
                  <p className="text-xs text-muted-foreground">PhD Performance Marketing — Stanford Dog University</p>
                  <p className="text-xs text-muted-foreground">Director de Estrategia, BG Consult</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Firmado: {new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Assets Tab */}
          <TabsContent value="assets">
            <BrandAssetUploader clientId={clientId} onResearchComplete={fetchAll} />
            {assets.products.length > 0 && (
              <Card className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Image className="h-5 w-5 text-primary" />
                    Galería de Productos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {assets.products.map((url, i) => (
                      <img key={i} src={url} alt={`Producto ${i + 1}`} className="w-full h-32 object-cover rounded-lg border border-border" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {assets.ads.length > 0 && (
              <Card className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-primary" />
                    Creativos de Anuncios
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {assets.ads.map((url, i) => (
                      <img key={i} src={url} alt={`Ad ${i + 1}`} className="w-full h-40 object-cover rounded-lg border border-border" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Research Tab */}
          <TabsContent value="research" className="space-y-4">
            {!hasResearch ? (
              <Card className="text-center py-10">
                <CardContent>
                  <Search className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-2">Sin Investigación</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Ve a la pestaña <strong>Assets</strong> e ingresa tu URL y competidores para que Steve los analice.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {research.competitor_analysis?.competitors && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-primary" />
                        Análisis de Competencia
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {research.competitor_analysis.competitors.map((comp: any, i: number) => (
                          <div key={i} className="bg-muted/50 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">{i + 1}</Badge>
                              <h4 className="font-semibold text-sm">{comp.name || comp.url}</h4>
                            </div>
                            {comp.positioning && <p className="text-xs text-muted-foreground mb-2">{comp.positioning}</p>}
                            <div className="grid grid-cols-2 gap-3 mt-2">
                              <div>
                                <p className="text-xs font-medium text-green-600 flex items-center gap-1 mb-1"><TrendingUp className="h-3 w-3" /> Fortalezas</p>
                                <ul className="text-xs space-y-0.5">{comp.strengths?.map((s: string, j: number) => <li key={j} className="text-muted-foreground">• {s}</li>)}</ul>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-red-500 flex items-center gap-1 mb-1"><TrendingDown className="h-3 w-3" /> Debilidades</p>
                                <ul className="text-xs space-y-0.5">{comp.weaknesses?.map((w: string, j: number) => <li key={j} className="text-muted-foreground">• {w}</li>)}</ul>
                              </div>
                            </div>
                          </div>
                        ))}
                        {research.competitor_analysis.market_gaps?.length > 0 && (
                          <div className="bg-primary/5 rounded-lg p-4 mt-3">
                            <p className="text-sm font-medium flex items-center gap-2 mb-2"><Lightbulb className="h-4 w-4 text-primary" /> Oportunidades de Mercado</p>
                            <ul className="text-sm space-y-1">{research.competitor_analysis.market_gaps.map((gap: string, i: number) => <li key={i}>• {gap}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {research.ads_library_analysis && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /> Análisis de Ads Library</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {research.ads_library_analysis.winning_patterns?.length > 0 && (
                        <div><p className="text-xs font-medium mb-1">🏆 Patrones Ganadores</p><ul className="text-sm space-y-1">{research.ads_library_analysis.winning_patterns.map((p: string, i: number) => <li key={i}>• {p}</li>)}</ul></div>
                      )}
                      {research.ads_library_analysis.creative_recommendations?.length > 0 && (
                        <div><p className="text-xs font-medium mb-1">💡 Recomendaciones</p><ul className="text-sm space-y-1">{research.ads_library_analysis.creative_recommendations.map((r: string, i: number) => <li key={i}>• {r}</li>)}</ul></div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* SEO Tab */}
          <TabsContent value="seo" className="space-y-4">
            {!research.seo_audit ? (
              <Card className="text-center py-10">
                <CardContent>
                  <Globe className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-2">Sin Auditoría SEO</h3>
                  <p className="text-sm text-muted-foreground">Ingresa tu URL en Assets para generar el análisis.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold">Score SEO</h3>
                        <p className="text-xs text-muted-foreground">{clientInfo?.website_url}</p>
                      </div>
                      <div className={`text-4xl font-bold ${
                        (research.seo_audit.score || 0) >= 70 ? 'text-green-500' :
                        (research.seo_audit.score || 0) >= 40 ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {research.seo_audit.score || '?'}<span className="text-lg text-muted-foreground">/100</span>
                      </div>
                    </div>
                    <Progress value={research.seo_audit.score || 0} className="h-3" />
                  </CardContent>
                </Card>
                <div className="grid gap-4 md:grid-cols-2">
                  {research.seo_audit.issues?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-red-500"><AlertTriangle className="h-4 w-4" /> Problemas</CardTitle></CardHeader>
                      <CardContent><ul className="text-sm space-y-1.5">{research.seo_audit.issues.map((issue: string, i: number) => <li key={i} className="flex items-start gap-2"><span className="text-red-400 mt-0.5">⚠️</span><span>{issue}</span></li>)}</ul></CardContent>
                    </Card>
                  )}
                  {research.seo_audit.recommendations?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-green-600"><Lightbulb className="h-4 w-4" /> Recomendaciones</CardTitle></CardHeader>
                      <CardContent><ul className="text-sm space-y-1.5">{research.seo_audit.recommendations.map((rec: string, i: number) => <li key={i} className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✅</span><span>{rec}</span></li>)}</ul></CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* Keywords Tab */}
          <TabsContent value="keywords" className="space-y-4">
            {!research.keywords ? (
              <Card className="text-center py-10">
                <CardContent>
                  <Key className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-2">Sin Análisis de Keywords</h3>
                  <p className="text-sm text-muted-foreground">Ejecuta el análisis desde Assets para ver keywords.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {research.keywords.primary?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Keywords Principales</CardTitle></CardHeader>
                    <CardContent><div className="flex flex-wrap gap-1.5">{research.keywords.primary.map((kw: string, i: number) => <Badge key={i} variant="default" className="text-xs">{kw}</Badge>)}</div></CardContent>
                  </Card>
                )}
                {research.keywords.long_tail?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Search className="h-4 w-4 text-primary" /> Long-tail</CardTitle></CardHeader>
                    <CardContent><div className="flex flex-wrap gap-1.5">{research.keywords.long_tail.map((kw: string, i: number) => <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>)}</div></CardContent>
                  </Card>
                )}
                {research.keywords.recommended_strategy && (
                  <Card className="md:col-span-2 bg-primary/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Estrategia Recomendada</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{research.keywords.recommended_strategy}</p></CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
