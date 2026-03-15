import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://betabgnuevosupa.vercel.app';

// Generate unique test user for each run
const timestamp = Date.now();
const TEST_EMAIL = `qa-test-${timestamp}@stevetest.dev`;
const TEST_PASSWORD = 'QaTest2026!$';

// ── Helpers ──────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto(`${BASE_URL}/auth`);
  await expect(page.locator('h1')).toContainText('Acceder al Panel');
  await page.locator('#email').fill(TEST_EMAIL);
  await page.locator('#password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await page.waitForURL('**/portal**', { timeout: 15000 });
  // Wait for portal to fully render
  await page.waitForTimeout(8000);
  console.log('[QA] Login OK → /portal');
}

async function dismissOnboarding(page: Page) {
  await page.waitForTimeout(2000);
  const omitirBtn = page.getByText('Omitir', { exact: true });
  if (await omitirBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await omitirBtn.click();
    await page.waitForTimeout(1000);
    console.log('[QA] Onboarding dismissed');
    return;
  }
  const closeBtn = page.locator('button:has-text("Cerrar"), button:has-text("Comenzar")');
  if (await closeBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.first().click();
    await page.waitForTimeout(1000);
  }
}

async function navigateToTab(page: Page, tabName: string) {
  const tab = page.locator('button').filter({ hasText: tabName }).first();
  if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(2000);
    console.log(`[QA] → Tab: ${tabName}`);
    return true;
  }
  return false;
}

/**
 * Send a message in Steve Chat.
 * The chat input has dynamic placeholders:
 *   - "Usa un ejemplo de arriba o escribe con tus palabras..."
 *   - "¿Tienes alguna pregunta para Steve? Escribe aquí..."
 *   - "Escribe tu respuesta..."
 * The send button is a round blue button with a Send (paper plane) icon.
 */
async function sendChatMessage(page: Page, message: string, label: string) {
  // Wait for Steve to finish replying (loading state clears, interaction block appears)
  // The interaction block has a 1200ms delay after assistant replies
  await page.waitForTimeout(4000);

  // Find the chat input — it's inside a form at the bottom of the chat
  // Match any of the known placeholders
  const chatInput = page.locator([
    'input[placeholder*="ejemplo de arriba"]',
    'input[placeholder*="Escribe tu respuesta"]',
    'input[placeholder*="Escribe aquí"]',
  ].join(', ')).first();

  if (await chatInput.isVisible({ timeout: 15000 }).catch(() => false)) {
    // Clear and type (not fill) to ensure React state updates
    await chatInput.click();
    await chatInput.fill('');
    await chatInput.type(message, { delay: 10 });
    await page.waitForTimeout(500);

    // Wait for send button to be enabled (not loading)
    const sendBtn = page.locator('button.bg-blue-600.rounded-full').first();
    await sendBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    // Try pressing Enter on the form (most reliable for form submission)
    await chatInput.press('Enter');
    await page.waitForTimeout(1000);

    // Verify the input was cleared (meaning message was sent)
    const inputVal = await chatInput.inputValue();
    if (inputVal.length > 0) {
      // Enter didn't work, try clicking the button
      if (await sendBtn.isEnabled()) {
        await sendBtn.click();
      }
    }
    console.log(`[QA] ${label} — sent`);
  } else {
    console.log(`[QA] ${label} — INPUT NOT FOUND`);
    await page.screenshot({ path: `e2e/screenshots/debug-${label.replace(/\s/g, '-')}.png`, fullPage: true });
    return false;
  }

  // Wait for Steve to process: watch for loading indicator to appear then disappear
  // Or simply wait for the input to become enabled again
  await page.waitForTimeout(3000); // Initial wait for request to start

  // Wait until input is available again (Steve finished replying)
  const inputReady = page.locator([
    'input[placeholder*="ejemplo de arriba"]',
    'input[placeholder*="Escribe tu respuesta"]',
    'input[placeholder*="Escribe aquí"]',
  ].join(', ')).first();
  await inputReady.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

  // Extra wait for the interaction block delay (1200ms in code)
  await page.waitForTimeout(2000);
  return true;
}

/**
 * Fill structured form fields (inputs with specific placeholders) and submit.
 * The "Enviar respuesta" button is used for structured forms.
 */
async function fillAndSubmitStructuredForm(page: Page, fields: Array<{placeholder: string, value: string}>, label: string) {
  await page.waitForTimeout(3000);

  let filled = 0;
  for (const field of fields) {
    const input = page.locator(`input[placeholder*="${field.placeholder}"]`).first();
    if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
      await input.fill(field.value);
      filled++;
    }
  }

  if (filled === 0) {
    console.log(`[QA] ${label} — no structured fields found, trying text input`);
    return false;
  }

  // Handle select/combobox dropdowns if present
  const triggers = page.locator('[role="combobox"]');
  const triggerCount = await triggers.count();
  for (let i = 0; i < triggerCount; i++) {
    const trigger = triggers.nth(i);
    if (await trigger.isVisible()) {
      await trigger.click();
      await page.waitForTimeout(500);
      const option = page.locator('[role="option"]').nth(1); // skip placeholder, pick first real option
      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(300);
      }
    }
  }

  // Click "Enviar respuesta" button for structured forms
  const submitBtn = page.locator('button:has-text("Enviar respuesta")');
  if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await submitBtn.click();
    console.log(`[QA] ${label} — structured form submitted (${filled} fields)`);
  } else {
    // Fallback to the blue round send button
    const sendBtn = page.locator('button.bg-blue-600.rounded-full').first();
    if (await sendBtn.isEnabled()) {
      await sendBtn.click();
      console.log(`[QA] ${label} — sent via chat button (${filled} fields)`);
    }
  }

  await page.waitForTimeout(10000);
  return true;
}

// ── Tests ────────────────────────────────────────────────────────────

test.describe.serial('QA 360 — Crear cliente nuevo y generar Brief', () => {
  test.setTimeout(600_000); // 10 min total

  test('1. Signup — Crear cuenta nueva', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await expect(page.locator('h1')).toContainText('Acceder al Panel');
    await page.getByText('¿No tienes cuenta? Regístrate').click();
    await expect(page.locator('h1')).toContainText('Crear Cuenta');

    await page.locator('#email').fill(TEST_EMAIL);
    await page.locator('#password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Crear Cuenta' }).click();

    await page.waitForURL('**/portal**', { timeout: 15000 }).catch(() => {});
    const url = page.url();
    console.log(`[QA] Signup → ${url.includes('/portal') ? 'portal' : url}. Email: ${TEST_EMAIL}`);
    await page.screenshot({ path: 'e2e/screenshots/01-signup.png', fullPage: true });
  });

  test('2. Portal + Onboarding', async ({ page }) => {
    await login(page);
    await dismissOnboarding(page);

    const steveTabVisible = await page.locator('button').filter({ hasText: 'Steve' }).isVisible({ timeout: 5000 }).catch(() => false);
    expect(steveTabVisible).toBe(true);
    console.log('[QA] Portal loaded, tabs visible');
    await page.screenshot({ path: 'e2e/screenshots/02-portal.png', fullPage: true });
  });

  test('3. Steve Chat — Completar Brief (Q0-Q16)', async ({ page }) => {
    await login(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Steve');

    // Wait for Steve Chat to fully initialize and show first question
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'e2e/screenshots/03-00-init.png', fullPage: true });

    // ── Q0: Website URL (structured form with "Enviar respuesta") ──
    const q0 = await fillAndSubmitStructuredForm(page, [
      { placeholder: 'mitienda', value: 'www.tiendatest.cl' },
    ], 'Q0 URL');
    if (!q0) {
      await sendChatMessage(page, 'www.tiendatest.cl', 'Q0 URL fallback');
    }
    await page.screenshot({ path: 'e2e/screenshots/03-01-q0.png', fullPage: true });

    // ── Q1: Business pitch (free text) ──
    await sendChatMessage(page, 'Vendemos accesorios tecnológicos premium para gamers en Chile. Teclados, mouse y audífonos de alta calidad con garantía de 2 años y envío en 24h.', 'Q1 Pitch');
    await page.screenshot({ path: 'e2e/screenshots/03-02-q1.png', fullPage: true });

    // ── Q2: Numbers (structured form) ──
    const q2 = await fillAndSubmitStructuredForm(page, [
      { placeholder: '35.000', value: '45000' },
      { placeholder: '12.000', value: '18000' },
      { placeholder: '4.000', value: '4500' },
    ], 'Q2 Numbers');
    if (!q2) {
      await sendChatMessage(page, 'Precio promedio $45.000, costo $18.000, envío $4.500. Fase crecimiento. Presupuesto ads $500.000 CLP mensual.', 'Q2 Numbers fallback');
    }
    await page.screenshot({ path: 'e2e/screenshots/03-03-q2.png', fullPage: true });

    // ── Q3: Sales channels (structured, percentages with placeholder "0") ──
    const q3 = await fillAndSubmitStructuredForm(page, [
      { placeholder: '0', value: '40' }, // This will only fill the first one
    ], 'Q3 partial');
    // Fill all 6 percentage fields
    const pctInputs = page.locator('input[placeholder="0"]');
    const pctCount = await pctInputs.count();
    if (pctCount >= 6) {
      const pctValues = ['40', '20', '10', '10', '10', '10'];
      for (let i = 0; i < 6; i++) {
        await pctInputs.nth(i).fill(pctValues[i]);
      }
      const submitBtn = page.locator('button:has-text("Enviar respuesta")');
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click();
        console.log('[QA] Q3 Channels — submitted');
        await page.waitForTimeout(10000);
      }
    } else if (!q3) {
      await sendChatMessage(page, 'Shopify 40%, Marketplaces 20%, tienda física 10%, WhatsApp 10%, Instagram 10%, Facebook 10%.', 'Q3 Channels fallback');
    }
    await page.screenshot({ path: 'e2e/screenshots/03-04-q3.png', fullPage: true });

    // ── Q4: Buyer persona (structured form) ──
    const q4 = await fillAndSubmitStructuredForm(page, [
      { placeholder: 'María', value: 'Carlos' },
      { placeholder: '32', value: '28' },
      { placeholder: 'Mujer', value: 'Hombre' },
      { placeholder: 'Santiago', value: 'Santiago' },
      { placeholder: 'Diseñadora', value: 'Ingeniero de software' },
      { placeholder: '1.500.000', value: '2500000' },
      { placeholder: 'Soltera', value: 'Soltero' },
      { placeholder: 'Verse bien', value: 'Mejor rendimiento gaming' },
    ], 'Q4 Persona');
    if (!q4) {
      await sendChatMessage(page, 'Carlos, 28, hombre, Santiago, ingeniero, $2.500.000, soltero. Compra para tener el mejor setup gaming.', 'Q4 Persona fallback');
    }
    await page.screenshot({ path: 'e2e/screenshots/03-05-q4.png', fullPage: true });

    // ── Q5-Q8: Free text questions ──
    const freeTextQs = [
      { msg: 'Los gamers chilenos pagan precios inflados por periféricos importados de mala calidad. Compran en tiendas sin garantía local y los productos fallan en 3 meses. No hay soporte técnico en español.', label: 'Q5 Pain' },
      { msg: '"Es muy caro", "¿Y si se echa a perder?", "Prefiero Amazon aunque demore", "Las tiendas chilenas son puro revendedor". Desconfían de tiendas locales.', label: 'Q6 Words' },
      { msg: 'Setup premium con garantía real de 2 años. Soporte técnico en español 24/7. Guías de configuración personalizadas. Se sienten parte de una comunidad gamer seria.', label: 'Q7 Transform' },
      { msg: 'Siguen a Auronplay, TheGrefg, Rubius. Reddit, Discord, Twitter. Marcas: Razer, Logitech, HyperX. Comparan en PCFactory y Solotodo. Les gustan los esports.', label: 'Q8 Lifestyle' },
    ];
    for (const q of freeTextQs) {
      await sendChatMessage(page, q.msg, q.label);
    }
    await page.screenshot({ path: 'e2e/screenshots/03-06-q8.png', fullPage: true });

    // ── Q9: Competitors (structured) ──
    const q9 = await fillAndSubmitStructuredForm(page, [
      { placeholder: 'Cannon', value: 'PCFactory' },
      { placeholder: 'cannonhome', value: 'pcfactory.cl' },
      { placeholder: 'Intime', value: 'AllGamers' },
      { placeholder: 'intime', value: 'allgamers.cl' },
      { placeholder: 'Marca X', value: 'GamerZone' },
      { placeholder: 'marcax', value: 'gamerzone.cl' },
    ], 'Q9 Competitors');
    if (!q9) {
      await sendChatMessage(page, 'PCFactory (pcfactory.cl), AllGamers (allgamers.cl), GamerZone (gamerzone.cl).', 'Q9 Competitors fallback');
    }

    // ── Q10: Competitor weakness (textareas) ──
    await page.waitForTimeout(3000);
    const textareas = page.locator('textarea');
    const taCount = await textareas.count();
    if (taCount >= 4) {
      const weaknessData = [
        'Prometen envío rápido pero demoran 7 días',
        'Entregamos en 24h Santiago y 48h regiones',
        'Dicen tener garantía pero nunca responden',
        'Garantía real 2 años con soporte local',
        'Precios inflados por intermediarios',
        'Importamos directo, mejor precio final',
      ];
      for (let i = 0; i < Math.min(taCount, weaknessData.length); i++) {
        await textareas.nth(i).fill(weaknessData[i]);
      }
      const submitBtn = page.locator('button:has-text("Enviar respuesta")');
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click();
        console.log('[QA] Q10 Weakness — submitted');
        await page.waitForTimeout(10000);
      }
    } else {
      await sendChatMessage(page, 'PCFactory promete envío rápido pero demora 7 días (nosotros 24h). AllGamers dice garantía pero no responde (nosotros 2 años reales). GamerZone precios inflados (nosotros importamos directo).', 'Q10 Weakness fallback');
    }
    await page.screenshot({ path: 'e2e/screenshots/03-07-q10.png', fullPage: true });

    // ── Q11-Q15: More free text ──
    const moreQs = [
      { msg: 'Únicos en Chile con garantía 2 años en periféricos gamer, soporte 24/7 en español, entrega 24h Santiago. Importamos directo sin intermediarios.', label: 'Q11 Advantage' },
      { msg: 'Cada pedido incluye setup guide personalizado + stickers gamer exclusivos. "El mejor setup gamer de Chile, garantizado o devolvemos tu dinero".', label: 'Q12 Purple Cow' },
      { msg: 'Villano: tiendas que venden chino sin garantía cobrando como original. Garantía: 2 años cobertura total + soporte 24/7 + envío gratis en reemplazo.', label: 'Q13 Villain' },
      { msg: '2.000+ reviews 5 estrellas Google. 15k seguidores Instagram. Tono: cercano, gamer, técnico pero accesible. Humor gamer y memes.', label: 'Q14 Proof' },
      { msg: 'Negro principal, verde neón #00FF41. Tech, minimalista. Tipografía sans-serif moderna. Logo: gamepad estilizado.', label: 'Q15 Identity' },
    ];
    for (const q of moreQs) {
      await sendChatMessage(page, q.msg, q.label);
    }
    await page.screenshot({ path: 'e2e/screenshots/03-08-q15.png', fullPage: true });

    // ── Q16: Brand assets ──
    await sendChatMessage(page, 'No tengo fotos ahora, las subo después.', 'Q16 Assets');
    await page.screenshot({ path: 'e2e/screenshots/03-09-q16.png', fullPage: true });

    // ── Wait for analysis ──
    console.log('[QA] Brief questions done. Checking for analysis phase...');
    const analysisIndicator = page.locator('text=/analizando|investigando|Fase|procesando/i');
    if (await analysisIndicator.first().isVisible({ timeout: 20000 }).catch(() => false)) {
      console.log('[QA] Analysis phase detected — waiting up to 4 min...');
      // Wait for "¡Análisis completo!" or timeout
      const completeMsg = page.locator('text=/Análisis completo|Brief.*listo/i');
      await completeMsg.waitFor({ state: 'visible', timeout: 240_000 }).catch(() => {
        console.log('[QA] Analysis timeout — checking anyway');
      });
    }

    await page.screenshot({ path: 'e2e/screenshots/03-10-analysis.png', fullPage: true });
  });

  test('4. Brief View — Verificar generación del Brief', async ({ page }) => {
    await login(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Brief');

    await page.waitForTimeout(5000);

    // Check progress — if > 6% the brief has data
    const progressText = page.locator('text=/\\d+%/').first();
    const progressStr = await progressText.textContent().catch(() => '0%');
    console.log(`[QA] Brief progress: ${progressStr}`);

    // Check for actual brief content sections (not just labels)
    // Real brief content has section headers like "Identidad de Marca", "Análisis Financiero", etc.
    const realContent = page.locator('[class*="card"], [class*="Card"]').filter({
      hasText: /identidad de marca|análisis financiero|perfil del consumidor|posicionamiento/i
    });
    const hasRealBrief = await realContent.first().isVisible({ timeout: 10000 }).catch(() => false);

    if (hasRealBrief) {
      console.log('[QA] ✅ BRIEF GENERATED — real content visible');

      const pdfBtn = page.locator('button:has-text("PDF"), button:has-text("Descargar")');
      if (await pdfBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('[QA] PDF download button present');
      }
    } else {
      // Check if at least the progress is beyond initial state
      const pct = parseInt(progressStr || '0');
      if (pct > 10) {
        console.log(`[QA] ⚠️ Brief partially generated (${pct}%) but full content not rendered yet`);
      } else {
        console.log('[QA] ❌ Brief NOT generated — still at initial state');
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/04-brief-view.png', fullPage: true });
  });
});
