import { chromium } from '@playwright/test';

const BASE_URL = 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'qa-1773278673290@stevetest.dev';
const PASS = 'QaTest2026!$';

const browser = await chromium.launch();
const page = await browser.newPage();

// Login
await page.goto(`${BASE_URL}/auth`);
await page.waitForTimeout(2000);
await page.locator('#email').fill(EMAIL);
await page.locator('#password').fill(PASS);
await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
await page.waitForURL('**/portal**', { timeout: 15000 });
await page.waitForTimeout(8000);
const omitir = page.getByText('Omitir', { exact: true });
if (await omitir.isVisible({ timeout: 3000 }).catch(() => false)) await omitir.click();
await page.waitForTimeout(1000);

// Steve tab
await page.locator('button').filter({ hasText: 'Steve' }).first().click();
await page.waitForTimeout(5000);
console.log('[QA] Ready');

// ── Helpers ──
async function chat(msg, label) {
  const input = page.locator('input.flex-1').first();
  await input.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(2000);
  await input.click();
  await input.fill('');
  await input.type(msg, { delay: 5 });
  await page.waitForTimeout(300);
  await input.press('Enter');
  await page.waitForTimeout(2000);
  const val = await input.inputValue().catch(() => msg);
  if (val.length > 5) {
    const btn = page.locator('button[type="submit"].bg-blue-600').first();
    await btn.click().catch(() => {});
  }
  await page.waitForTimeout(15000);
  console.log(`[QA] ${label}`);
}

async function submitForm(label) {
  const enviar = page.locator('button:has-text("Enviar respuesta")');
  if (await enviar.isVisible({ timeout: 3000 }).catch(() => false)) {
    await enviar.click();
    await page.waitForTimeout(15000);
    console.log(`[QA] ${label} — submitted`);
    return true;
  }
  return false;
}

// ── Q2: Numbers ──
// Fill input fields
for (const [ph, val] of [['35.000','45000'],['12.000','18000'],['4.000','4500']]) {
  const inp = page.locator(`input[placeholder*="${ph}"]`).first();
  if (await inp.isVisible({ timeout: 3000 }).catch(() => false)) {
    await inp.click(); await inp.fill(''); await inp.type(val, { delay: 10 });
  }
}
// Handle Radix UI Select triggers (button with role="combobox")
const comboButtons = page.locator('button[role="combobox"]');
const cbCount = await comboButtons.count();
for (let i = 0; i < cbCount; i++) {
  const btn = comboButtons.nth(i);
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click({ force: true });
    await page.waitForTimeout(500);
    const option = page.locator('[role="option"]').first();
    if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
      await option.click();
      await page.waitForTimeout(300);
    }
  }
}
if (!await submitForm('Q2 Numbers')) {
  await chat('Precio $45.000, costo $18.000, envío $4.500. Fase crecimiento, presupuesto $500.000.', 'Q2 fallback');
}
await page.screenshot({ path: 'e2e/screenshots/f01-q2.png', fullPage: true });

// ── Q3: Sales channels ──
const pctInputs = page.locator('input[placeholder="0"]');
const pctCount = await pctInputs.count();
if (pctCount >= 6) {
  for (let i = 0; i < 6; i++) {
    await pctInputs.nth(i).click();
    await pctInputs.nth(i).fill('');
    await pctInputs.nth(i).type(['40','20','10','10','10','10'][i], { delay: 10 });
  }
  await submitForm('Q3 Channels');
} else {
  await chat('Shopify 40%, Marketplaces 20%, física 10%, WhatsApp 10%, Instagram 10%, Facebook 10%.', 'Q3 fallback');
}
await page.screenshot({ path: 'e2e/screenshots/f02-q3.png', fullPage: true });

// ── Q4: Persona ──
for (const [ph, val] of [['María','Carlos'],['32','28'],['Mujer','Hombre'],['Santiago','Santiago'],['Diseñadora','Ingeniero'],['1.500.000','2500000'],['Soltera','Soltero'],['Verse bien','Mejor gaming']]) {
  const inp = page.locator(`input[placeholder*="${ph}"]`).first();
  if (await inp.isVisible({ timeout: 2000 }).catch(() => false)) {
    await inp.click(); await inp.fill(''); await inp.type(val, { delay: 10 });
  }
}
if (!await submitForm('Q4 Persona')) {
  await chat('Carlos, 28, hombre, Santiago, ingeniero, $2.5M, soltero. Compra para mejor gaming.', 'Q4 fallback');
}
await page.screenshot({ path: 'e2e/screenshots/f03-q4.png', fullPage: true });

// ── Q5-Q8: Free text ──
await chat('Gamers chilenos pagan precios inflados por periféricos de mala calidad importados. Fallan en 3 meses sin garantía ni soporte en español.', 'Q5 Pain');
await chat('"Es muy caro", "¿Y si falla?", "Prefiero Amazon". Desconfían de tiendas locales.', 'Q6 Words');
await chat('Setup premium con garantía 2 años, soporte español 24/7, guías personalizadas. Comunidad gamer seria.', 'Q7 Transform');
await chat('Siguen Auronplay, TheGrefg. Reddit, Discord. Marcas: Razer, Logitech, HyperX. Comparan en Solotodo.', 'Q8 Lifestyle');
await page.screenshot({ path: 'e2e/screenshots/f04-q8.png', fullPage: true });

// ── Q9: Competitors ──
for (const [ph, val] of [['Cannon','PCFactory'],['cannonhome','pcfactory.cl'],['Intime','AllGamers'],['intime','allgamers.cl'],['Marca X','GamerZone'],['marcax','gamerzone.cl']]) {
  const inp = page.locator(`input[placeholder*="${ph}"]`).first();
  if (await inp.isVisible({ timeout: 2000 }).catch(() => false)) {
    await inp.click(); await inp.fill(''); await inp.type(val, { delay: 10 });
  }
}
if (!await submitForm('Q9 Competitors')) {
  await chat('PCFactory pcfactory.cl, AllGamers allgamers.cl, GamerZone gamerzone.cl.', 'Q9 fallback');
}
await page.screenshot({ path: 'e2e/screenshots/f05-q9.png', fullPage: true });

// ── Q10: Competitor weakness ──
const textareas = page.locator('textarea');
const taCount = await textareas.count();
if (taCount >= 4) {
  const vals = ['Envío lento 7 días','Nosotros 24h Santiago','No dan garantía real','Nosotros 2 años garantía','Precios inflados','Importamos directo'];
  for (let i = 0; i < Math.min(taCount, vals.length); i++) {
    await textareas.nth(i).click();
    await textareas.nth(i).fill('');
    await textareas.nth(i).type(vals[i], { delay: 5 });
  }
  await submitForm('Q10 Weakness');
} else {
  await chat('PCFactory envío lento (nosotros 24h). AllGamers sin garantía (nosotros 2 años). GamerZone precios inflados (importamos directo).', 'Q10 fallback');
}
await page.screenshot({ path: 'e2e/screenshots/f06-q10.png', fullPage: true });

// ── Q11-Q15: Free text ──
await chat('Únicos en Chile: garantía 2 años periféricos gamer, soporte 24/7 español, entrega 24h. Importamos directo.', 'Q11 Advantage');
await chat('Setup guide personalizado + stickers exclusivos. "Mejor setup gamer de Chile, garantizado o devolvemos dinero".', 'Q12 Purple Cow');
await chat('Villano: tiendas chinas sin garantía. Nuestra garantía: 2 años total + soporte 24/7 + envío gratis reemplazo.', 'Q13 Villain');
await chat('2000+ reviews 5 estrellas. 15k seguidores IG. Tono gamer, cercano, técnico accesible. Humor y memes.', 'Q14 Proof');
await chat('Negro + verde neón #00FF41. Minimalista tech. Sans-serif moderna. Logo gamepad estilizado.', 'Q15 Identity');
await page.screenshot({ path: 'e2e/screenshots/f07-q15.png', fullPage: true });

// ── Q16: Assets ──
await chat('No tengo fotos ahora, las subo después.', 'Q16 Assets');
await page.screenshot({ path: 'e2e/screenshots/f08-q16.png', fullPage: true });

// ── Wait for analysis ──
console.log('[QA] Questions done. Checking for analysis...');
const analysisText = page.locator('text=/analizando|investigando|Fase|procesando/i');
if (await analysisText.first().isVisible({ timeout: 30000 }).catch(() => false)) {
  console.log('[QA] Analysis phase detected — waiting...');
  const complete = page.locator('text=/Análisis completo|Brief.*listo|pestañas Brief/i');
  await complete.waitFor({ state: 'visible', timeout: 300000 }).catch(() => {
    console.log('[QA] Analysis wait timeout');
  });
}
await page.waitForTimeout(5000);
await page.screenshot({ path: 'e2e/screenshots/f09-analysis.png', fullPage: true });

// ── Check Brief ──
await page.locator('button').filter({ hasText: 'Brief' }).first().click();
await page.waitForTimeout(8000);
await page.screenshot({ path: 'e2e/screenshots/f10-brief.png', fullPage: true });
const progress = await page.locator('text=/\\d+%/').first().textContent().catch(() => '?');
console.log(`[QA] BRIEF PROGRESS: ${progress}`);

await browser.close();
console.log('[QA] DONE');
