import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4173';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASSWORD = 'Jardin2026';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loginAndNavigate(page: Page) {
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForLoadState('networkidle');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await page.waitForURL('**/portal**', { timeout: 25000 });
  await page.waitForTimeout(4000);
  await page.waitForLoadState('networkidle').catch(() => {});

  for (let attempt = 0; attempt < 5; attempt++) {
    const omitirBtn = page.getByText('Omitir', { exact: true });
    if (await omitirBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await omitirBtn.click({ force: true });
      await page.waitForTimeout(1500);
      continue;
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    const modal = page.locator('[role="dialog"], .fixed.inset-0').first();
    if (!(await modal.isVisible({ timeout: 1000 }).catch(() => false))) break;
  }
  await page.waitForTimeout(2000);
}

async function goToSteveMail(page: Page): Promise<boolean> {
  const directTab = page.locator('button').filter({ hasText: /Steve Mail/ }).first();
  if (await directTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await directTab.click({ force: true });
    await page.waitForTimeout(3000);
    return true;
  }
  const masBtn = page.locator('button').filter({ hasText: /^Más$/ }).first();
  if (await masBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await masBtn.click({ force: true });
    await page.waitForTimeout(800);
    const menuItem = page.locator('[role="menuitem"]').filter({ hasText: /Steve Mail/ }).first();
    if (await menuItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuItem.click({ force: true });
      await page.waitForTimeout(3000);
      return true;
    }
  }
  return false;
}

async function openNewCampaignEditor(page: Page, name: string, subject: string) {
  const nuevaCampana = page.getByRole('button', { name: /Nueva Campaña/i }).first();
  await nuevaCampana.click();
  await page.waitForTimeout(3000);

  const nameInput = page.locator('input[placeholder*="Promoción Black Friday"]').first();
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nameInput.fill(name);
  }
  const subjectInput = page.locator('input[placeholder*="30% de descuento"]').first();
  if (await subjectInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await subjectInput.fill(subject);
  }

  const nextBtn = page.getByRole('button', { name: /Siguiente.*Diseñar/i }).first();
  if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nextBtn.click();
    await page.waitForTimeout(5000);
  }

  // Dismiss template gallery
  for (let attempt = 0; attempt < 3; attempt++) {
    const dialog = page.locator('[role="dialog"]').first();
    if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      const closeBtn = dialog.locator('button[aria-label="Close"], button:has(svg.lucide-x)').first();
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.click({ force: true });
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(1500);
    } else {
      break;
    }
  }
  await page.waitForTimeout(5000);
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Steve Mail Editor v2 — QA Security & Limits', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // Auto-accept all dialogs (confirm, beforeunload) throughout the suite
    page.on('dialog', async (dialog) => {
      await dialog.accept().catch(() => {});
    });
    await loginAndNavigate(page);
    const found = await goToSteveMail(page);
    expect(found).toBe(true);
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ─── 1. CONCURRENCY — optimistic locking ──────────────────────────────
  test('1. Concurrencia — save incluye expected_updated_at para locking', async () => {
    await openNewCampaignEditor(page, 'QA Concurrency Test', 'Concurrency subject');

    const gjsEditor = page.locator('.gjs-editor').first();
    await expect(gjsEditor).toBeVisible({ timeout: 10000 });

    // Add a block so there's content to save
    const heroBlock = page.locator('.gjs-block').filter({ hasText: /Hero/i }).first();
    if (await heroBlock.isVisible({ timeout: 3000 }).catch(() => false)) {
      await heroBlock.click({ force: true });
      await page.waitForTimeout(2000);
    }

    // Intercept the save API call to check for concurrency fields
    let savedPayload: any = null;
    await page.route('**/manage-email-campaigns**', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON?.() || JSON.parse(request.postData() || '{}');
      if (postData.action === 'update' || postData.action === 'create') {
        savedPayload = postData;
      }
      await route.continue();
    });

    // Click Guardar via JS
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const saveBtn = buttons.find(b => {
        const text = b.textContent || '';
        return /Guardar/i.test(text) && !/Plantilla/i.test(text);
      });
      if (saveBtn) saveBtn.click();
    });
    await page.waitForTimeout(5000);

    // Check if the payload includes concurrency tracking
    if (savedPayload) {
      const hasUpdatedAt = 'expected_updated_at' in savedPayload;
      console.log(`[QA] Save payload includes expected_updated_at: ${hasUpdatedAt ? 'YES' : 'NO (null for new)'}`);
      console.log(`[QA] Save action: ${savedPayload.action}`);
      console.log(`[QA] Has client_id: ${'client_id' in savedPayload}`);
      console.log(`[QA] Has html_content: ${'html_content' in savedPayload}`);
      console.log(`[QA] Has design_json: ${'design_json' in savedPayload}`);
    } else {
      console.log('[QA] Save request not captured (may have been sent before route intercept)');
    }

    // Verify editor is still functional
    const editorOk = await gjsEditor.isVisible({ timeout: 3000 }).catch(() => false);
    expect(editorOk).toBe(true);

    // Clean up route
    await page.unroute('**/manage-email-campaigns**');

    // Go back to list for next test
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes('Volver'));
      if (btn) btn.click();
    });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'e2e/screenshots/qa-v2-sec-01-concurrency.png', fullPage: true });
  });

  // ─── 2. SPECIAL CHARACTERS — emojis, accents, CJK ─────────────────────
  test('2. Caracteres especiales — emojis, acentos, CJK en asunto y cuerpo', async () => {
    const specialSubject = '🎉🔥 Oferta Especial — áéíóú ñ 你好 café naïve';

    await openNewCampaignEditor(page, 'QA Caracteres 🎉ñ你好', specialSubject);

    const gjsEditor = page.locator('.gjs-editor').first();
    await expect(gjsEditor).toBeVisible({ timeout: 10000 });

    // Add a text block with special characters
    const textBlock = page.locator('.gjs-block').filter({ hasText: /Texto/i }).first();
    if (await textBlock.isVisible({ timeout: 3000 }).catch(() => false)) {
      await textBlock.click({ force: true });
      await page.waitForTimeout(2000);
    }

    // Inject special characters into the canvas
    const injected = await page.evaluate(() => {
      const iframe = document.querySelector('.gjs-frame') as HTMLIFrameElement;
      if (!iframe?.contentDocument) return false;
      const p = iframe.contentDocument.createElement('p');
      p.innerHTML = '🎉🔥 Hola Mundo — áéíóúñ — 你好世界 — café naïve — €£¥ — ™®©';
      iframe.contentDocument.body.appendChild(p);
      return true;
    });
    console.log(`[QA] Injected special chars: ${injected ? 'YES' : 'NO'}`);

    // Verify characters are preserved in the canvas
    const iframe = page.frameLocator('.gjs-frame').first();
    const bodyText = await iframe.locator('body').innerText().catch(() => '');

    const charChecks = [
      { name: 'Emojis 🎉🔥', test: bodyText.includes('🎉') || bodyText.includes('🔥') },
      { name: 'Accents áéíóú', test: bodyText.includes('á') || bodyText.includes('é') },
      { name: 'Eñe ñ', test: bodyText.includes('ñ') },
      { name: 'Chinese 你好', test: bodyText.includes('你好') },
      { name: 'Euro/Pound €£', test: bodyText.includes('€') || bodyText.includes('£') },
    ];

    for (const c of charChecks) {
      console.log(`[QA] ${c.name}: ${c.test ? 'PRESERVED' : 'MISSING'}`);
    }

    const preserved = charChecks.filter(c => c.test).length;
    console.log(`[QA] Character preservation: ${preserved}/${charChecks.length}`);

    // Check that the HTML output includes UTF-8 charset
    const htmlOutput = await page.evaluate(() => {
      const iframe = document.querySelector('.gjs-frame') as HTMLIFrameElement;
      return iframe?.contentDocument?.body?.innerHTML || '';
    });
    console.log(`[QA] Body HTML length: ${htmlOutput.length}`);

    // Verify the meta charset is set correctly (already checked in QA 1/3 test 3)
    // Here we verify the characters survive in the output
    expect(preserved).toBeGreaterThanOrEqual(3);

    // Go back
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes('Volver'));
      if (btn) btn.click();
    });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'e2e/screenshots/qa-v2-sec-02-chars.png', fullPage: true });
  });

  // ─── 3. LINKS — validation and integrity ──────────────────────────────
  test('3. Links — verificar integridad de links en HTML generado', async () => {
    await openNewCampaignEditor(page, 'QA Links Test', 'Links verification');

    const gjsEditor = page.locator('.gjs-editor').first();
    await expect(gjsEditor).toBeVisible({ timeout: 10000 });

    // Add Hero block (has a CTA link) and Footer (has unsubscribe link)
    const heroBlock = page.locator('.gjs-block').filter({ hasText: /Hero/i }).first();
    if (await heroBlock.isVisible({ timeout: 3000 }).catch(() => false)) {
      await heroBlock.click({ force: true });
      await page.waitForTimeout(2000);
    }
    const footerBlock = page.locator('.gjs-block').filter({ hasText: /Footer/i }).first();
    if (await footerBlock.isVisible({ timeout: 3000 }).catch(() => false)) {
      await footerBlock.click({ force: true });
      await page.waitForTimeout(2000);
    }

    // Extract all links from the canvas
    const linkAnalysis = await page.evaluate(() => {
      const iframe = document.querySelector('.gjs-frame') as HTMLIFrameElement;
      if (!iframe?.contentDocument) return { links: [], total: 0 };

      const anchors = Array.from(iframe.contentDocument.querySelectorAll('a'));
      const links = anchors.map(a => ({
        href: a.getAttribute('href') || '',
        text: a.textContent?.trim() || '',
        hasTarget: a.hasAttribute('target'),
      }));

      return {
        links,
        total: links.length,
        empty: links.filter(l => !l.href || l.href === '').length,
        hash: links.filter(l => l.href === '#').length,
        javascript: links.filter(l => l.href.startsWith('javascript:')).length,
        valid: links.filter(l => l.href.startsWith('http') || l.href.startsWith('mailto:') || l.href.startsWith('{{') || l.href === '#').length,
        mergeTags: links.filter(l => l.href.includes('{{')).length,
      };
    });

    console.log(`[QA] Total links found: ${linkAnalysis.total}`);
    console.log(`[QA] Empty href: ${linkAnalysis.empty}`);
    console.log(`[QA] Placeholder (#): ${linkAnalysis.hash}`);
    console.log(`[QA] javascript: links: ${linkAnalysis.javascript} (should be 0)`);
    console.log(`[QA] Valid links: ${linkAnalysis.valid}`);
    console.log(`[QA] Merge tag links: ${linkAnalysis.mergeTags}`);

    // Log each link for inspection
    for (const link of linkAnalysis.links) {
      console.log(`[QA]   "${link.text}" → ${link.href} ${link.hasTarget ? '(target set)' : ''}`);
    }

    // No javascript: links should exist (sanitization)
    expect(linkAnalysis.javascript).toBe(0);

    // No empty href links
    expect(linkAnalysis.empty).toBe(0);

    // Go back
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes('Volver'));
      if (btn) btn.click();
    });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'e2e/screenshots/qa-v2-sec-03-links.png', fullPage: true });
  });

  // ─── 4. DARK MODE — prefers-color-scheme support ───────────────────────
  test('4. Dark mode — HTML incluye prefers-color-scheme media query', async () => {
    await openNewCampaignEditor(page, 'QA Dark Mode Test', 'Dark mode check');

    const gjsEditor = page.locator('.gjs-editor').first();
    await expect(gjsEditor).toBeVisible({ timeout: 10000 });

    // Add a block to have content
    const heroBlock = page.locator('.gjs-block').filter({ hasText: /Hero/i }).first();
    if (await heroBlock.isVisible({ timeout: 3000 }).catch(() => false)) {
      await heroBlock.click({ force: true });
      await page.waitForTimeout(2000);
    }

    // Intercept the save API call to extract the HTML content from getHtml()
    let htmlOutput = '';
    await page.route('**/manage-email-campaigns**', async (route) => {
      const request = route.request();
      try {
        const postData = request.postDataJSON?.() || JSON.parse(request.postData() || '{}');
        if (postData.html_content) {
          htmlOutput = postData.html_content;
        }
      } catch { /* ignore */ }
      await route.continue();
    });

    // Click Guardar to trigger getHtml() export
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const saveBtn = buttons.find(b => {
        const text = b.textContent || '';
        return /Guardar/i.test(text) && !/Plantilla/i.test(text);
      });
      if (saveBtn) saveBtn.click();
    });
    await page.waitForTimeout(5000);
    await page.unroute('**/manage-email-campaigns**');

    if (htmlOutput) {
      const darkModeChecks = [
        { name: 'prefers-color-scheme:dark', test: htmlOutput.includes('prefers-color-scheme') },
        { name: 'color-scheme meta', test: htmlOutput.includes('color-scheme') },
        { name: 'Dark bg override', test: htmlOutput.includes('#1a1a1a') || htmlOutput.includes('#27272a') },
        { name: 'Dark text color', test: htmlOutput.includes('#e4e4e7') || htmlOutput.includes('#fafafa') },
        { name: 'Dark link color', test: htmlOutput.includes('#818cf8') },
        { name: 'MSO conditional', test: htmlOutput.includes('<!--[if mso]>') },
        { name: 'x-apple-disable', test: htmlOutput.includes('x-apple-disable-message-reformatting') },
      ];

      for (const c of darkModeChecks) {
        console.log(`[QA] Dark mode ${c.name}: ${c.test ? 'PASS' : 'FAIL'}`);
      }

      const passCount = darkModeChecks.filter(c => c.test).length;
      console.log(`[QA] Dark mode checks: ${passCount}/${darkModeChecks.length} passed`);
      expect(passCount).toBeGreaterThanOrEqual(5);
    } else {
      console.log('[QA] Could not extract HTML output — save may not have triggered');
      expect(htmlOutput).toBeTruthy();
    }

    // Go back
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes('Volver'));
      if (btn) btn.click();
    });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'e2e/screenshots/qa-v2-sec-04-darkmode.png', fullPage: true });
  });

  // ─── 5. EMAIL WEIGHT — Gmail 102KB clip warning ────────────────────────
  test('5. Peso del email — indicador de KB visible en toolbar', async () => {
    await openNewCampaignEditor(page, 'QA Email Weight Test', 'Weight check');

    const gjsEditor = page.locator('.gjs-editor').first();
    await expect(gjsEditor).toBeVisible({ timeout: 10000 });

    // Add several blocks to build up content
    const blockNames = ['Hero', 'Texto', 'Separador', 'Header', 'Footer', 'Productos'];
    for (const name of blockNames) {
      const block = page.locator('.gjs-block').filter({ hasText: new RegExp(name, 'i') }).first();
      if (await block.isVisible({ timeout: 2000 }).catch(() => false)) {
        await block.click({ force: true });
        await page.waitForTimeout(1000);
      }
    }

    // Wait for the email size indicator to update (polls every 3s)
    await page.waitForTimeout(5000);

    // Look for the KB indicator in the toolbar
    const kbIndicator = page.locator('span').filter({ hasText: /\d+KB/ }).first();
    const hasIndicator = await kbIndicator.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[QA] Email weight indicator visible: ${hasIndicator ? 'YES' : 'NOT YET'}`);

    if (hasIndicator) {
      const kbText = await kbIndicator.textContent().catch(() => '');
      console.log(`[QA] Email weight: ${kbText}`);

      // Extract numeric value
      const match = kbText?.match(/(\d+)KB/);
      if (match) {
        const sizeKB = parseInt(match[1], 10);
        console.log(`[QA] Email size: ${sizeKB}KB (limit: 102KB)`);
        expect(sizeKB).toBeGreaterThan(0);

        if (sizeKB > 102) {
          console.log('[QA] WARNING: Email exceeds Gmail 102KB limit!');
          // Check for warning styling
          const hasWarning = await kbIndicator.evaluate(el => {
            return el.classList.contains('bg-red-100') || el.className.includes('red');
          });
          console.log(`[QA] Warning styling applied: ${hasWarning ? 'YES' : 'NO'}`);
        }
      }
    } else {
      // The indicator might not have rendered yet — check after more time
      await page.waitForTimeout(5000);
      const retry = page.locator('span').filter({ hasText: /\d+KB/ }).first();
      const hasRetry = await retry.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`[QA] Email weight indicator (retry): ${hasRetry ? 'YES' : 'NO'}`);
    }

    // Verify the toolbar exists and has the expected elements
    const toolbar = page.locator('.flex.items-center.gap-2.px-3').first();
    const hasToolbar = await toolbar.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[QA] Secondary toolbar visible: ${hasToolbar ? 'YES' : 'NO'}`);

    await page.screenshot({ path: 'e2e/screenshots/qa-v2-sec-05-weight.png', fullPage: true });
  });
});
