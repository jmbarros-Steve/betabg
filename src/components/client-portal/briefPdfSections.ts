import jsPDF from 'jspdf';

// ─── SAFE STRING UTILITY ────────────────────────────────────────────────────
/** Convert any value to a printable string, handling nested objects gracefully. */
function safeStr(val: any, depth = 0): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.map(v => safeStr(v, depth + 1)).filter(Boolean).join(', ');
  if (typeof val === 'object') {
    if (depth > 2) return JSON.stringify(val);
    const parts: string[] = [];
    for (const [k, v] of Object.entries(val)) {
      const sv = safeStr(v, depth + 1);
      if (sv) parts.push(`${k.replace(/_/g, ' ')}: ${sv}`);
    }
    return parts.join('. ');
  }
  return String(val);
}

/** Render all top-level keys of an object as key-value pairs (generic fallback). */
function renderGenericObject(helpers: PdfHelpers, obj: any, maxEntries = 12) {
  if (!obj || typeof obj !== 'object') return;
  let count = 0;
  for (const [key, val] of Object.entries(obj)) {
    if (count >= maxEntries) break;
    if (val == null) continue;
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    if (Array.isArray(val)) {
      helpers.addSubTitle(label);
      for (const item of val.slice(0, 8)) {
        if (typeof item === 'object' && item !== null) {
          // Render each sub-object as key-value pairs for better readability
          const parts: string[] = [];
          for (const [ik, iv] of Object.entries(item)) {
            if (iv != null) parts.push(`${ik.replace(/_/g, ' ')}: ${safeStr(iv)}`);
          }
          helpers.addArrowBullet(parts.join(' | '));
        } else {
          helpers.addArrowBullet(String(item));
        }
      }
    } else if (typeof val === 'object') {
      helpers.addSubTitle(label);
      for (const [sk, sv] of Object.entries(val)) {
        if (sv == null) continue;
        const sLabel = sk.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        if (Array.isArray(sv)) {
          // Nested array inside sub-object
          helpers.addKeyValue(sLabel, '');
          for (const item of sv.slice(0, 5)) {
            helpers.addArrowBullet(safeStr(item));
          }
        } else if (typeof sv === 'object' && sv !== null) {
          // Nested object: render each property
          helpers.addKeyValue(sLabel, '');
          for (const [nk, nv] of Object.entries(sv)) {
            if (nv != null) {
              helpers.addBody(`  ${nk.replace(/_/g, ' ')}: ${safeStr(nv)}`, 6);
            }
          }
        } else {
          helpers.addKeyValue(sLabel, safeStr(sv));
        }
      }
    } else {
      helpers.addKeyValue(label, String(val));
    }
    count++;
  }
}

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
  addSectionHeader: (numOrTitle: string, title?: string) => void;
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

// ─── GLOSSARY BOX RENDERER (Premium: gold left border, styled entries) ──────
export function renderGlossaryBox(
  ctx: PdfContext,
  helpers: PdfHelpers,
  sectionKey: string
) {
  const items = GLOSSARIES[sectionKey];
  if (!items || items.length === 0) return;

  const { doc, margin, maxWidth, pageHeight, accentR, accentG, accentB } = ctx;
  let y = helpers.getY();

  y += 6;

  // Title bar with gold accent
  helpers.checkPage(14);
  y = helpers.getY();
  doc.setFillColor(250, 248, 242);
  doc.roundedRect(margin, y, maxWidth, 9, 2, 2, 'F');
  // Gold left border
  doc.setFillColor(accentR, accentG, accentB);
  doc.rect(margin, y, 3, 9, 'F');
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(accentR, accentG, accentB);
  doc.text('GLOSARIO', margin + 8, y + 6.2);
  y += 12;
  helpers.setY(y);

  for (let i = 0; i < items.length; i++) {
    // Measure definition for block height
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(7.5);
    const defLines = doc.splitTextToSize(items[i].def, maxWidth - 14);
    const blockH = 6 + defLines.length * 4 + 3;
    helpers.checkPage(blockH + 2);
    y = helpers.getY();

    // Gold left border stripe for each entry
    doc.setFillColor(252, 250, 245);
    doc.rect(margin, y - 1.5, maxWidth, blockH, 'F');
    doc.setFillColor(accentR, accentG, accentB);
    doc.rect(margin, y - 1.5, 2, blockH, 'F');

    // Term in bold gold — on its own line
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(accentR, accentG, accentB);
    doc.text(items[i].term, margin + 6, y);
    y += 6;
    // CRITICAL: sync y to helpers before any checkPage call
    helpers.setY(y);

    // Definition in dark gray, wrapped — clearly below term
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 70);
    for (let li = 0; li < defLines.length; li++) {
      helpers.setY(y);
      helpers.checkPage(5);
      y = helpers.getY();
      doc.text(defLines[li], margin + 6, y);
      y += 4;
    }

    // Fine separator line between entries
    if (i < items.length - 1) {
      doc.setDrawColor(220, 215, 200);
      doc.setLineWidth(0.15);
      doc.line(margin + 6, y, margin + maxWidth - 4, y);
    }
    y += 2;
    helpers.setY(y);
  }

  y = helpers.getY();
  y += 4;
  helpers.setY(y);
}

// ─── BRAND IDENTITY SECTION ──────────────────────────────────────────────────
export function renderBrandIdentity(
  ctx: PdfContext,
  helpers: PdfHelpers,
  brandIdentity: any
) {
  if (!brandIdentity || typeof brandIdentity !== 'object') return;

  helpers.addSectionHeader('A', 'IDENTIDAD DE MARCA');

  // Render ALL keys generically — handles any AI-generated structure
  renderGenericObject(helpers, brandIdentity, 20);
}

// ─── FINANCIAL ANALYSIS SECTION ──────────────────────────────────────────────
export function renderFinancialAnalysis(
  ctx: PdfContext,
  helpers: PdfHelpers,
  financialAnalysis: any
) {
  if (!financialAnalysis || typeof financialAnalysis !== 'object') return;

  helpers.addSectionHeader('B', 'ANALISIS FINANCIERO');

  // Render ALL keys generically — handles any AI-generated structure
  renderGenericObject(helpers, financialAnalysis, 20);
}

// ─── CONSUMER PROFILE SECTION ────────────────────────────────────────────────
export function renderConsumerProfile(
  ctx: PdfContext,
  helpers: PdfHelpers,
  consumerProfile: any
) {
  if (!consumerProfile || typeof consumerProfile !== 'object') return;

  helpers.addSectionHeader('C', 'PERFIL DEL CONSUMIDOR — ANALISIS PROFUNDO');

  // Render ALL keys generically — handles any AI-generated structure
  renderGenericObject(helpers, consumerProfile, 20);
}

// ─── POSITIONING STRATEGY SECTION ────────────────────────────────────────────
export function renderPositioningStrategy(
  ctx: PdfContext,
  helpers: PdfHelpers,
  positioningStrategy: any
) {
  if (!positioningStrategy || typeof positioningStrategy !== 'object') return;

  helpers.addSectionHeader('D', 'ESTRATEGIA DE POSICIONAMIENTO');

  // Render ALL keys generically — handles any AI-generated structure
  renderGenericObject(helpers, positioningStrategy, 20);

  // Perceptual map as text table
  if (positioningStrategy.mapa_perceptual) {
    const mp = positioningStrategy.mapa_perceptual;
    helpers.addSubTitle('Mapa Perceptual');
    if (mp.eje_x) helpers.addKeyValue('Eje X', String(mp.eje_x));
    if (mp.eje_y) helpers.addKeyValue('Eje Y', String(mp.eje_y));
    if (mp.posiciones && typeof mp.posiciones === 'object') {
      for (const [brand, pos] of Object.entries(mp.posiciones as Record<string, any>)) {
        const px = pos.x || pos.posicion_x || pos.score_x || '';
        const py = pos.y || pos.posicion_y || pos.score_y || '';
        const coords = px && py ? `(${px}, ${py}) — ` : '';
        helpers.addKeyValue(brand.charAt(0).toUpperCase() + brand.slice(1),
          `${coords}${pos.descripcion || ''}`);
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

  const { doc, margin, maxWidth, brandR, brandG, brandB, accentR, accentG, accentB } = ctx;
  const scrColors: Record<string, { bg: [number,number,number]; fg: [number,number,number]; label: string }> = {
    s: { bg: [230, 240, 255], fg: [27, 42, 74], label: 'SITUACION' },
    c: { bg: [255, 243, 230], fg: [180, 100, 20], label: 'COMPLICACION' },
    r: { bg: [230, 250, 235], fg: [22, 120, 50], label: 'RESOLUCION' },
  };

  for (let i = 0; i < actionPlan.length; i++) {
    const item = actionPlan[i];
    if (typeof item === 'string') {
      helpers.addArrowBullet(item);
      continue;
    }
    const title = helpers.stripEmojis(item.title || `Accion ${i + 1}`);
    const priority = item.priority || '';
    const timeline = item.timeline || '';
    const situation = helpers.stripEmojis(String(item.situation || ''));
    const complication = helpers.stripEmojis(String(item.complication || ''));
    const resolution = helpers.stripEmojis(String(item.resolution || ''));
    const impact = helpers.stripEmojis(String(item.expected_impact || ''));

    // Calculate dynamic card height
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(7.5);
    const sLines = situation ? doc.splitTextToSize(situation, maxWidth - 20) : [];
    const cLines = complication ? doc.splitTextToSize(complication, maxWidth - 20) : [];
    const rLines = resolution ? doc.splitTextToSize(resolution, maxWidth - 20) : [];
    const impLines = impact ? doc.splitTextToSize(impact, maxWidth - 24) : [];

    const scrH = (sLines.length > 0 ? 8 + sLines.length * 4 : 0)
               + (cLines.length > 0 ? 8 + cLines.length * 4 : 0)
               + (rLines.length > 0 ? 8 + rLines.length * 4 : 0);
    const cardH = 18 + (priority || timeline ? 6 : 0) + scrH + (impLines.length > 0 ? 10 + impLines.length * 4 : 0) + 4;

    helpers.checkPage(cardH + 4);
    let y = helpers.getY();

    // Card container
    doc.setFillColor(250, 250, 254);
    doc.roundedRect(margin, y, maxWidth, cardH, 2, 2, 'F');
    doc.setDrawColor(180, 185, 200);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, maxWidth, cardH, 2, 2, 'S');

    // Number circle
    doc.setFillColor(brandR, brandG, brandB);
    doc.circle(margin + 8, y + 8, 5, 'F');
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1), margin + 8, y + 9.5, { align: 'center' });

    // Title
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(brandR, brandG, brandB);
    const titleLines = doc.splitTextToSize(title, maxWidth - 24);
    doc.text(titleLines[0] || '', margin + 16, y + 9);
    y += 14;

    // Priority & Timeline
    if (priority || timeline) {
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 120);
      const meta = [priority ? `Prioridad: ${priority}` : '', timeline ? `Timeline: ${timeline}` : ''].filter(Boolean).join(' | ');
      doc.text(meta, margin + 16, y);
      y += 6;
    }

    // SCR sections — full text, all lines
    for (const [key, text, lines] of [['s', situation, sLines], ['c', complication, cLines], ['r', resolution, rLines]] as [string, string, string[]][]) {
      if (lines.length === 0) continue;
      const scr = scrColors[key];
      const blockH = 6 + lines.length * 4 + 2;
      helpers.setY(y);
      helpers.checkPage(blockH + 2);
      y = helpers.getY();
      doc.setFillColor(...scr.bg);
      doc.roundedRect(margin + 4, y, maxWidth - 8, blockH, 1, 1, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...scr.fg);
      doc.text(scr.label, margin + 7, y + 4);
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(40, 40, 50);
      let ly = y + 8;
      for (const line of lines) {
        doc.text(line, margin + 7, ly);
        ly += 4;
      }
      y = ly + 2;
    }

    // Impact
    if (impLines.length > 0) {
      helpers.setY(y);
      helpers.checkPage(10 + impLines.length * 4);
      y = helpers.getY();
      doc.setFillColor(253, 248, 240);
      const impBlockH = 6 + impLines.length * 4 + 2;
      doc.roundedRect(margin + 4, y, maxWidth - 8, impBlockH, 1, 1, 'F');
      doc.setFillColor(accentR, accentG, accentB);
      doc.rect(margin + 4, y, 2, impBlockH, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(accentR, accentG, accentB);
      doc.text('IMPACTO ESPERADO', margin + 9, y + 4);
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(60, 40, 0);
      let iy = y + 8;
      for (const line of impLines) {
        doc.text(line, margin + 9, iy);
        iy += 4;
      }
      y = iy + 2;
    }

    helpers.setY(y + 4);
  }
}

// ─── ENHANCED COMPETITOR CARDS (Premium styled) ─────────────────────────────
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

    // Card container with border
    helpers.checkPage(65);
    y = helpers.getY();

    // Card background
    doc.setFillColor(252, 252, 255);
    doc.roundedRect(margin, y, maxWidth, 8, 2, 2, 'F'); // just header for now
    doc.setDrawColor(brandR, brandG, brandB);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, maxWidth, 8, 2, 2, 'S');

    // Header bar with navy bg
    doc.setFillColor(brandR, brandG, brandB);
    doc.roundedRect(margin, y, maxWidth, 10, 2, 2, 'F');
    // Gold accent line
    doc.setFillColor(accentR, accentG, accentB);
    doc.rect(margin, y + 9, maxWidth, 1, 'F');

    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`${i + 1}. ${String(comp.name || comp.url || 'Competidor').slice(0, 35)}`, margin + 5, y + 7);

    // Threat badge
    const threat = String(comp.nivel_amenaza || '').toLowerCase();
    if (threat) {
      const threatColor: [number, number, number] = threat.includes('alto') || threat.includes('high')
        ? [200, 40, 40] : threat.includes('medio') || threat.includes('medium')
        ? [220, 170, 30] : [22, 160, 70];
      const threatLabel = threat.includes('alto') || threat.includes('high') ? 'ALTO'
        : threat.includes('medio') || threat.includes('medium') ? 'MEDIO' : 'BAJO';
      doc.setFillColor(...threatColor);
      doc.roundedRect(ctx.pageWidth - margin - 28, y + 2, 24, 6, 2, 2, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(threatLabel, ctx.pageWidth - margin - 16, y + 6, { align: 'center' });
    }

    y += 13;
    helpers.setY(y);

    if (comp.url) helpers.addKeyValue('URL', String(comp.url));
    if (comp.value_proposition || comp.propuesta_valor) {
      helpers.addKeyValue('Propuesta de Valor', String(comp.value_proposition || comp.propuesta_valor));
    }

    // Strengths with green indicator
    const strengths = comp.strengths || comp.fortalezas || [];
    if (Array.isArray(strengths) && strengths.length > 0) {
      y = helpers.getY();
      doc.setFillColor(230, 250, 235);
      doc.roundedRect(margin + 2, y - 1, maxWidth - 4, 5, 1, 1, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(22, 120, 50);
      doc.text('FORTALEZAS', margin + 5, y + 2.5);
      y += 6;
      helpers.setY(y);
      for (const s of strengths.slice(0, 4)) {
        helpers.addBody(`  + ${helpers.stripEmojis(String(s))}`, 4, 4.5);
      }
    }

    // Weaknesses with red indicator
    const weaknesses = comp.weaknesses || comp.debilidades || [];
    if (Array.isArray(weaknesses) && weaknesses.length > 0) {
      y = helpers.getY();
      doc.setFillColor(255, 235, 235);
      doc.roundedRect(margin + 2, y - 1, maxWidth - 4, 5, 1, 1, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(180, 40, 40);
      doc.text('DEBILIDADES', margin + 5, y + 2.5);
      y += 6;
      helpers.setY(y);
      for (const w of weaknesses.slice(0, 4)) {
        helpers.addBody(`  - ${helpers.stripEmojis(String(w))}`, 4, 4.5);
      }
    }

    // What they do better
    if (comp.que_hacen_mejor) {
      y = helpers.getY();
      doc.setFillColor(255, 248, 230);
      doc.roundedRect(margin + 2, y - 1, maxWidth - 4, 5, 1, 1, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(180, 120, 0);
      doc.text('QUE HACEN MEJOR', margin + 5, y + 2.5);
      y += 6;
      helpers.setY(y);
      helpers.addBody(`  ${helpers.stripEmojis(String(comp.que_hacen_mejor))}`, 4, 4.5);
    }

    // What client does better
    if (comp.que_hace_cliente_mejor) {
      y = helpers.getY();
      doc.setFillColor(230, 240, 255);
      doc.roundedRect(margin + 2, y - 1, maxWidth - 4, 5, 1, 1, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(22, 80, 160);
      doc.text('NUESTRA VENTAJA', margin + 5, y + 2.5);
      y += 6;
      helpers.setY(y);
      helpers.addBody(`  ${helpers.stripEmojis(String(comp.que_hace_cliente_mejor))}`, 4, 4.5);
    }

    if (comp.estrategia_contenido) {
      helpers.addKeyValue('Estrategia de Contenido', String(comp.estrategia_contenido));
    }
    if (comp.justificacion_amenaza) {
      helpers.addBody(`Justificacion: ${helpers.stripEmojis(String(comp.justificacion_amenaza))}`, 4, 4.5);
    }

    // Card bottom border
    y = helpers.getY();
    doc.setDrawColor(accentR, accentG, accentB);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 1, margin + maxWidth, y + 1);
    helpers.setY(y + 5);
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

  const phaseStyles: { label: string; color: [number,number,number]; bg: [number,number,number] }[] = [
    { label: 'FASE 1 — Quick Wins', color: [27, 42, 74], bg: [230, 240, 255] },
    { label: 'FASE 2 — Growth', color: [45, 74, 122], bg: [237, 247, 240] },
    { label: 'FASE 3 — Dominance', color: [22, 120, 50], bg: [253, 248, 240] },
  ];

  const { doc, margin, maxWidth, accentR, accentG, accentB } = ctx;

  for (let pi = 0; pi < phaseKeys.length; pi++) {
    const phase = roadmap[phaseKeys[pi]];
    if (!phase || typeof phase !== 'object') continue;

    const style = phaseStyles[pi % phaseStyles.length];
    const focus = phase.focus || '';
    const timeline = phase.timeline || '';

    // Phase header bar
    helpers.checkPage(16);
    let y = helpers.getY();
    doc.setFillColor(...style.color);
    doc.roundedRect(margin, y, maxWidth, 10, 2, 2, 'F');
    doc.setFillColor(accentR, accentG, accentB);
    doc.rect(margin, y + 9, maxWidth, 1, 'F');
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    const phaseTitle = `${style.label}${focus ? ': ' + focus : ''}${timeline ? ' — ' + timeline : ''}`;
    const phaseTitleLines = doc.splitTextToSize(phaseTitle, maxWidth - 10);
    doc.text(phaseTitleLines[0] || phaseTitle, margin + 5, y + 7);
    y += 13;
    helpers.setY(y);

    // Phase content on colored background
    helpers.checkPage(10);
    y = helpers.getY();
    const contentStartY = y;

    if (Array.isArray(phase.keywords) && phase.keywords.length > 0) {
      // Keywords as inline badges
      doc.setFillColor(...style.bg);
      const kwText = 'Keywords: ' + phase.keywords.join(', ');
      const kwLines = doc.splitTextToSize(kwText, maxWidth - 12);
      const kwBoxH = kwLines.length * 4.5 + 5;
      doc.roundedRect(margin, y, maxWidth, kwBoxH, 1, 1, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...style.color);
      doc.text('Keywords:', margin + 4, y + 4);
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 50);
      for (let kli = 0; kli < kwLines.length; kli++) {
        doc.text(kwLines[kli], margin + 4, y + 4 + kli * 4.5);
      }
      y += kwBoxH + 2;
      helpers.setY(y);
    }
    if (Array.isArray(phase.kpis) && phase.kpis.length > 0) {
      helpers.checkPage(8);
      y = helpers.getY();
      doc.setFillColor(248, 248, 252);
      const kpiText = 'KPIs: ' + phase.kpis.join(', ');
      const kpiLines = doc.splitTextToSize(kpiText, maxWidth - 12);
      const kpiBoxH = kpiLines.length * 4.5 + 4;
      doc.roundedRect(margin, y, maxWidth, kpiBoxH, 1, 1, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 120);
      for (let kli = 0; kli < kpiLines.length; kli++) {
        doc.text(kpiLines[kli], margin + 4, y + 4 + kli * 4.5);
      }
      y += kpiBoxH + 2;
      helpers.setY(y);
    }
    if (Array.isArray(phase.acciones_concretas) && phase.acciones_concretas.length > 0) {
      for (const a of phase.acciones_concretas.slice(0, 3)) {
        helpers.addBody(`  • ${helpers.stripEmojis(String(a))}`, 6, 4.5);
      }
    }
    y = helpers.getY();
    y += 4;
    helpers.setY(y);
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
      doc.setFont('NotoSans', 'bold');
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
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 120);
        const metricName = String(entries[ei][0]).replace(/_/g, ' ').toUpperCase();
        doc.text(metricName, cx + 2, chipY + 3.5);
        // Metric value
        doc.setFont('NotoSans', 'bold');
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
        const label = k.replace(/_/g, ' ').toUpperCase();
        const value = typeof v === 'number'
          ? '$' + Math.round(v).toLocaleString('es-CL') + ' CLP'
          : String(v);
        helpers.addKeyValue(label, value);
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
    const { doc, margin, maxWidth, accentR, accentG, accentB, brandR, brandG, brandB } = ctx;
    const copyColors: [number,number,number][] = [
      [66, 133, 244], // Google blue
      [52, 168, 83],  // Google green
      [234, 67, 53],  // Google red
      [251, 188, 4],  // Google yellow
      [102, 51, 153], // Purple
    ];
    for (let ci = 0; ci < Math.min(googleStrategy.ad_copies.length, 5); ci++) {
      const copy = googleStrategy.ad_copies[ci];
      if (typeof copy !== 'object') continue;
      const cColor = copyColors[ci % copyColors.length];

      // Calculate dynamic height
      const headlines = [copy.headline1, copy.headline2, copy.headline3].filter(Boolean).join(' | ');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(9);
      const hLines = doc.splitTextToSize(helpers.stripEmojis(headlines), maxWidth - 14);
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(8);
      const d1Text = helpers.stripEmojis(copy.description1 || '');
      const d2Text = helpers.stripEmojis(copy.description2 || '');
      const d1Lines = d1Text ? doc.splitTextToSize(d1Text, maxWidth - 14) : [];
      const d2Lines = d2Text ? doc.splitTextToSize(d2Text, maxWidth - 14) : [];
      const cardH = 8 + hLines.length * 5 + d1Lines.length * 4 + d2Lines.length * 4 + 6;

      helpers.checkPage(cardH + 4);
      let y = helpers.getY();
      // Card with dynamic height
      doc.setFillColor(248, 249, 255);
      doc.roundedRect(margin, y, maxWidth, cardH, 2, 2, 'F');
      doc.setFillColor(...cColor);
      doc.rect(margin, y, 3, cardH, 'F');
      // Variant label
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...cColor);
      doc.text(`Variante ${copy.variant || ci + 1}`, margin + 7, y + 5);
      y += 8;
      // Headlines — all lines
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 50);
      for (const hl of hLines) {
        doc.text(hl, margin + 7, y);
        y += 5;
      }
      // Description 1 — all lines
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 70);
      for (const dl of d1Lines) {
        doc.text(dl, margin + 7, y);
        y += 4;
      }
      // Description 2 — all lines
      for (const dl of d2Lines) {
        doc.text(dl, margin + 7, y);
        y += 4;
      }
      helpers.setY(y + 4);
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
    const conceptColors: [number, number, number][] = [
      [27, 42, 74], [45, 74, 122], [200, 163, 90], [22, 120, 80], [120, 60, 140],
    ];
    for (let i = 0; i < Math.min(adsLibrary.creative_concepts.length, 5); i++) {
      const cc = adsLibrary.creative_concepts[i];
      if (typeof cc !== 'object') { helpers.addArrowBullet(String(cc)); continue; }
      const { doc, margin, maxWidth, accentR, accentG, accentB } = ctx;

      // Calculate dynamic card height based on content
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(8);
      const copyText = helpers.stripEmojis(cc.copy || cc.primary_copy || '');
      const copyLines = copyText ? doc.splitTextToSize(copyText, maxWidth - 14) : [];
      const hookText = cc.hook ? `"${helpers.stripEmojis(cc.hook)}"` : '';
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(9);
      const hookLines = hookText ? doc.splitTextToSize(hookText, maxWidth - 14) : [];
      const dynamicH = 14 + (hookLines.length * 5) + (copyLines.length * 4) + (cc.cta ? 10 : 0) + (cc.why_it_works || cc.rationale ? 8 : 0) + 4;

      helpers.checkPage(dynamicH + 4);
      let y = helpers.getY();

      // Card container — dynamic height
      doc.setFillColor(252, 252, 255);
      doc.roundedRect(margin, y, maxWidth, dynamicH, 2, 2, 'F');
      doc.setDrawColor(200, 200, 215);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, maxWidth, dynamicH, 2, 2, 'S');

      // Colored header bar
      const cColor = conceptColors[i % conceptColors.length];
      doc.setFillColor(...cColor);
      doc.roundedRect(margin, y, maxWidth, 9, 2, 2, 'F');
      doc.rect(margin, y + 5, maxWidth, 4, 'F');

      // Concept name
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(`Concepto ${i + 1}: ${String(cc.nombre || cc.name || '').slice(0, 40)}`, margin + 4, y + 6);

      // Format badge
      const fmt = String(cc.formato || cc.format || '').toUpperCase();
      if (fmt) {
        const fmtText = fmt.slice(0, 18);
        const fmtWidth = Math.max(24, doc.getTextWidth(fmtText) + 6);
        doc.setFillColor(accentR, accentG, accentB);
        doc.roundedRect(ctx.pageWidth - margin - fmtWidth - 2, y + 2, fmtWidth, 5, 2, 2, 'F');
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(255, 255, 255);
        doc.text(fmtText, ctx.pageWidth - margin - fmtWidth / 2 - 2, y + 5.5, { align: 'center' });
      }

      y += 12;
      // Hook in bold — show ALL lines
      if (hookLines.length > 0) {
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(40, 40, 50);
        for (const hl of hookLines) {
          doc.text(hl, margin + 5, y);
          y += 5;
        }
      }
      // Copy — show ALL lines (no truncation)
      if (copyLines.length > 0) {
        doc.setFont('NotoSans', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 70);
        for (const cl of copyLines) {
          helpers.setY(y);
          helpers.checkPage(5);
          y = helpers.getY();
          doc.text(cl, margin + 5, y);
          y += 4;
        }
      }
      // Why it works
      if (cc.why_it_works || cc.rationale) {
        doc.setFont('NotoSans', 'italic' as any);
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 120);
        const whyText = helpers.stripEmojis(String(cc.why_it_works || cc.rationale));
        const whyLines = doc.splitTextToSize(whyText, maxWidth - 14);
        doc.text(whyLines[0] || '', margin + 5, y + 1);
        y += 6;
      }
      // CTA as button-like element
      if (cc.cta) {
        y += 1;
        const ctaText = String(cc.cta).slice(0, 40);
        const ctaWidth = Math.max(40, doc.getTextWidth(ctaText) + 12);
        doc.setFillColor(...cColor);
        doc.roundedRect(margin + 5, y, ctaWidth, 6, 2, 2, 'F');
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text(ctaText, margin + 5 + ctaWidth / 2, y + 4, { align: 'center' });
        y += 8;
      }

      helpers.setY(y + 3);
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

// ─── BUDGET & FUNNEL SECTION (Charlie Methodology) ──────────────────────────
export function renderBudgetAndFunnel(
  ctx: PdfContext,
  helpers: PdfHelpers,
  budgetData: any
) {
  if (!budgetData || typeof budgetData !== 'object') return;

  const { doc, margin, maxWidth, brandR, brandG, brandB, accentR, accentG, accentB } = ctx;

  helpers.addSectionHeader('I', 'ESTRATEGIA DE INVERSION PUBLICITARIA');

  // Monthly budget highlight
  if (budgetData.monthly_budget_clp) {
    helpers.checkPage(18);
    let y = helpers.getY();
    doc.setFillColor(accentR, accentG, accentB);
    doc.roundedRect(margin, y, maxWidth, 16, 2, 2, 'F');
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('PRESUPUESTO MENSUAL TOTAL', margin + 6, y + 5.5);
    doc.setFontSize(13);
    doc.text('$' + Math.round(budgetData.monthly_budget_clp).toLocaleString('es-CL') + ' CLP', margin + 6, y + 13);
    helpers.setY(y + 19);
  }

  // Channel distribution table
  if (budgetData.channel_distribution) {
    helpers.addSubTitle('Distribucion por Canal');
    const cd = budgetData.channel_distribution;
    const channels = Object.entries(cd);
    const colWs = [40, 20, 35, 75];
    helpers.addTableRow(['Canal', '%', 'Monto CLP', 'Justificacion'], colWs, 0, true);
    for (let i = 0; i < channels.length; i++) {
      const [key, val] = channels[i] as [string, any];
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const pct = val?.percentage ? `${val.percentage}%` : '';
      const amount = val?.amount_clp ? '$' + Math.round(val.amount_clp).toLocaleString('es-CL') : '';
      const just = helpers.stripEmojis(val?.justification || '').slice(0, 45);
      helpers.addTableRow([label, pct, amount, just], colWs, i + 1);
    }
  }

  // Meta Ads Structure — Testing / Scaling / Retargeting cards
  if (budgetData.meta_ads_structure) {
    helpers.addSubTitle('Estructura de Campanas Meta Ads — Metodo Charlie');
    const mas = budgetData.meta_ads_structure;
    const campaigns: { key: string; label: string; color: [number,number,number]; icon: string }[] = [
      { key: 'testing', label: 'TESTING', color: [27, 42, 74], icon: 'LAB' },
      { key: 'scaling', label: 'SCALING', color: [22, 120, 50], icon: 'UP' },
      { key: 'retargeting', label: 'RETARGETING', color: [200, 163, 90], icon: 'RT' },
    ];

    for (const camp of campaigns) {
      const data = mas[camp.key];
      if (!data || typeof data !== 'object') continue;

      helpers.checkPage(45);
      let y = helpers.getY();

      // Card header
      doc.setFillColor(...camp.color);
      doc.roundedRect(margin, y, maxWidth, 10, 2, 2, 'F');
      doc.rect(margin, y + 6, maxWidth, 4, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      const budgetPct = data.budget_percentage ? ` — ${data.budget_percentage}%` : '';
      const budgetAmt = data.budget_clp ? ` ($${Math.round(data.budget_clp).toLocaleString('es-CL')} CLP)` : '';
      doc.text(`${camp.label}${budgetPct}${budgetAmt}`, margin + 5, y + 7);
      y += 12;
      helpers.setY(y);

      // Campaign type
      if (data.campaign_type) {
        helpers.addKeyValue('Tipo de Campana', helpers.stripEmojis(String(data.campaign_type)));
      }

      // Ad sets (testing)
      if (Array.isArray(data.ad_sets)) {
        for (const adSet of data.ad_sets.slice(0, 3)) {
          if (typeof adSet !== 'object') continue;
          helpers.checkPage(14);
          y = helpers.getY();
          doc.setFillColor(245, 246, 252);
          doc.roundedRect(margin + 2, y - 1, maxWidth - 4, 12, 1, 1, 'F');
          doc.setFillColor(...camp.color);
          doc.rect(margin + 2, y - 1, 2, 12, 'F');
          doc.setFont('NotoSans', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(...camp.color);
          doc.text(helpers.stripEmojis(adSet.name || '').slice(0, 40), margin + 7, y + 2.5);
          doc.setFont('NotoSans', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(60, 60, 70);
          if (adSet.variable_tested) doc.text(`Variable: ${helpers.stripEmojis(adSet.variable_tested).slice(0, 50)}`, margin + 7, y + 6.5);
          if (adSet.kill_rule) doc.text(`Kill rule: ${helpers.stripEmojis(adSet.kill_rule).slice(0, 50)}`, margin + 7, y + 10);
          helpers.setY(y + 13);
        }
      }

      // Success metrics (testing)
      if (data.success_metrics && typeof data.success_metrics === 'object') {
        const metrics = Object.entries(data.success_metrics);
        if (metrics.length > 0) {
          helpers.checkPage(10);
          y = helpers.getY();
          const chipW = (maxWidth - 8) / Math.min(metrics.length, 4);
          for (let mi = 0; mi < Math.min(metrics.length, 4); mi++) {
            const cx = margin + 2 + mi * chipW;
            doc.setFillColor(245, 246, 252);
            doc.roundedRect(cx, y, chipW - 2, 8, 1, 1, 'F');
            doc.setFont('NotoSans', 'bold');
            doc.setFontSize(6.5);
            doc.setTextColor(100, 100, 120);
            doc.text(String(metrics[mi][0]).replace(/_/g, ' ').toUpperCase(), cx + 2, y + 3);
            doc.setFont('NotoSans', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...camp.color);
            doc.text(String(metrics[mi][1]), cx + 2, y + 7);
          }
          helpers.setY(y + 10);
        }
      }

      // Rules (scaling)
      if (data.rules) helpers.addBody(`  Reglas: ${helpers.stripEmojis(String(data.rules))}`, 4, 4.5);
      if (data.scale_method) helpers.addBody(`  Metodo: ${helpers.stripEmojis(String(data.scale_method))}`, 4, 4.5);

      // Audiences (retargeting)
      if (Array.isArray(data.audiences)) {
        for (const aud of data.audiences.slice(0, 4)) {
          if (typeof aud === 'object') {
            helpers.addArrowBullet(`${aud.name || ''}: ${helpers.stripEmojis(aud.message || '')}`);
          } else {
            helpers.addArrowBullet(String(aud));
          }
        }
      }

      y = helpers.getY();
      y += 4;
      helpers.setY(y);
    }
  }

  // Google Ads Structure
  if (budgetData.google_ads_structure) {
    helpers.addSubTitle('Estructura Google Ads');
    const gas = budgetData.google_ads_structure;
    const gasCols = [40, 20, 35, 75];
    helpers.addTableRow(['Campana', '%', 'Monto CLP', 'Keywords'], gasCols, 0, true);
    let gasIdx = 1;
    for (const [key, val] of Object.entries(gas)) {
      const v = val as any;
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const pct = v?.budget_percentage ? `${v.budget_percentage}%` : '';
      const amt = v?.budget_clp ? '$' + Math.round(v.budget_clp).toLocaleString('es-CL') : '';
      const kws = Array.isArray(v?.keywords) ? v.keywords.slice(0, 3).join(', ') : '';
      helpers.addTableRow([label, pct, amt, kws], gasCols, gasIdx++);
    }
  }

  // ROAS Projection
  if (budgetData.roas_projection) {
    helpers.addSubTitle('Proyeccion de ROAS a 90 Dias');
    const rp = budgetData.roas_projection;
    const rpPhases = [
      { key: 'day_30', color: [27, 42, 74] as [number,number,number] },
      { key: 'day_60', color: [45, 74, 122] as [number,number,number] },
      { key: 'day_90', color: [22, 120, 50] as [number,number,number] },
    ];
    for (const phase of rpPhases) {
      const pd = rp[phase.key];
      if (!pd || typeof pd !== 'object') continue;
      helpers.checkPage(12);
      let y = helpers.getY();
      doc.setFillColor(245, 246, 252);
      doc.roundedRect(margin, y, maxWidth, 10, 1, 1, 'F');
      doc.setFillColor(...phase.color);
      doc.rect(margin, y, 3, 10, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...phase.color);
      doc.text(`${pd.phase || phase.key} — ROAS: ${pd.roas || 'N/D'}`, margin + 6, y + 4);
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(60, 60, 70);
      if (pd.reasoning) {
        const rl = doc.splitTextToSize(helpers.stripEmojis(String(pd.reasoning)), maxWidth - 14);
        doc.text(rl[0] || '', margin + 6, y + 8);
      }
      helpers.setY(y + 12);
    }
  }

  // Implementation Calendar
  if (budgetData.implementation_calendar) {
    helpers.addSubTitle('Calendario de Implementacion — 90 Dias');
    const cal = budgetData.implementation_calendar;
    const calPhaseStyles: { label: string; color: [number,number,number] }[] = [
      { label: 'FASE 1', color: [27, 42, 74] },
      { label: 'FASE 2', color: [45, 74, 122] },
      { label: 'FASE 3', color: [22, 120, 50] },
    ];
    const calChannelKeys = ['meta_ads', 'google_ads', 'seo', 'email', 'ugc'];
    const calChannelLabels: Record<string, string> = {
      meta_ads: 'Meta Ads', google_ads: 'Google Ads', seo: 'SEO', email: 'Email/Klaviyo', ugc: 'UGC/Influencers'
    };
    const calPhases = Object.entries(cal);
    for (let pi = 0; pi < Math.min(calPhases.length, 3); pi++) {
      const [, phaseData] = calPhases[pi] as [string, any];
      if (!phaseData || typeof phaseData !== 'object') continue;
      const style = calPhaseStyles[pi % calPhaseStyles.length];
      helpers.checkPage(20);
      let y = helpers.getY();
      // Phase header
      doc.setFillColor(...style.color);
      doc.roundedRect(margin, y, maxWidth, 8, 2, 2, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      const days = phaseData.days || '';
      const focus = phaseData.focus || '';
      doc.text(`${style.label} (${days}) — ${focus}`, margin + 5, y + 5.5);
      y += 10;
      helpers.setY(y);
      // Channel actions
      for (const chKey of calChannelKeys) {
        const action = phaseData[chKey];
        if (action) {
          helpers.addKeyValue(calChannelLabels[chKey] || chKey, helpers.stripEmojis(String(action)));
        }
      }
      y = helpers.getY();
      y += 3;
      helpers.setY(y);
    }
  }

  // Weekly Optimization Checklist
  if (Array.isArray(budgetData.weekly_optimization_checklist) && budgetData.weekly_optimization_checklist.length > 0) {
    helpers.addSubTitle('Checklist Semanal de Optimizacion');
    for (const item of budgetData.weekly_optimization_checklist.slice(0, 6)) {
      helpers.addArrowBullet(helpers.stripEmojis(String(item)));
    }
  }
}
