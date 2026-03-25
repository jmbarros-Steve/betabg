/**
 * Steve Platform — Screenshot Capture
 * Captura screenshots de cada módulo del portal para la página de funcionalidades.
 *
 * Uso: node capture-screenshots.cjs
 * Output: public/screenshots/{id}.png (10 imágenes)
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
const SCREENSHOT_DIR = path.join(__dirname, 'public', 'screenshots');

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
      [/Patricio\s*Correa/gi, 'Maria Lopez'],
      [/Patricio/gi, 'Maria'],
      [/Correa/gi, 'Lopez'],
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

// ─── Tab Navigation ───────────────────────────────────────────────────
async function clickPrimaryTab(page, label) {
  try {
    const btn = page.locator('.hidden.md\\:flex > button').filter({ hasText: label }).first();
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
    await pause(2000);
    await installNameHider(page);
  } catch (e) {
    console.log(`  !! Tab primario "${label}" no encontrado`);
  }
}

async function clickSecondaryTab(page, label) {
  try {
    const trigger = page.locator('.hidden.md\\:flex button:has(svg.lucide-chevron-down)').first();
    await trigger.waitFor({ state: 'visible', timeout: 5000 });
    await trigger.click();
    await pause(600);
    const item = page.locator('[role="menuitem"]').filter({ hasText: label }).first();
    await item.waitFor({ state: 'visible', timeout: 3000 });
    await item.click();
    await pause(2000);
    await installNameHider(page);
  } catch (e) {
    console.log(`  !! Tab secundario "${label}" fallo: ${e.message.split('\n')[0]}`);
  }
}

// ─── Scenes ───────────────────────────────────────────────────────────
const MODULES = [
  { id: 'metrics',    label: 'Metricas',   type: 'primary' },
  { id: 'steve-chat', label: 'Steve',      type: 'primary' },
  { id: 'meta-ads',   label: 'Meta Ads',   type: 'secondary' },
  { id: 'google-ads', label: 'Google Ads', type: 'secondary' },
  { id: 'shopify',    label: 'Shopify',    type: 'secondary' },
  { id: 'klaviyo',    label: 'Klaviyo',    type: 'secondary' },
  { id: 'steve-mail', label: 'Steve Mail', type: 'secondary' },
  { id: 'deep-dive',  label: 'Deep Dive',  type: 'secondary' },
  { id: 'brand-brief',label: 'Brief',      type: 'primary' },
  { id: 'connections', label: 'Conexiones', type: 'primary' },
];

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('\n========================================');
  console.log('  STEVE SCREENSHOT CAPTURE');
  console.log('========================================\n');

  const session = await getSession();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });

  const page = await context.newPage();

  // Navigate to landing and inject session
  console.log('[AUTH] Inyectando sesion...');
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(({ session, key }) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Math.floor(Date.now()/1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: session.user,
    }));
  }, { session, key: STORAGE_KEY });

  // Navigate to portal
  console.log('[PORTAL] Navegando al portal...');
  await page.goto(`${APP_URL}/portal`, { waitUntil: 'networkidle', timeout: 45000 });
  await installNameHider(page);
  await pause(3000);

  // Hide scrollbar for clean screenshots
  await page.addStyleTag({ content: '::-webkit-scrollbar { display: none !important; } body { scrollbar-width: none !important; }' });

  // Dismiss setup tracker if visible
  try {
    const collapse = page.locator('button[aria-label="Minimizar"], button:has-text("Minimizar")').first();
    if (await collapse.isVisible().catch(() => false)) { await collapse.click(); await pause(500); }
  } catch (e) {}

  console.log('[CAPTURE] Capturando screenshots...\n');

  // Capture each module
  for (let i = 0; i < MODULES.length; i++) {
    const mod = MODULES[i];
    console.log(`  [${i+1}/${MODULES.length}] ${mod.id} (${mod.label})...`);

    if (mod.type === 'primary') {
      await clickPrimaryTab(page, mod.label);
    } else {
      await clickSecondaryTab(page, mod.label);
    }

    await pause(1500);
    await installNameHider(page);

    // Scroll to top for consistent screenshots
    await page.evaluate(() => window.scrollTo(0, 0));
    await pause(500);

    const filePath = path.join(SCREENSHOT_DIR, `${mod.id}.png`);
    await page.screenshot({ path: filePath, type: 'png' });
    console.log(`    -> ${filePath}`);
  }

  await browser.close();

  // Summary
  const files = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'));
  console.log(`\n========================================`);
  console.log(`  ${files.length} screenshots capturados`);
  console.log(`  Directorio: ${SCREENSHOT_DIR}`);
  console.log('========================================\n');
}

main().catch(err => { console.error('ERROR:', err); process.exit(1); });
