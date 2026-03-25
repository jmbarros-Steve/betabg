/**
 * Steve Platform — CINEMATIC Demo Video
 * Video profesional con títulos animados, callouts y transiciones.
 *
 * Uso: node record-demo-video.cjs
 * Output: demo-video/steve-demo.webm
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────
const APP_URL = 'https://www.steve.cl';
const SUPABASE_URL = 'https://zpswjccsxjtnhetkkqde.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzM2NjgsImV4cCI6MjA4NzIwOTY2OH0.PRkFg5sdmu8kXdL9xtpZFREKgohF9cGrNjWVVwZ7IXw';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYzMzY2OCwiZXhwIjoyMDg3MjA5NjY4fQ.xmTkRrqT7Hg5dPcc6vs6SnwikFvVqSjNAnnhfbQkjhQ';
const TEST_EMAIL = 'patricio.correa@jardindeeva.cl';
const STORAGE_KEY = 'sb-zpswjccsxjtnhetkkqde-auth-token';
const VIDEO_DIR = path.join(__dirname, 'demo-video');

// ─── Helpers ──────────────────────────────────────────────────────────
const pause = (ms) => new Promise(r => setTimeout(r, ms));

async function getSession() {
  console.log('  Autenticando...');
  const r1 = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: TEST_EMAIL }),
  });
  const d1 = await r1.json();
  if (!d1.hashed_token) throw new Error('Magic link failed');
  const r2 = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: d1.hashed_token }),
  });
  const session = await r2.json();
  if (!session.access_token) throw new Error('Verify failed');
  return session;
}

// ─── Name Hider (MutationObserver) ────────────────────────────────────
async function installNameHider(page) {
  await page.evaluate(() => {
    if (window.__nameHiderInstalled) return;
    window.__nameHiderInstalled = true;
    const R = [
      [/Patricio\s*Correa/gi, 'María López'],
      [/Patricio/gi, 'María'],
      [/Correa/gi, 'López'],
      [/patricio\.correa@jardindeeva\.cl/gi, 'demo@mitienda.cl'],
      [/jardindeeva\.cl/gi, 'mitienda.cl'],
      [/Jard[ií]n\s*de\s*Eva/gi, 'Mi Tienda Online'],
      [/Jardin\s*de\s*Eva/gi, 'Mi Tienda Online'],
      [/jardindeeva/gi, 'mitienda'],
    ];
    function fix(text) { let t = text; for (const [rx, rp] of R) t = t.replace(rx, rp); return t; }
    function walk(n) {
      if (n.nodeType === 3) { const f = fix(n.textContent||''); if (f !== n.textContent) n.textContent = f; }
      else if (n.nodeType === 1) { ['alt','title','placeholder'].forEach(a => { const v=n.getAttribute?.(a); if(v){const f=fix(v);if(f!==v)n.setAttribute(a,f);} }); for (const c of n.childNodes) walk(c); }
    }
    walk(document.body);
    new MutationObserver(muts => { for (const m of muts) { if (m.type==='childList') for (const n of m.addedNodes) walk(n); else if (m.type==='characterData') walk(m.target); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(() => walk(document.body), 400);
  });
}

// ─── Overlay System ───────────────────────────────────────────────────
async function injectOverlaySystem(page) {
  await page.evaluate(() => {
    // CSS for all overlays
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

      ::-webkit-scrollbar { display: none !important; }
      body { scrollbar-width: none !important; }
      * { -webkit-font-smoothing: antialiased !important; }

      #__overlay-container {
        position: fixed; inset: 0; z-index: 999999; pointer-events: none;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
      }

      /* ── Scene Title ── */
      .scene-title {
        position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
        border: 1px solid rgba(30, 58, 123, 0.3);
        border-radius: 16px; padding: 16px 32px;
        display: flex; align-items: center; gap: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(30,58,123,0.15);
        opacity: 0; animation: sceneTitleIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        backdrop-filter: blur(20px);
      }
      .scene-title.out { animation: sceneTitleOut 0.4s ease-in forwards; }
      .scene-title .icon { font-size: 28px; }
      .scene-title .text h3 {
        color: white; font-size: 18px; font-weight: 700; margin: 0; letter-spacing: -0.3px;
      }
      .scene-title .text p {
        color: #94a3b8; font-size: 13px; margin: 2px 0 0; font-weight: 400;
      }
      .scene-title .badge {
        background: linear-gradient(135deg, #1E3A7B, #38BDF8);
        color: white; font-size: 11px; font-weight: 700; padding: 4px 10px;
        border-radius: 20px; letter-spacing: 0.5px;
      }

      @keyframes sceneTitleIn {
        from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.95); }
        to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
      }
      @keyframes sceneTitleOut {
        from { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        to { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.98); }
      }

      /* ── Callout Bubble ── */
      .callout-bubble {
        position: absolute; background: white; border-radius: 12px;
        padding: 12px 18px; box-shadow: 0 8px 32px rgba(0,0,0,0.12);
        border: 1px solid #e2e8f0; max-width: 280px;
        opacity: 0; animation: calloutIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards;
      }
      .callout-bubble.out { animation: calloutOut 0.3s ease-in forwards; }
      .callout-bubble p { margin: 0; color: #1e293b; font-size: 13px; font-weight: 500; line-height: 1.4; }
      .callout-bubble .highlight { color: #1E3A7B; font-weight: 700; }
      .callout-bubble::before {
        content: ''; position: absolute; bottom: -8px; left: 24px;
        width: 16px; height: 16px; background: white; transform: rotate(45deg);
        border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;
      }
      @keyframes calloutIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes calloutOut {
        from { opacity: 1; } to { opacity: 0; }
      }

      /* ── Progress Bar ── */
      #__progress-bar {
        position: absolute; bottom: 0; left: 0; right: 0; height: 4px;
        background: rgba(255,255,255,0.1);
      }
      #__progress-fill {
        height: 100%; background: linear-gradient(90deg, #1E3A7B, #38BDF8, #38BDF8);
        border-radius: 0 2px 2px 0; transition: width 0.8s ease-out;
        box-shadow: 0 0 12px rgba(30,58,123,0.5);
      }

      /* ── Intro Screen ── */
      #__intro-screen {
        position: absolute; inset: 0;
        background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
        display: flex; align-items: center; justify-content: center;
        flex-direction: column; z-index: 10;
      }
      #__intro-screen .logo-ring {
        width: 120px; height: 120px; border-radius: 50%;
        background: linear-gradient(135deg, #1E3A7B, #38BDF8);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 0 80px rgba(30,58,123,0.4);
        animation: logoPulse 2s ease-in-out infinite;
      }
      #__intro-screen .logo-ring img {
        width: 100px; height: 100px; border-radius: 50%; object-fit: cover;
      }
      #__intro-screen h1 {
        color: white; font-size: 48px; font-weight: 800; margin: 24px 0 8px;
        letter-spacing: -1px; opacity: 0;
        animation: fadeUp 0.8s ease-out 0.5s forwards;
      }
      #__intro-screen .subtitle {
        color: #94a3b8; font-size: 18px; font-weight: 400; opacity: 0;
        animation: fadeUp 0.8s ease-out 0.8s forwards;
      }
      #__intro-screen .tagline {
        color: #1E3A7B; font-size: 14px; font-weight: 600; letter-spacing: 3px;
        text-transform: uppercase; margin-top: 32px; opacity: 0;
        animation: fadeUp 0.8s ease-out 1.1s forwards;
      }
      @keyframes logoPulse {
        0%, 100% { box-shadow: 0 0 40px rgba(30,58,123,0.3); }
        50% { box-shadow: 0 0 80px rgba(56,189,248,0.6); }
      }
      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* ── Outro Screen ── */
      #__outro-screen {
        position: absolute; inset: 0;
        background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
        display: flex; align-items: center; justify-content: center;
        flex-direction: column; z-index: 10; opacity: 0;
        transition: opacity 1s ease-in;
      }
      #__outro-screen.visible { opacity: 1; }
      #__outro-screen h1 {
        color: white; font-size: 42px; font-weight: 800; letter-spacing: -1px;
        opacity: 0; animation: fadeUp 0.8s ease-out 0.3s forwards;
      }
      #__outro-screen .cta {
        background: linear-gradient(135deg, #1E3A7B, #38BDF8);
        color: white; font-size: 18px; font-weight: 700;
        padding: 16px 48px; border-radius: 12px; margin-top: 24px;
        opacity: 0; animation: fadeUp 0.8s ease-out 0.7s forwards;
        box-shadow: 0 8px 32px rgba(30,58,123,0.4);
      }
      #__outro-screen .url {
        color: #94a3b8; font-size: 16px; margin-top: 16px; opacity: 0;
        animation: fadeUp 0.8s ease-out 1s forwards;
      }

      /* ── Transition Wipe ── */
      #__wipe {
        position: absolute; inset: 0;
        background: linear-gradient(135deg, #0f172a, #1e1b4b);
        transform: translateX(-100%); z-index: 5;
        transition: none;
      }
      #__wipe.in { animation: wipeIn 0.5s cubic-bezier(0.7, 0, 0.3, 1) forwards; }
      #__wipe.out { animation: wipeOut 0.5s cubic-bezier(0.7, 0, 0.3, 1) forwards; }
      @keyframes wipeIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
      @keyframes wipeOut { from { transform: translateX(0); } to { transform: translateX(100%); } }

      /* ── Cursor Dot ── */
      #__cursor {
        position: absolute; width: 24px; height: 24px;
        border-radius: 50%; background: rgba(56,189,248,0.6);
        border: 2px solid white; box-shadow: 0 0 20px rgba(30,58,123,0.5);
        transform: translate(-50%, -50%); transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 8; display: none;
      }
      #__cursor.click {
        animation: cursorClick 0.3s ease-out;
      }
      @keyframes cursorClick {
        0% { transform: translate(-50%,-50%) scale(1); }
        50% { transform: translate(-50%,-50%) scale(1.8); opacity: 0.5; }
        100% { transform: translate(-50%,-50%) scale(1); }
      }

      /* ── Feature Counter ── */
      .feature-counter {
        position: absolute; top: 20px; right: 24px;
        background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px);
        border: 1px solid rgba(30,58,123,0.2); border-radius: 10px;
        padding: 8px 16px; display: flex; align-items: center; gap: 10px;
        opacity: 0; animation: fadeUp 0.4s ease-out forwards;
      }
      .feature-counter .num { color: #38BDF8; font-size: 14px; font-weight: 800; }
      .feature-counter .sep { color: #475569; font-size: 12px; }
      .feature-counter .total { color: #64748b; font-size: 14px; font-weight: 500; }
    `;
    document.head.appendChild(style);

    // Container
    const container = document.createElement('div');
    container.id = '__overlay-container';
    container.innerHTML = `
      <div id="__progress-bar"><div id="__progress-fill" style="width:0%"></div></div>
      <div id="__wipe"></div>
      <div id="__cursor"></div>
    `;
    document.body.appendChild(container);
  });
}

// ─── Show Scene Title ─────────────────────────────────────────────────
async function showSceneTitle(page, icon, title, subtitle, step, total) {
  await page.evaluate(({ icon, title, subtitle, step, total }) => {
    const c = document.getElementById('__overlay-container');
    // Remove old titles
    c.querySelectorAll('.scene-title, .feature-counter').forEach(el => el.remove());

    const card = document.createElement('div');
    card.className = 'scene-title';
    card.innerHTML = `
      <span class="icon">${icon}</span>
      <div class="text"><h3>${title}</h3><p>${subtitle}</p></div>
      <span class="badge">${step}/${total}</span>
    `;
    c.appendChild(card);

    // Feature counter
    const counter = document.createElement('div');
    counter.className = 'feature-counter';
    counter.innerHTML = `<span class="num">${step}</span><span class="sep">/</span><span class="total">${total}</span>`;
    c.appendChild(counter);

    // Update progress bar
    document.getElementById('__progress-fill').style.width = `${(step / total) * 100}%`;
  }, { icon, title, subtitle, step, total });
}

async function hideSceneTitle(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.scene-title').forEach(el => el.classList.add('out'));
    document.querySelectorAll('.callout-bubble').forEach(el => el.classList.add('out'));
    setTimeout(() => {
      document.querySelectorAll('.scene-title.out, .callout-bubble.out, .feature-counter').forEach(el => el.remove());
    }, 500);
  });
}

// ─── Show Callout ─────────────────────────────────────────────────────
async function showCallout(page, x, y, html) {
  await page.evaluate(({ x, y, html }) => {
    const c = document.getElementById('__overlay-container');
    const bubble = document.createElement('div');
    bubble.className = 'callout-bubble';
    bubble.style.left = x + 'px';
    bubble.style.top = y + 'px';
    bubble.innerHTML = `<p>${html}</p>`;
    c.appendChild(bubble);
  }, { x, y, html });
}

// ─── Transition Wipe ──────────────────────────────────────────────────
async function wipeTransition(page) {
  await page.evaluate(() => {
    const wipe = document.getElementById('__wipe');
    wipe.className = '';
    void wipe.offsetWidth;
    wipe.classList.add('in');
  });
  await pause(500);
  // Wipe covers screen — do navigation here
}

async function wipeOut(page) {
  await page.evaluate(() => {
    const wipe = document.getElementById('__wipe');
    wipe.className = '';
    void wipe.offsetWidth;
    wipe.classList.add('out');
  });
  await pause(500);
}

// ─── Cursor Animation ─────────────────────────────────────────────────
async function moveCursor(page, x, y) {
  await page.evaluate(({ x, y }) => {
    const cursor = document.getElementById('__cursor');
    cursor.style.display = 'block';
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
  }, { x, y });
  await pause(400);
}

async function clickCursor(page) {
  await page.evaluate(() => {
    const cursor = document.getElementById('__cursor');
    cursor.classList.remove('click');
    void cursor.offsetWidth;
    cursor.classList.add('click');
  });
  await pause(300);
}

async function hideCursor(page) {
  await page.evaluate(() => {
    document.getElementById('__cursor').style.display = 'none';
  });
}

// ─── Smooth Scroll ────────────────────────────────────────────────────
async function smoothScroll(page, targetY, duration = 1000) {
  await page.evaluate(({ targetY, duration }) => {
    return new Promise(resolve => {
      const start = window.scrollY;
      const dist = targetY - start;
      const t0 = performance.now();
      function step(t) {
        const p = Math.min((t - t0) / duration, 1);
        const ease = p < 0.5 ? 2*p*p : -1+(4-2*p)*p;
        window.scrollTo(0, start + dist * ease);
        if (p < 1) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    });
  }, { targetY, duration });
}

// ─── Tab Navigation ───────────────────────────────────────────────────
async function clickPrimaryTab(page, label) {
  try {
    const btn = page.locator('.hidden.md\\:flex > button').filter({ hasText: label }).first();
    const box = await btn.boundingBox();
    if (box) {
      await moveCursor(page, box.x + box.width/2, box.y + box.height/2);
      await clickCursor(page);
    }
    await btn.click();
    await pause(1500);
    await installNameHider(page);
  } catch (e) {
    console.log(`  !! Tab "${label}" no encontrado`);
  }
}

async function clickSecondaryTab(page, label) {
  try {
    const trigger = page.locator('.hidden.md\\:flex button:has(svg.lucide-chevron-down)').first();
    const tBox = await trigger.boundingBox();
    if (tBox) {
      await moveCursor(page, tBox.x + tBox.width/2, tBox.y + tBox.height/2);
      await clickCursor(page);
    }
    await trigger.click();
    await pause(500);
    const item = page.locator('[role="menuitem"]').filter({ hasText: label }).first();
    await item.waitFor({ state: 'visible', timeout: 3000 });
    const iBox = await item.boundingBox();
    if (iBox) {
      await moveCursor(page, iBox.x + iBox.width/2, iBox.y + iBox.height/2);
      await clickCursor(page);
    }
    await item.click();
    await pause(1500);
    await installNameHider(page);
  } catch (e) {
    console.log(`  !! Tab "${label}" fallo`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SCENES DEFINITION
// ═══════════════════════════════════════════════════════════════════════
const SCENES = [
  {
    id: 'metrics', label: 'Métricas', type: 'primary',
    icon: '📊', title: 'Dashboard de Métricas',
    subtitle: 'KPIs de todas tus campañas en tiempo real',
    callout: { x: 200, y: 200, html: '<span class="highlight">ROAS, CPA, CTR</span> — todo sincronizado automáticamente' },
    scroll: 500,
  },
  {
    id: 'steve', label: 'Steve', type: 'primary',
    icon: '🤖', title: 'Steve AI Chat',
    subtitle: 'Tu consultor de marketing 24/7',
    callout: { x: 300, y: 250, html: 'Pregúntale cualquier cosa sobre tus <span class="highlight">campañas y estrategia</span>' },
    typeMessage: 'Analiza mis campañas y dame 3 recomendaciones',
  },
  {
    id: 'copies', label: 'Meta Ads', type: 'secondary',
    icon: '📱', title: 'Meta Ads Manager',
    subtitle: 'Crea y gestiona campañas de Facebook e Instagram',
    callout: { x: 200, y: 200, html: 'Crea campañas, gestiona audiencias y <span class="highlight">analiza competencia</span>' },
    scroll: 400,
  },
  {
    id: 'google', label: 'Google Ads', type: 'secondary',
    icon: '🔍', title: 'Google Ads',
    subtitle: 'Genera copies para Search, Display y Shopping',
    callout: { x: 200, y: 200, html: 'Headlines y descripciones <span class="highlight">optimizados por IA</span>' },
  },
  {
    id: 'shopify', label: 'Shopify', type: 'secondary',
    icon: '🛍️', title: 'Shopify Analytics',
    subtitle: 'Ventas, productos top y reportes en tiempo real',
    callout: { x: 200, y: 200, html: 'Sincroniza tu <span class="highlight">tienda Shopify</span> en un click' },
    scroll: 400,
  },
  {
    id: 'klaviyo', label: 'Klaviyo', type: 'secondary',
    icon: '📧', title: 'Klaviyo Studio',
    subtitle: 'Campañas y flujos de email marketing',
    callout: { x: 200, y: 200, html: 'Diseña flujos de <span class="highlight">email automatizado</span> con IA' },
  },
  {
    id: 'email', label: 'Steve Mail', type: 'secondary',
    icon: '✉️', title: 'Steve Mail',
    subtitle: 'Editor de emails nativo con drag & drop',
    callout: { x: 200, y: 200, html: 'Editor visual tipo <span class="highlight">Klaviyo</span> integrado' },
  },
  {
    id: 'deepdive', label: 'Deep Dive', type: 'secondary',
    icon: '🔬', title: 'Análisis de Competencia',
    subtitle: 'Escanea anuncios y estrategias de competidores',
    callout: { x: 200, y: 200, html: 'Web scraping AI para ver <span class="highlight">qué hacen tus competidores</span>' },
    scroll: 300,
  },
  {
    id: 'brief', label: 'Brief', type: 'primary',
    icon: '📋', title: 'Brand Brief',
    subtitle: 'Tu marca documentada para mejores campañas',
    callout: { x: 200, y: 200, html: 'Steve usa tu brief para <span class="highlight">personalizar todo</span>' },
    scroll: 400,
  },
  {
    id: 'connections', label: 'Conexiones', type: 'primary',
    icon: '🔗', title: 'Hub de Conexiones',
    subtitle: 'Shopify, Meta, Google y Klaviyo conectados',
    callout: { x: 200, y: 200, html: 'Conecta <span class="highlight">4 plataformas</span> con OAuth seguro' },
  },
];

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });
  // Clean old videos
  fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm')).forEach(f => fs.unlinkSync(path.join(VIDEO_DIR, f)));

  console.log('\n========================================');
  console.log('  STEVE CINEMATIC DEMO');
  console.log('========================================\n');

  const session = await getSession();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1920, height: 1080 } },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });

  const page = await context.newPage();

  // ═══════════════════════════════════════════════════════════════════
  // INTRO SCREEN (3 seconds)
  // ═══════════════════════════════════════════════════════════════════
  console.log('[INTRO] Pantalla de inicio...');
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Inject session
  await page.evaluate(({ session, key }) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: session.access_token, refresh_token: session.refresh_token,
      expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user: session.user,
    }));
  }, { session, key: STORAGE_KEY });

  // Show intro screen
  await page.evaluate(() => {
    const intro = document.createElement('div');
    intro.id = '__intro-screen';
    intro.innerHTML = `
      <div class="logo-ring"><img src="/logo-steve.png" alt="Steve" /></div>
      <h1>Steve</h1>
      <div class="subtitle">Tu agencia de marketing AI</div>
      <div class="tagline">Product Tour 2026</div>
    `;
    document.body.style.overflow = 'hidden';
    document.body.appendChild(intro);
  });
  await injectOverlaySystem(page);
  await pause(4000);

  // Navigate to portal behind intro
  await page.goto(`${APP_URL}/portal`, { waitUntil: 'networkidle', timeout: 45000 });
  await installNameHider(page);
  await injectOverlaySystem(page);
  await pause(2000);

  // Re-inject intro on top (navigation cleared it)
  await page.evaluate(() => {
    if (!document.getElementById('__intro-screen')) {
      const intro = document.createElement('div');
      intro.id = '__intro-screen';
      intro.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,#0f172a,#1e1b4b,#0f172a);display:flex;align-items:center;justify-content:center;flex-direction:column;z-index:999999;';
      intro.innerHTML = `
        <div style="width:120px;height:120px;border-radius:50%;background:linear-gradient(135deg,#1E3A7B,#38BDF8);display:flex;align-items:center;justify-content:center;box-shadow:0 0 80px rgba(30,58,123,0.4)">
          <img src="/logo-steve.png" alt="Steve" style="width:100px;height:100px;border-radius:50%;object-fit:cover" />
        </div>
        <h1 style="color:white;font-size:48px;font-weight:800;margin:24px 0 8px;letter-spacing:-1px;font-family:system-ui">Steve</h1>
        <p style="color:#94a3b8;font-size:18px">Tu agencia de marketing AI</p>
        <p style="color:#1E3A7B;font-size:14px;font-weight:600;letter-spacing:3px;text-transform:uppercase;margin-top:32px">Product Tour 2026</p>
      `;
      document.body.appendChild(intro);
    }
  });
  await pause(2000);

  // Fade out intro
  await page.evaluate(() => {
    const intro = document.getElementById('__intro-screen');
    if (intro) {
      intro.style.transition = 'opacity 1s ease-out';
      intro.style.opacity = '0';
      setTimeout(() => intro.remove(), 1000);
    }
  });
  await pause(1500);

  // Dismiss setup tracker
  try {
    const collapse = page.locator('button[aria-label="Minimizar"], button:has-text("Minimizar")').first();
    if (await collapse.isVisible().catch(() => false)) { await collapse.click(); await pause(300); }
  } catch (e) {}

  console.log('[PORTAL] Listo. Grabando escenas...\n');

  // ═══════════════════════════════════════════════════════════════════
  // SCENES LOOP
  // ═══════════════════════════════════════════════════════════════════
  const total = SCENES.length;

  for (let i = 0; i < total; i++) {
    const scene = SCENES[i];
    console.log(`[${i+1}/${total}] ${scene.title}`);

    // Wipe transition (skip first scene)
    if (i > 0) {
      await hideSceneTitle(page);
      await pause(300);
      await wipeTransition(page);
    }

    // Navigate using Playwright locators (proven to work)
    await hideCursor(page);
    if (scene.type === 'primary') {
      try {
        const btn = page.locator('.hidden.md\\:flex > button').filter({ hasText: scene.label }).first();
        await btn.waitFor({ state: 'visible', timeout: 5000 });
        await btn.click();
      } catch (e) { console.log(`     !! primary "${scene.label}" failed`); }
    } else {
      try {
        const trigger = page.locator('.hidden.md\\:flex button:has(svg.lucide-chevron-down)').first();
        await trigger.waitFor({ state: 'visible', timeout: 5000 });
        await trigger.click();
        await pause(600);
        const item = page.locator('[role="menuitem"]').filter({ hasText: scene.label }).first();
        await item.waitFor({ state: 'visible', timeout: 3000 });
        await item.click();
      } catch (e) { console.log(`     !! secondary "${scene.label}" failed: ${e.message.split('\n')[0]}`); }
    }

    await pause(2000);
    await installNameHider(page);
    await smoothScroll(page, 0, 300);

    // Wipe out to reveal
    if (i > 0) await wipeOut(page);
    await pause(500);

    // Show scene title
    await showSceneTitle(page, scene.icon, scene.title, scene.subtitle, i + 1, total);
    await pause(2000);

    // Show callout
    if (scene.callout) {
      await showCallout(page, scene.callout.x, scene.callout.y, scene.callout.html);
      await pause(2500);
    }

    // Type message in chat if applicable
    if (scene.typeMessage) {
      try {
        const chatInput = page.locator('textarea').first();
        if (await chatInput.isVisible().catch(() => false)) {
          await chatInput.click();
          await pause(400);
          await chatInput.type(scene.typeMessage, { delay: 35 });
          await pause(1000);
          await page.keyboard.press('Enter');
          await pause(5000);
          await installNameHider(page);
        }
      } catch (e) {}
    }

    // Scroll if needed
    if (scene.scroll) {
      await pause(500);
      await smoothScroll(page, scene.scroll, 1500);
      await pause(2000);
      await smoothScroll(page, 0, 800);
    }

    await pause(1500);
  }

  // ═══════════════════════════════════════════════════════════════════
  // OUTRO
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n[OUTRO] Pantalla final...');
  await hideSceneTitle(page);
  await hideCursor(page);

  await page.evaluate(() => {
    const c = document.getElementById('__overlay-container');
    const outro = document.createElement('div');
    outro.id = '__outro-screen';
    outro.innerHTML = `
      <div style="width:100px;height:100px;border-radius:50%;background:linear-gradient(135deg,#1E3A7B,#38BDF8);display:flex;align-items:center;justify-content:center;box-shadow:0 0 60px rgba(30,58,123,0.4);margin-bottom:16px;opacity:0;animation:fadeUp 0.6s ease-out 0.2s forwards">
        <img src="/logo-steve.png" alt="Steve" style="width:80px;height:80px;border-radius:50%;object-fit:cover" />
      </div>
      <h1>Tu marketing merece ser inteligente</h1>
      <div class="cta">Agenda una reunión</div>
      <div class="url">steve.cl</div>
    `;
    c.appendChild(outro);
    requestAnimationFrame(() => outro.classList.add('visible'));
  });

  await pause(5000);

  // ═══════════════════════════════════════════════════════════════════
  // SAVE
  // ═══════════════════════════════════════════════════════════════════
  console.log('Finalizando...');
  await page.close();

  const video = page.video();
  if (video) {
    const vp = await video.path();
    const fp = path.join(VIDEO_DIR, 'steve-demo.webm');
    await pause(2000);
    try { fs.copyFileSync(vp, fp); } catch (e) {}
    // Clean temp
    fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm') && f !== 'steve-demo.webm').forEach(f => fs.unlinkSync(path.join(VIDEO_DIR, f)));
    const size = fs.statSync(fp).size;
    console.log(`\nVIDEO: ${fp}`);
    console.log(`SIZE: ${(size/1024/1024).toFixed(1)} MB\n`);
  }

  await context.close();
  await browser.close();
  console.log('Done!\n');
}

main().catch(err => { console.error('ERROR:', err); process.exit(1); });
