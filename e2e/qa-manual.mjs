import { chromium } from '@playwright/test';

const BASE_URL = 'https://betabgnuevosupa.vercel.app';
const ts = Date.now();
const EMAIL = `qa-${ts}@stevetest.dev`;
const PASS = 'QaTest2026!$';

console.log(`[QA] Email: ${EMAIL}`);

const browser = await chromium.launch();
const page = await browser.newPage();

// Step 1: Signup
await page.goto(`${BASE_URL}/auth`);
await page.waitForTimeout(2000);
await page.getByText('¿No tienes cuenta? Regístrate').click();
await page.waitForTimeout(1000);
await page.locator('#email').fill(EMAIL);
await page.locator('#password').fill(PASS);
await page.getByRole('button', { name: 'Crear Cuenta' }).click();
await page.waitForURL('**/portal**', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(8000);
await page.screenshot({ path: 'e2e/screenshots/m01-signup.png', fullPage: true });
console.log(`[QA] Step 1 done — URL: ${page.url()}`);

// Step 2: Dismiss onboarding
const omitir = page.getByText('Omitir', { exact: true });
if (await omitir.isVisible({ timeout: 5000 }).catch(() => false)) {
  await omitir.click();
  await page.waitForTimeout(1000);
  console.log('[QA] Onboarding dismissed');
}
await page.screenshot({ path: 'e2e/screenshots/m02-portal.png', fullPage: true });

// Step 3: Go to Steve tab
await page.locator('button').filter({ hasText: 'Steve' }).first().click();
await page.waitForTimeout(5000);
await page.screenshot({ path: 'e2e/screenshots/m03-steve.png', fullPage: true });
console.log('[QA] Step 3 — Steve tab');

// Step 4: Q0 — Fill URL via structured form
const urlInput = page.locator('input[placeholder*="mitienda"]').first();
if (await urlInput.isVisible({ timeout: 5000 }).catch(() => false)) {
  await urlInput.click();
  await urlInput.type('www.tiendatest.cl', { delay: 30 });
  await page.waitForTimeout(500);
  const enviarBtn = page.locator('button:has-text("Enviar respuesta")');
  await enviarBtn.click();
  await page.waitForTimeout(12000);
  console.log('[QA] Q0 URL sent');
} else {
  console.log('[QA] Q0 URL input not found');
}
await page.screenshot({ path: 'e2e/screenshots/m04-q0.png', fullPage: true });

// Helper to send chat message
async function chat(msg, label) {
  // Wait for input to appear
  const input = page.locator('input.flex-1, input[placeholder*="ejemplo"], input[placeholder*="Escribe tu resp"], input[placeholder*="Escribe aquí"]').first();
  await input.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1500);
  
  await input.click();
  await input.fill(''); 
  await input.type(msg, { delay: 5 });
  await page.waitForTimeout(300);
  
  // Press Enter to submit the form
  await input.press('Enter');
  await page.waitForTimeout(2000);
  
  // Check if message was sent (input should be cleared)
  const val = await input.inputValue().catch(() => msg);
  if (val.length > 5) {
    console.log(`[QA] ${label} — Enter didn't send, trying button click`);
    const btn = page.locator('button.bg-blue-600.rounded-full, button[type="submit"]').first();
    await btn.click().catch(() => {});
  }
  
  // Wait for response
  await page.waitForTimeout(12000);
  console.log(`[QA] ${label} done`);
}

// Q1
await chat('Vendemos accesorios tecnológicos premium para gamers en Chile. Teclados, mouse y audífonos de alta calidad con garantía de 2 años.', 'Q1');
await page.screenshot({ path: 'e2e/screenshots/m05-q1.png', fullPage: true });

await browser.close();
console.log('[QA] Browser closed. Check screenshots.');
