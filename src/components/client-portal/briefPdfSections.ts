import jsPDF from 'jspdf';

// ─── TYPES ──────────────────────────────────────────────────────────────────
export interface PdfContext {
  doc: jsPDF;
  y: number;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  maxWidth: number;
  brandR: number; brandG: number; brandB: number;
  accentR: number; accentG: number; accentB: number;
  lightGray: [number, number, number];
}

export type PdfHelpers = {
  checkPage: (needed: number) => void;
  addWatermark: () => void;
  addBody: (text: string, indent?: number, lineH?: number) => void;
  addSubTitle: (title: string) => void;
  addSectionHeader: (num: string, title: string) => void;
  addInsightBox: (text: string) => void;
  addKeyValue: (label: string, value: string) => void;
  addArrowBullet: (text: string, indent?: number) => void;
  addTableRow: (cells: string[], colWidths: number[], rowIdx: number, header?: boolean) => void;
  stripEmojis: (text: string) => string;
  getY: () => number;
  setY: (val: number) => void;
};

// ─── GLOSSARY DATA ──────────────────────────────────────────────────────────
export const GLOSSARIES: Record<string, { term: string; def: string }[]> = {
  seo: [
    { term: 'H1', def: 'El titulo principal de una pagina web. Solo debe haber uno por pagina y debe describir claramente de que trata.' },
    { term: 'Meta Description', def: 'El texto de 160 caracteres que aparece debajo del titulo en Google. Convence al usuario de hacer clic.' },
    { term: 'Schema Markup', def: 'Codigo invisible que ayuda a Google a entender tu pagina (precios, reviews, productos). Mejora como apareces en resultados.' },
    { term: 'CTR', def: 'Click-Through Rate. De cada 100 personas que ven tu resultado en Google, cuantas hacen clic. Arriba de 3% es bueno.' },
    { term: 'Backlinks', def: 'Enlaces de otros sitios web hacia el tuyo. Son como "votos de confianza" que Google valora para posicionarte.' },
    { term: 'Domain Authority', def: 'Puntaje de 0-100 que mide la autoridad de tu dominio. Mientras mas alto, mas facil posicionar contenido.' },
  ],
  keywords: [
    { term: 'Long-tail', def: 'Keywords de 3+ palabras, muy especificas ("curso ecommerce chile garantia"). Menos busquedas pero mas conversion.' },
    { term: 'Keyword Difficulty', def: 'Que tan dificil es posicionar en la primera pagina de Google para esa palabra. De 0 (facil) a 100 (casi imposible).' },
    { term: 'Concordancia Exacta', def: 'En Google Ads, tu anuncio solo aparece cuando buscan exactamente esa frase. Menos trafico, pero mas relevante.' },
    { term: 'Concordancia de Frase', def: 'Tu anuncio aparece cuando la busqueda contiene tu frase en orden. Balance entre volumen y precision.' },
    { term: 'CPA', def: 'Costo Por Adquisicion. Cuanto gastas en promedio para conseguir una venta. Debe ser menor que tu margen.' },
    { term: 'Search Volume', def: 'Cuantas veces al mes la gente busca esa keyword en Google. Mayor volumen = mas potencial de trafico.' },
  ],
  meta_ads: [
    { term: 'CBO', def: 'Campaign Budget Optimization. Meta distribuye tu presupuesto automaticamente entre los Ad Sets que mejor funcionan.' },
    { term: 'Lookalike', def: 'Audiencia creada por Meta de personas similares a tus clientes actuales. Escala 1% (muy similar) a 10% (amplia).' },
    { term: 'Retargeting', def: 'Mostrar anuncios a personas que ya visitaron tu sitio o interactuaron con tu marca. Alta tasa de conversion.' },
    { term: 'ROAS', def: 'Return On Ad Spend. Si gastas $100 y vendes $300, tu ROAS es 3x. Minimo viable: 2x-3x.' },
    { term: 'CPM', def: 'Costo Por Mil impresiones. Cuanto pagas por que 1,000 personas vean tu anuncio. Promedio: $5-15 USD.' },
    { term: 'CPC', def: 'Costo Por Clic. Cuanto pagas cada vez que alguien hace clic en tu anuncio. Menor es mejor.' },
    { term: 'Ad Set', def: 'Conjunto de anuncios con la misma audiencia, ubicacion y presupuesto. Donde defines a QUIEN le muestras.' },
    { term: 'Pixel', def: 'Codigo en tu sitio que rastrea visitantes y conversiones para que Meta optimice tus campanas.' },
  ],
  google_ads: [
    { term: 'Performance Max', def: 'Campana automatizada de Google que muestra anuncios en Search, YouTube, Display, Gmail y Maps simultaneamente.' },
    { term: 'Quality Score', def: 'Puntaje 1-10 que Google asigna a tus keywords. Mayor score = menor costo por clic y mejor posicion.' },
    { term: 'Concordancia Exacta', def: 'Tu anuncio solo aparece cuando buscan exactamente tu keyword. Maximo control, menor volumen.' },
    { term: 'Extensiones', def: 'Informacion adicional en tu anuncio (telefono, ubicacion, links). Aumentan CTR hasta 15% sin costo extra.' },
    { term: 'Search Campaign', def: 'Anuncios de texto que aparecen en resultados de Google cuando alguien busca tus keywords.' },
    { term: 'Shopping Campaign', def: 'Anuncios con foto y precio del producto que aparecen en Google Shopping y resultados de busqueda.' },
    { term: 'Bidding Strategy', def: 'Como Google maneja tu presupuesto: Maximize Conversions (mas ventas), Target ROAS (objetivo de rentabilidad).' },
  ],
  ads_library: [
    { term: 'UGC', def: 'User-Generated Content. Videos o fotos hechas por clientes reales o creators, no por la marca. Mayor confianza.' },
    { term: 'Hook', def: 'Los primeros 3 segundos de un video que capturan atencion. Si el hook falla, nadie ve el anuncio.' },
    { term: 'CTA', def: 'Call To Action. La accion que quieres que haga el usuario: "Compra ahora", "Agenda tu demo", "Descarga gratis".' },
    { term: 'Carrusel', def: 'Formato de anuncio con multiples imagenes/videos que el usuario desliza. Ideal para mostrar productos o testimonios.' },
    { term: 'A/B Testing', def: 'Probar dos versiones de un anuncio para ver cual funciona mejor. Cambiar UNA variable a la vez.' },
    { term: 'Creative Fatigue', def: 'Cuando una audiencia ve tu anuncio tantas veces que deja de funcionar. Renovar creativos cada 2-3 semanas.' },
  ],
  competitive: [
    { term: 'Benchmarking', def: 'Comparar tus metricas contra las de tus competidores para entender donde estas bien y donde mejorar.' },
    { term: 'Diferenciador', def: 'Lo que te hace unico frente a la competencia. Debe ser valioso para el cliente y dificil de copiar.' },
    { term: 'Market Gap', def: 'Una necesidad del mercado que nadie esta cubriendo bien. Oportunidad de posicionarte sin competencia directa.' },
    { term: 'Threat Level', def: 'Que tan peligroso es un competidor para tu negocio: alto (competidor directo), medio (parcial), bajo (indirecto).' },
  ],
  positioning: [
    { term: 'Positioning Statement', def: 'Frase que define para quien es tu marca, que ofreces y por que eres diferente. La base de toda comunicacion.' },
    { term: 'Territorio de Comunicacion', def: 'Un tema o valor que tu marca "posee" en la mente del consumidor. Ej: Apple = Simplicidad.' },
    { term: 'Mapa Perceptual', def: 'Grafico que muestra donde esta tu marca vs competidores segun dos ejes (ej: precio vs calidad).' },
    { term: 'Propuesta de Valor', def: 'La promesa principal que haces al cliente. Responde: por que deberia comprarte a ti y no a otro?' },
  ],
};

// ─── GLOSSARY BOX RENDERER ──────────────────────────────────────────────────
export function renderGlossaryBox(
  ctx: PdfContext,
  helpers: PdfHelpers,
  sectionKey: string
) {
  const items = GLOSSARIES[sectionKey];
  if (!items || items.length === 0) return;

  const { doc, margin, maxWidth, pageHeight } = ctx;
  let y = helpers.getY();

  y += 6;

  // Render each term as a flowing block — no fixed-height box
  // Title bar
  helpers.checkPage(14);
  y = helpers.getY();
  doc.setFillColor(240, 241, 248);
  doc.roundedRect(margin, y, maxWidth, 9, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 100);
  doc.text('GLOSARIO', margin + 5, y + 6.2);
  y += 12;
  helpers.setY(y);

  for (let i = 0; i < items.length; i++) {
    // Measure definition lines for block height
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const defLines = doc.splitTextToSize(items[i].def, maxWidth - 12);
    const blockH = 4.5 + defLines.length * 4 + 2;
    helpers.checkPage(blockH + 2);
    y = helpers.getY();

    // Alternating subtle background
    if (i % 2 === 0) {
      doc.setFillColor(248, 249, 253);
      doc.rect(margin, y - 1.5, maxWidth, blockH, 'F');
    }

    // Term in bold on its own
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 70);
    doc.text(items[i].term, margin + 5, y);
    y += 4.5;

    // Definition in normal weight, wrapped
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(70, 70, 80);
    for (let li = 0; li < defLines.length; li++) {
      helpers.checkPage(5);
      y = helpers.getY();
      doc.text(defLines[li], margin + 5, y);
      y += 4;
    }
    y += 1;
    helpers.setY(y);
  }

  // Bottom border
  y = helpers.getY();
  doc.setDrawColor(200, 200, 215);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + maxWidth, y);
  y += 6;
  helpers.setY(y);
}

// ─── BRAND IDENTITY SECTION ──────────────────────────────────────────────────
export function renderBrandIdentity(
  ctx: PdfContext,
  helpers: PdfHelpers,
  brandIdentity: any
) {
  if (!brandIdentity || typeof brandIdentity !== 'object') return;
  const bi = brandIdentity;

  helpers.addSectionHeader('A', 'IDENTIDAD DE MARCA');

  if (bi.tono_y_voz) {
    helpers.addSubTitle('Tono y Voz');
    if (bi.tono_y_voz.estilo) helpers.addKeyValue('Estilo', String(bi.tono_y_voz.estilo));
    if (bi.tono_y_voz.enfoque) helpers.addKeyValue('Enfoque', String(bi.tono_y_voz.enfoque));
    if (bi.tono_y_voz.lenguaje) helpers.addKeyValue('Lenguaje', String(bi.tono_y_voz.lenguaje));
    if (bi.tono_y_voz.personalidad) helpers.addKeyValue('Personalidad', String(bi.tono_y_voz.personalidad));
  }

  if (bi.gaps_de_identidad?.length > 0) {
    helpers.addSubTitle('Gaps de Identidad Detectados');
    for (const gap of bi.gaps_de_identidad.slice(0, 5)) {
      helpers.addArrowBullet(String(gap));
    }
  }

  if (bi.recomendaciones_branding?.length > 0) {
    helpers.addSubTitle('Recomendaciones de Branding');
    for (const rec of bi.recomendaciones_branding.slice(0, 5)) {
      helpers.addArrowBullet(String(rec));
    }
  }

  if (bi.arquetipos_marca) {
    helpers.addSubTitle('Arquetipos de Marca');
    if (bi.arquetipos_marca.primario) helpers.addKeyValue('Primario', String(bi.arquetipos_marca.primario));
    if (bi.arquetipos_marca.secundario) helpers.addKeyValue('Secundario', String(bi.arquetipos_marca.secundario));
  }
}

// ─── FINANCIAL ANALYSIS SECTION ──────────────────────────────────────────────
export function renderFinancialAnalysis(
  ctx: PdfContext,
  helpers: PdfHelpers,
  financialAnalysis: any
) {
  if (!financialAnalysis || typeof financialAnalysis !== 'object') return;
  const fa = financialAnalysis;

  helpers.addSectionHeader('B', 'ANALISIS FINANCIERO');

  if (fa.business_model) helpers.addKeyValue('Modelo de Negocio', String(fa.business_model));
  if (fa.pricing_strategy) helpers.addKeyValue('Estrategia de Precios', String(fa.pricing_strategy));
  if (fa.margin_analysis) helpers.addKeyValue('Analisis de Margenes', String(fa.margin_analysis));
  if (fa.financial_health) {
    helpers.addSubTitle('Salud Financiera');
    helpers.addBody(String(fa.financial_health));
  }

  if (fa.products_services?.length > 0) {
    helpers.addSubTitle('Productos / Servicios');
    for (const prod of fa.products_services.slice(0, 5)) {
      if (typeof prod === 'object') {
        helpers.addKeyValue(prod.name || 'Producto', `${prod.price || ''} — ${prod.description || ''}`);
      } else {
        helpers.addArrowBullet(String(prod));
      }
    }
  }

  if (fa.revenue_streams?.length > 0) {
    helpers.addSubTitle('Fuentes de Ingreso');
    for (const rs of fa.revenue_streams.slice(0, 4)) {
      helpers.addArrowBullet(String(typeof rs === 'object' ? rs.name || JSON.stringify(rs) : rs));
    }
  }
}

// ─── CONSUMER PROFILE SECTION ────────────────────────────────────────────────
export function renderConsumerProfile(
  ctx: PdfContext,
  helpers: PdfHelpers,
  consumerProfile: any
) {
  if (!consumerProfile || typeof consumerProfile !== 'object') return;
  const cp = consumerProfile;

  helpers.addSectionHeader('C', 'PERFIL DEL CONSUMIDOR — ANALISIS PROFUNDO');

  if (cp.journey_compra) {
    helpers.addSubTitle('Journey de Compra');
    const stages = ['awareness', 'consideracion', 'decision', 'post_compra'];
    const stageLabels: Record<string, string> = {
      awareness: 'Descubrimiento', consideracion: 'Consideracion',
      decision: 'Decision', post_compra: 'Post-Compra'
    };
    for (const stage of stages) {
      const data = cp.journey_compra[stage];
      if (data && typeof data === 'object') {
        helpers.addKeyValue(stageLabels[stage] || stage, '');
        for (const [key, val] of Object.entries(data)) {
          if (val && typeof val === 'string') {
            helpers.addBody(`  ${key.replace(/_/g, ' ')}: ${val}`, 6);
          }
        }
      }
    }
  }

  if (cp.objeciones_principales?.length > 0) {
    helpers.addSubTitle('Objeciones Principales');
    for (const obj of cp.objeciones_principales.slice(0, 5)) {
      if (typeof obj === 'object') {
        helpers.addArrowBullet(`${obj.objecion || obj.title || ''}: ${obj.respuesta || obj.response || ''}`);
      } else {
        helpers.addArrowBullet(String(obj));
      }
    }
  }

  if (cp.triggers_de_compra?.length > 0) {
    helpers.addSubTitle('Triggers de Compra');
    for (const t of cp.triggers_de_compra.slice(0, 5)) {
      helpers.addArrowBullet(String(typeof t === 'object' ? t.trigger || JSON.stringify(t) : t));
    }
  }
}

// ─── POSITIONING STRATEGY SECTION ────────────────────────────────────────────
export function renderPositioningStrategy(
  ctx: PdfContext,
  helpers: PdfHelpers,
  positioningStrategy: any
) {
  if (!positioningStrategy || typeof positioningStrategy !== 'object') return;
  const ps = positioningStrategy;

  helpers.addSectionHeader('D', 'ESTRATEGIA DE POSICIONAMIENTO');

  if (ps.posicionamiento_actual) {
    helpers.addSubTitle('Posicionamiento Actual');
    helpers.addBody(String(ps.posicionamiento_actual));
  }

  if (ps.posicionamiento_recomendado) {
    helpers.addSubTitle('Posicionamiento Recomendado');
    helpers.addInsightBox(String(ps.posicionamiento_recomendado).slice(0, 250));
  }

  if (ps.territorios_comunicacion?.length > 0) {
    helpers.addSubTitle('Territorios de Comunicacion');
    for (const t of ps.territorios_comunicacion.slice(0, 5)) {
      if (typeof t === 'object') {
        helpers.addKeyValue(t.nombre || t.name || 'Territorio', String(t.descripcion || t.description || ''));
      } else {
        helpers.addArrowBullet(String(t));
      }
    }
  }

  if (ps.mensajes_clave?.length > 0) {
    helpers.addSubTitle('Mensajes Clave');
    for (const msg of ps.mensajes_clave.slice(0, 5)) {
      if (typeof msg === 'object') {
        helpers.addArrowBullet(`${msg.mensaje || msg.message || ''} ${msg.contexto ? `(${msg.contexto})` : ''}`);
      } else {
        helpers.addArrowBullet(String(msg));
      }
    }
  }

  // Perceptual map as text table
  if (ps.mapa_perceptual) {
    const mp = ps.mapa_perceptual;
    helpers.addSubTitle('Mapa Perceptual');
    if (mp.eje_x) helpers.addKeyValue('Eje X', String(mp.eje_x));
    if (mp.eje_y) helpers.addKeyValue('Eje Y', String(mp.eje_y));
    if (mp.posiciones && typeof mp.posiciones === 'object') {
      for (const [brand, pos] of Object.entries(mp.posiciones as Record<string, any>)) {
        helpers.addKeyValue(brand.charAt(0).toUpperCase() + brand.slice(1),
          `(${pos.x || '?'}, ${pos.y || '?'}) — ${pos.descripcion || ''}`);
      }
    }
  }

  renderGlossaryBox(ctx, helpers, 'positioning');
}

// ─── ACTION PLAN SECTION ─────────────────────────────────────────────────────
export function renderActionPlan(
  ctx: PdfContext,
  helpers: PdfHelpers,
  actionPlan: any[]
) {
  if (!Array.isArray(actionPlan) || actionPlan.length === 0) return;

  helpers.addSectionHeader('E', 'PLAN DE ACCION ESTRATEGICO');

  for (let i = 0; i < actionPlan.length; i++) {
    const item = actionPlan[i];
    if (typeof item === 'string') {
      helpers.addArrowBullet(item);
      continue;
    }
    const title = item.title || `Accion ${i + 1}`;
    const priority = item.priority || '';
    const timeline = item.timeline || '';

    helpers.addSubTitle(`${i + 1}. ${helpers.stripEmojis(title)}`);
    if (priority) helpers.addKeyValue('Prioridad', String(priority));
    if (timeline) helpers.addKeyValue('Timeline', String(timeline));
    if (item.situation) helpers.addBody(`Situacion: ${helpers.stripEmojis(String(item.situation))}`, 2);
    if (item.resolution) helpers.addBody(`Solucion: ${helpers.stripEmojis(String(item.resolution))}`, 2);
  }
}

// ─── ENHANCED COMPETITOR CARDS IN PDF ────────────────────────────────────────
export function renderCompetitorCards(
  ctx: PdfContext,
  helpers: PdfHelpers,
  competitors: any[]
) {
  if (!competitors || competitors.length === 0) return;

  helpers.addSubTitle('Analisis Individual de Competidores');

  for (let i = 0; i < competitors.length; i++) {
    const comp = competitors[i];
    const { doc, margin, maxWidth, accentR, accentG, accentB, brandR, brandG, brandB } = ctx;
    let y = helpers.getY();

    // Header bar with name and threat level
    if (y + 60 > ctx.pageHeight - 25) {
      doc.addPage();
      y = 20;
      helpers.setY(y);
    }

    doc.setFillColor(230, 233, 245);
    doc.roundedRect(margin, y, maxWidth, 9, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(brandR, brandG, brandB);
    doc.text(`${i + 1}. ${String(comp.name || comp.url || 'Competidor').slice(0, 35)}`, margin + 3, y + 6);

    // Threat badge
    const threat = String(comp.nivel_amenaza || '').toLowerCase();
    if (threat) {
      const threatColor: [number, number, number] = threat.includes('alto') || threat.includes('high')
        ? [200, 40, 40] : threat.includes('medio') || threat.includes('medium')
        ? [200, 150, 0] : [22, 160, 70];
      const threatLabel = threat.charAt(0).toUpperCase() + threat.slice(1);
      doc.setFillColor(...threatColor);
      doc.roundedRect(ctx.pageWidth - margin - 30, y + 1.5, 28, 6, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(`Amenaza: ${threatLabel}`, ctx.pageWidth - margin - 28, y + 5.8);
    }

    y += 12;
    helpers.setY(y);

    if (comp.url) helpers.addKeyValue('URL', String(comp.url));
    if (comp.value_proposition || comp.propuesta_valor) {
      helpers.addKeyValue('Propuesta de Valor', String(comp.value_proposition || comp.propuesta_valor));
    }

    // Strengths
    const strengths = comp.strengths || comp.fortalezas || [];
    if (Array.isArray(strengths) && strengths.length > 0) {
      y = helpers.getY();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(22, 160, 70);
      doc.text('Fortalezas:', margin + 4, y);
      y += 4;
      helpers.setY(y);
      for (const s of strengths.slice(0, 4)) {
        helpers.addBody(`  + ${helpers.stripEmojis(String(s))}`, 4, 4.5);
      }
    }

    // Weaknesses
    const weaknesses = comp.weaknesses || comp.debilidades || [];
    if (Array.isArray(weaknesses) && weaknesses.length > 0) {
      y = helpers.getY();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(200, 40, 40);
      doc.text('Debilidades:', margin + 4, y);
      y += 4;
      helpers.setY(y);
      for (const w of weaknesses.slice(0, 4)) {
        helpers.addBody(`  - ${helpers.stripEmojis(String(w))}`, 4, 4.5);
      }
    }

    // What they do better
    if (comp.que_hacen_mejor) {
      y = helpers.getY();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(200, 150, 0);
      doc.text('Que hacen mejor:', margin + 4, y);
      y += 4;
      helpers.setY(y);
      helpers.addBody(`  ${helpers.stripEmojis(String(comp.que_hacen_mejor))}`, 4, 4.5);
    }

    // What client does better
    if (comp.que_hace_cliente_mejor) {
      y = helpers.getY();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(22, 100, 180);
      doc.text('Que hacemos mejor:', margin + 4, y);
      y += 4;
      helpers.setY(y);
      helpers.addBody(`  ${helpers.stripEmojis(String(comp.que_hace_cliente_mejor))}`, 4, 4.5);
    }

    // Content strategy
    if (comp.estrategia_contenido) {
      helpers.addKeyValue('Estrategia de Contenido', String(comp.estrategia_contenido));
    }

    // Justification
    if (comp.justificacion_amenaza) {
      helpers.addBody(`Justificacion: ${helpers.stripEmojis(String(comp.justificacion_amenaza))}`, 4, 4.5);
    }

    helpers.setY(helpers.getY() + 4);
  }

  renderGlossaryBox(ctx, helpers, 'competitive');
}

// ─── KEYWORD PHASES SECTION ──────────────────────────────────────────────────
export function renderKeywordPhases(
  ctx: PdfContext,
  helpers: PdfHelpers,
  roadmap: any
) {
  if (!roadmap || typeof roadmap !== 'object') return;

  helpers.addSubTitle('Estrategia de Keywords por Fases');

  const phaseKeys = Object.keys(roadmap).filter(k =>
    k.toLowerCase().includes('phase') || k.toLowerCase().includes('fase')
  ).sort();

  for (const key of phaseKeys) {
    const phase = roadmap[key];
    if (!phase || typeof phase !== 'object') continue;

    const label = key.replace(/_/g, ' ').replace(/phase/i, 'Fase');
    helpers.addKeyValue(label, `${phase.focus || ''} — ${phase.timeline || ''}`);

    if (Array.isArray(phase.keywords) && phase.keywords.length > 0) {
      helpers.addBody(`  Keywords: ${phase.keywords.join(', ')}`, 6, 4.5);
    }
    if (Array.isArray(phase.kpis) && phase.kpis.length > 0) {
      helpers.addBody(`  KPIs: ${phase.kpis.join(', ')}`, 6, 4.5);
    }
    if (Array.isArray(phase.acciones_concretas) && phase.acciones_concretas.length > 0) {
      for (const a of phase.acciones_concretas.slice(0, 3)) {
        helpers.addBody(`    • ${helpers.stripEmojis(String(a))}`, 10, 4.5);
      }
    }
  }

  renderGlossaryBox(ctx, helpers, 'keywords');
}

// ─── META ADS STRATEGY SECTION ───────────────────────────────────────────────
export function renderMetaAdsStrategy(
  ctx: PdfContext,
  helpers: PdfHelpers,
  metaStrategy: any
) {
  if (!metaStrategy || typeof metaStrategy !== 'object') return;

  helpers.addSectionHeader('F', 'ESTRATEGIA META ADS');

  if (metaStrategy.objetivos_campaña || metaStrategy.objetivos_campana) {
    const obj = metaStrategy.objetivos_campaña || metaStrategy.objetivos_campana;
    helpers.addSubTitle('Objetivos por Etapa del Funnel');
    for (const stage of ['tofu', 'mofu', 'bofu']) {
      if (obj[stage]) {
        const s = obj[stage];
        helpers.addKeyValue(stage.toUpperCase(), String(s.meta || s.objetivo || ''));
        if (s.estrategia) helpers.addBody(`  Estrategia: ${String(s.estrategia)}`, 6, 4.5);
      }
    }
  }

  if (metaStrategy.audiencias?.length > 0) {
    helpers.addSubTitle('Audiencias');
    for (const aud of metaStrategy.audiencias.slice(0, 5)) {
      if (typeof aud === 'object') {
        helpers.addArrowBullet(`${aud.nombre || aud.name || ''}: ${aud.descripcion || aud.description || ''}`);
      } else {
        helpers.addArrowBullet(String(aud));
      }
    }
  }

  if (metaStrategy.kpis_objetivo) {
    helpers.addSubTitle('KPIs Objetivo por Etapa del Funnel');
    const { doc, margin, maxWidth } = ctx;
    const stages = ['tofu', 'mofu', 'bofu'] as const;
    const stageLabels: Record<string, string> = { tofu: 'TOFU (Awareness)', mofu: 'MOFU (Consideracion)', bofu: 'BOFU (Conversion)' };
    // Render as mini-tables per stage
    for (const stage of stages) {
      const kpis = metaStrategy.kpis_objetivo[stage];
      if (!kpis || typeof kpis !== 'object') continue;
      const entries = Object.entries(kpis);
      if (entries.length === 0) continue;
      // Stage label
      helpers.checkPage(10);
      let y = helpers.getY();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(ctx.brandR, ctx.brandG, ctx.brandB);
      doc.text(stageLabels[stage] || stage.toUpperCase(), margin + 2, y);
      y += 5;
      helpers.setY(y);
      // KPI chips in a grid
      const chipW = (maxWidth - 8) / Math.min(entries.length, 3);
      let cx = margin + 2;
      let row = 0;
      for (let ei = 0; ei < entries.length; ei++) {
        if (ei > 0 && ei % 3 === 0) {
          row++;
          cx = margin + 2;
        }
        helpers.checkPage(12);
        y = helpers.getY();
        const chipY = y + row * 11;
        // Chip background
        doc.setFillColor(245, 246, 252);
        doc.roundedRect(cx, chipY, chipW - 3, 9, 1, 1, 'F');
        // Metric name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 120);
        const metricName = String(entries[ei][0]).replace(/_/g, ' ').toUpperCase();
        doc.text(metricName, cx + 2, chipY + 3.5);
        // Metric value
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(ctx.brandR, ctx.brandG, ctx.brandB);
        doc.text(String(entries[ei][1]), cx + 2, chipY + 7.5);
        cx += chipW;
      }
      helpers.setY(y + (row + 1) * 11 + 3);
    }
  }

  if (metaStrategy.presupuesto_sugerido) {
    helpers.addSubTitle('Presupuesto Sugerido');
    const ps = metaStrategy.presupuesto_sugerido;
    if (typeof ps === 'object') {
      for (const [k, v] of Object.entries(ps)) {
        helpers.addKeyValue(k.replace(/_/g, ' '), String(v));
      }
    } else {
      helpers.addBody(String(ps));
    }
  }

  renderGlossaryBox(ctx, helpers, 'meta_ads');
}

// ─── GOOGLE ADS STRATEGY SECTION ─────────────────────────────────────────────
export function renderGoogleAdsStrategy(
  ctx: PdfContext,
  helpers: PdfHelpers,
  googleStrategy: any
) {
  if (!googleStrategy || typeof googleStrategy !== 'object') return;

  helpers.addSectionHeader('G', 'ESTRATEGIA GOOGLE ADS');

  if (googleStrategy.ad_copies?.length > 0) {
    helpers.addSubTitle('Copies de Anuncios');
    for (const copy of googleStrategy.ad_copies.slice(0, 3)) {
      if (typeof copy === 'object') {
        const variant = copy.variant || '';
        helpers.addKeyValue(`Variante ${variant}`, '');
        if (copy.headline1) helpers.addBody(`  H1: ${copy.headline1} | H2: ${copy.headline2 || ''} | H3: ${copy.headline3 || ''}`, 4, 4.5);
        if (copy.description1) helpers.addBody(`  D1: ${copy.description1}`, 4, 4.5);
        if (copy.description2) helpers.addBody(`  D2: ${copy.description2}`, 4, 4.5);
      }
    }
  }

  if (googleStrategy.campaign_types?.length > 0) {
    helpers.addSubTitle('Tipos de Campana Recomendados');
    for (const ct of googleStrategy.campaign_types.slice(0, 4)) {
      if (typeof ct === 'object') {
        helpers.addArrowBullet(`${ct.type || ct.name || ''}: ${ct.objetivo || ct.description || ''}`);
      } else {
        helpers.addArrowBullet(String(ct));
      }
    }
  }

  if (googleStrategy.extensions?.length > 0) {
    helpers.addSubTitle('Extensiones de Anuncios');
    for (const ext of googleStrategy.extensions.slice(0, 4)) {
      if (typeof ext === 'object') {
        helpers.addArrowBullet(`${ext.type || ''}: ${ext.content || ext.text || ''}`);
      } else {
        helpers.addArrowBullet(String(ext));
      }
    }
  }

  if (googleStrategy.bidding_strategy) {
    helpers.addSubTitle('Estrategia de Bidding');
    if (typeof googleStrategy.bidding_strategy === 'object') {
      for (const [k, v] of Object.entries(googleStrategy.bidding_strategy)) {
        helpers.addKeyValue(k.replace(/_/g, ' '), String(v));
      }
    } else {
      helpers.addBody(String(googleStrategy.bidding_strategy));
    }
  }

  renderGlossaryBox(ctx, helpers, 'google_ads');
}

// ─── ADS LIBRARY ANALYSIS SECTION ────────────────────────────────────────────
export function renderAdsLibraryAnalysis(
  ctx: PdfContext,
  helpers: PdfHelpers,
  adsLibrary: any
) {
  if (!adsLibrary || typeof adsLibrary !== 'object') return;

  helpers.addSectionHeader('H', 'ANALISIS ADS LIBRARY Y CREATIVOS');

  if (adsLibrary.market_patterns) {
    helpers.addSubTitle('Patrones del Mercado');
    const mp = adsLibrary.market_patterns;
    if (mp.dominant_content) helpers.addKeyValue('Contenido Dominante', String(mp.dominant_content));
    if (mp.common_messages) helpers.addKeyValue('Mensajes Comunes', String(mp.common_messages));
    if (mp.probable_formats) helpers.addKeyValue('Formatos Probables', String(mp.probable_formats));
  }

  if (adsLibrary.creative_concepts?.length > 0) {
    helpers.addSubTitle('5 Conceptos Creativos');
    for (let i = 0; i < Math.min(adsLibrary.creative_concepts.length, 5); i++) {
      const cc = adsLibrary.creative_concepts[i];
      if (typeof cc === 'object') {
        helpers.addKeyValue(`Concepto ${i + 1}`, String(cc.nombre || cc.name || ''));
        if (cc.hook) helpers.addBody(`  Hook: ${cc.hook}`, 6, 4.5);
        if (cc.formato || cc.format) helpers.addBody(`  Formato: ${cc.formato || cc.format}`, 6, 4.5);
        if (cc.copy) helpers.addBody(`  Copy: ${cc.copy}`, 6, 4.5);
        if (cc.cta) helpers.addBody(`  CTA: ${cc.cta}`, 6, 4.5);
        if (cc.justificacion) helpers.addBody(`  Por que: ${cc.justificacion}`, 6, 4.5);
      } else {
        helpers.addArrowBullet(String(cc));
      }
    }
  }

  if (adsLibrary.creative_calendar) {
    helpers.addSubTitle('Calendario Creativo Mensual');
    const cal = adsLibrary.creative_calendar;
    for (const [weekKey, weekData] of Object.entries(cal)) {
      if (typeof weekData !== 'object' || weekData === null) continue;
      const wd = weekData as any;
      const label = weekKey.replace(/_/g, ' ').replace(/week/i, 'Semana');
      helpers.addKeyValue(label, '');
      if (wd.launch) helpers.addBody(`  Lanzamiento: ${wd.launch}`, 6, 4.5);
      if (wd.test_variables?.length > 0) {
        helpers.addBody(`  Variables a testear: ${wd.test_variables.join(', ')}`, 6, 4.5);
      }
    }
  }

  if (adsLibrary.winning_patterns?.length > 0) {
    helpers.addSubTitle('Patrones Ganadores Detectados');
    for (const p of adsLibrary.winning_patterns.slice(0, 4)) {
      helpers.addArrowBullet(String(p));
    }
  }

  if (adsLibrary.hook_ideas?.length > 0) {
    helpers.addSubTitle('Ideas de Hook para Anuncios');
    for (const h of adsLibrary.hook_ideas.slice(0, 4)) {
      helpers.addArrowBullet(String(h));
    }
  }

  renderGlossaryBox(ctx, helpers, 'ads_library');
}
