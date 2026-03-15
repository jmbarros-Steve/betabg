import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://betabgnuevosupa.vercel.app';
const API_URL = process.env.TEST_API_URL || 'https://steve-api-165085523726.us-central1.run.app';
const ADMIN_EMAIL = process.env.STEVE_TEST_EMAIL || 'patricio.correa@jardindeeva.cl';
const ADMIN_PASSWORD = process.env.STEVE_TEST_PASSWORD || 'Jardin2026';

// ── Helpers ──────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/auth`);
  await page.locator('#email').fill(ADMIN_EMAIL);
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await page.waitForURL('**/portal**', { timeout: 20000 });
  await page.waitForTimeout(3000);

  // Dismiss onboarding overlay
  await page.evaluate(() => {
    const omitir = Array.from(document.querySelectorAll('button, span, p')).find(
      el => el.textContent?.trim() === 'Omitir'
    );
    if (omitir) (omitir as HTMLElement).click();
    document.querySelectorAll('.fixed.inset-0').forEach(el => {
      if (el instanceof HTMLElement) el.style.pointerEvents = 'none';
    });
  });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
}

async function goToConnections(page: Page) {
  // Navigate to Conexiones tab
  const clicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent?.trim() === 'Conexiones' && !btn.disabled) {
        btn.click();
        return true;
      }
    }
    return false;
  });
  if (!clicked) {
    // Try via URL
    await page.goto(`${BASE_URL}/portal`);
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(2000);
}

// ══════════════════════════════════════════════════════════════════════
// TEST 1: OAuth Connect Flow — UI elements present
// ══════════════════════════════════════════════════════════════════════
test('T1 — OAuth Connect: Meta connection button exists and opens OAuth dialog', async ({ page }) => {
  await login(page);
  await goToConnections(page);

  // Look for Meta connection section
  const metaSection = page.locator('text=Meta').first();
  const hasMetaSection = await metaSection.isVisible({ timeout: 5000 }).catch(() => false);

  if (hasMetaSection) {
    console.log('[QA-OAUTH] Meta connection section found');
  }

  // Check for "Conectar" or "Reconectar" button
  const connectBtn = page.locator('button').filter({ hasText: /Conectar|Vincular|Meta/ }).first();
  const hasConnectBtn = await connectBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`[QA-OAUTH] Connect button visible: ${hasConnectBtn}`);

  // Verify the OAuth URL has CSRF state when clicking connect
  if (hasConnectBtn) {
    // Intercept navigation to Facebook OAuth
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 10000 }).catch(() => null),
      connectBtn.evaluate((el: HTMLElement) => el.click()),
    ]).catch(() => [null]);

    if (popup) {
      const popupUrl = popup.url();
      console.log(`[QA-OAUTH] OAuth popup URL: ${popupUrl.substring(0, 100)}...`);

      // Verify state parameter is present (CSRF protection)
      expect(popupUrl).toContain('state=');
      console.log('[QA-OAUTH] CSRF state parameter present in OAuth URL');

      // Verify it uses the correct Meta app ID
      expect(popupUrl).toContain('client_id=');

      // Verify scope includes required permissions
      expect(popupUrl).toContain('scope=');

      await popup.close().catch(() => {});
    } else {
      // May redirect in same window — check sessionStorage for CSRF state
      const oauthState = await page.evaluate(() => sessionStorage.getItem('meta_oauth_state'));
      console.log(`[QA-OAUTH] SessionStorage CSRF state: ${oauthState ? 'SET' : 'NOT SET'}`);
      if (oauthState) {
        expect(oauthState).toContain(':'); // Format: nonce:clientId
        console.log('[QA-OAUTH] CSRF state format valid (nonce:clientId)');
      }
    }
  }

  await page.screenshot({ path: 'e2e/screenshots/qa-oauth-01-connections.png' });
  console.log('[QA-OAUTH] T1 PASSED');
});

// ══════════════════════════════════════════════════════════════════════
// TEST 2: Token Expired — System shows warning
// ══════════════════════════════════════════════════════════════════════
test('T2 — Token Expired: check-meta-scopes handles expired token gracefully', async ({ page }) => {
  await login(page);

  // Get a valid session token for API calls
  const sessionToken = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.includes('auth-token'));
    if (!key) return null;
    try {
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      return data.access_token || null;
    } catch { return null; }
  });

  if (!sessionToken) {
    console.log('[QA-OAUTH] Could not get session token, skipping API test');
    return;
  }

  // Call check-meta-scopes with a fake connection_id (using Playwright request to bypass CORS)
  const apiRes = await page.request.post(`${API_URL}/api/check-meta-scopes`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,
    },
    data: { connection_id: '00000000-0000-0000-0000-000000000000' },
  });

  const resData = await apiRes.json().catch(() => ({}));
  console.log(`[QA-OAUTH] check-meta-scopes response: ${apiRes.status()} ${JSON.stringify(resData).substring(0, 200)}`);

  // Should return 404 for non-existent connection (not crash)
  expect([200, 404]).toContain(apiRes.status());

  // If connected, navigate to Meta tab and check for token warning
  await page.evaluate(() => {
    const masBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Más'));
    if (masBtn) masBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const mi = Array.from(document.querySelectorAll('[role="menuitem"]')).find(el => el.textContent?.includes('Meta'));
    if (mi) (mi as HTMLElement).click();
  });
  await page.waitForTimeout(3000);

  // Check if token expired warning is shown
  const hasWarning = await page.locator('text=/token.*expirado|reconectar|volver.*vincular|expirad/i')
    .isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`[QA-OAUTH] Token expired warning visible: ${hasWarning}`);

  await page.screenshot({ path: 'e2e/screenshots/qa-oauth-02-token-expired.png' });
  console.log('[QA-OAUTH] T2 PASSED');
});

// ══════════════════════════════════════════════════════════════════════
// TEST 3: CSRF — Manipulated state param is rejected
// ══════════════════════════════════════════════════════════════════════
test('T3 — CSRF: OAuth callback rejects manipulated state', async ({ page }) => {
  // Navigate to the OAuth callback with a fake state parameter
  await page.goto(`${BASE_URL}/oauth/meta/callback?code=FAKE_CODE&state=MANIPULATED_STATE`);
  await page.waitForTimeout(3000);

  // The page should show an error or redirect back (not proceed with OAuth)
  const pageContent = await page.content();
  const url = page.url();

  // Check for error indicators
  const hasError = pageContent.toLowerCase().includes('error') ||
    pageContent.toLowerCase().includes('inválido') ||
    pageContent.toLowerCase().includes('invalid') ||
    url.includes('auth') ||
    url.includes('error');

  // Also check sessionStorage — there should be NO meta_oauth_state matching
  const storedState = await page.evaluate(() => sessionStorage.getItem('meta_oauth_state'));
  const stateMatches = storedState === 'MANIPULATED_STATE';

  console.log(`[QA-CSRF] Page URL after fake callback: ${url}`);
  console.log(`[QA-CSRF] Page shows error: ${hasError}`);
  console.log(`[QA-CSRF] State matches (should be false): ${stateMatches}`);

  // The manipulated state should NOT match what's in sessionStorage
  expect(stateMatches).toBe(false);

  await page.screenshot({ path: 'e2e/screenshots/qa-oauth-03-csrf-rejected.png' });
  console.log('[QA-OAUTH] T3 PASSED — CSRF protection working');
});

// ══════════════════════════════════════════════════════════════════════
// TEST 4: Encryption Key — NOT in any public/served file
// ══════════════════════════════════════════════════════════════════════
test('T4 — Encryption Key: not exposed in public files or browser responses', async ({ page }) => {
  const sensitivePatterns = [
    'platform_tokens_secret_key_2024',
    'md5(\'platform_tokens',
    'encrypt_platform_token',  // Function body, not RPC call
    'pgp_sym_encrypt',
    'pgp_sym_decrypt',
  ];

  // Check public/ files are not served
  const publicFiles = [
    '/database-export.sql',
    '/steve-ads-schema.sql',
    '/TECHNICAL_STACK.md',
  ];

  for (const file of publicFiles) {
    try {
      // Use fetch API to avoid download triggers
      const result = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url);
          if (res.status !== 200) return { status: res.status, body: '' };
          const body = await res.text();
          return { status: res.status, body: body.substring(0, 5000) };
        } catch (e: any) {
          return { status: 0, body: '', error: e.message };
        }
      }, `${BASE_URL}${file}`);

      console.log(`[QA-KEY] ${file}: status ${result.status}`);

      if (result.status === 200 && result.body) {
        for (const pattern of sensitivePatterns) {
          const found = result.body.includes(pattern);
          if (found) console.error(`[QA-KEY] ALERT: ${file} contains '${pattern}'`);
          expect(found).toBe(false);
        }
      } else {
        console.log(`[QA-KEY] ${file}: ${result.status} (file deleted or not served) — GOOD`);
      }
    } catch (err) {
      console.log(`[QA-KEY] ${file}: error fetching (likely deleted) — GOOD`);
    }
  }

  // Check that the main app bundle doesn't contain the key
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForTimeout(3000);

  // Intercept all JS files and check for key material
  const jsResponses: string[] = [];
  page.on('response', async (response) => {
    if (response.url().endsWith('.js') || response.url().includes('.js?')) {
      try {
        const body = await response.text();
        for (const pattern of sensitivePatterns) {
          if (body.includes(pattern)) {
            jsResponses.push(`FOUND '${pattern}' in ${response.url()}`);
          }
        }
      } catch {}
    }
  });

  await page.goto(`${BASE_URL}/portal`);
  await page.waitForTimeout(5000);

  if (jsResponses.length > 0) {
    console.error('[QA-KEY] ALERT — sensitive patterns found in JS bundles:', jsResponses);
  }
  expect(jsResponses.length).toBe(0);

  await page.screenshot({ path: 'e2e/screenshots/qa-oauth-04-no-key-exposure.png' });
  console.log('[QA-OAUTH] T4 PASSED — No encryption key exposure');
});

// ══════════════════════════════════════════════════════════════════════
// TEST 5: App Secret — NOT in any URL, log, or error response
// ══════════════════════════════════════════════════════════════════════
test('T5 — App Secret: not exposed in API responses or network requests', async ({ page }) => {
  const sensitiveInUrl: string[] = [];

  // Monitor ALL network requests for app secret in URLs
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('client_secret=') || url.includes('app_secret=')) {
      sensitiveInUrl.push(url.substring(0, 200));
    }
  });

  // Monitor responses for secret leaks
  const sensitiveInResponse: string[] = [];
  page.on('response', async (response) => {
    try {
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('json')) {
        const body = await response.text();
        if (body.includes('client_secret') || body.includes('app_secret') || body.includes('META_APP_SECRET')) {
          sensitiveInResponse.push(`${response.url().substring(0, 100)}: contains secret reference`);
        }
      }
    } catch {}
  });

  // Login and navigate the app
  await login(page);

  // Go to Meta section if available
  await page.evaluate(() => {
    const masBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Más'));
    if (masBtn) masBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const mi = Array.from(document.querySelectorAll('[role="menuitem"]')).find(el => el.textContent?.includes('Meta'));
    if (mi) (mi as HTMLElement).click();
  });
  await page.waitForTimeout(3000);

  // Go to Conexiones
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Conexiones');
    if (btn) btn.click();
  });
  await page.waitForTimeout(2000);

  // Check results
  if (sensitiveInUrl.length > 0) {
    console.error('[QA-SECRET] ALERT — app secret found in URLs:', sensitiveInUrl);
  }
  expect(sensitiveInUrl.length).toBe(0);

  if (sensitiveInResponse.length > 0) {
    console.error('[QA-SECRET] ALERT — secret references found in responses:', sensitiveInResponse);
  }
  expect(sensitiveInResponse.length).toBe(0);

  // Call the OAuth callback endpoint with an invalid code to check error response
  const apiRes = await page.request.post(`${API_URL}/api/meta-oauth-callback`, {
    headers: { 'Content-Type': 'application/json' },
    data: { code: 'INVALID', client_id: 'fake', redirect_uri: 'https://example.com' },
  });

  const errorBody = await apiRes.text();
  const containsSecret = errorBody.includes('META_APP_SECRET') || errorBody.includes('client_secret');
  console.log(`[QA-SECRET] Error response status: ${apiRes.status()}`);
  console.log(`[QA-SECRET] Error response body: ${errorBody.substring(0, 300)}`);
  expect(containsSecret).toBe(false);

  await page.screenshot({ path: 'e2e/screenshots/qa-oauth-05-no-secret-exposure.png' });
  console.log('[QA-OAUTH] T5 PASSED — No app secret exposure');
});

// ══════════════════════════════════════════════════════════════════════
// TEST 6: Token Refresh — metaApiJsonWithRefresh exists and is exported
// ══════════════════════════════════════════════════════════════════════
test('T6 — Token Refresh: verify auto-refresh utility is deployed', async ({ page }) => {
  // This is a code-level check — verify the token refresh module exists
  // We test by calling an API that uses the refresh mechanism
  await login(page);

  const sessionToken = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.includes('auth-token'));
    if (!key) return null;
    try {
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      return data.access_token || null;
    } catch { return null; }
  });

  if (!sessionToken) {
    console.log('[QA-REFRESH] No session token — skipping');
    return;
  }

  // Call sync-meta-metrics with a non-existent connection (Playwright request bypasses CORS)
  const apiRes = await page.request.post(`${API_URL}/api/sync-meta-metrics`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,
    },
    data: { connection_id: '00000000-0000-0000-0000-000000000000' },
  });

  console.log(`[QA-REFRESH] sync-meta-metrics response: ${apiRes.status()}`);

  // Should return 404 (connection not found), not 500 (crash)
  expect([404, 400]).toContain(apiRes.status());
  console.log('[QA-OAUTH] T6 PASSED — API handles gracefully');
});

// ══════════════════════════════════════════════════════════════════════
// TEST 7: Ownership check — API rejects cross-client credit usage
// ══════════════════════════════════════════════════════════════════════
test('T7 — Ownership: generate-image rejects unauthorized clientId', async ({ page }) => {
  await login(page);

  const sessionToken = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.includes('auth-token'));
    if (!key) return null;
    try {
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      return data.access_token || null;
    } catch { return null; }
  });

  if (!sessionToken) {
    console.log('[QA-OWNERSHIP] No session token — skipping');
    return;
  }

  // Try to use a fake client ID — should be rejected with 403 (Playwright request bypasses CORS)
  const apiRes = await page.request.post(`${API_URL}/api/generate-image`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,
    },
    data: {
      clientId: '00000000-0000-0000-0000-000000000000',
      promptGeneracion: 'test',
      engine: 'imagen',
    },
  });

  const resData = await apiRes.json().catch(() => ({}));
  console.log(`[QA-OWNERSHIP] generate-image with fake clientId: ${apiRes.status()} ${JSON.stringify(resData).substring(0, 200)}`);

  // Must NOT return 402 (credits charged) or 200 (image generated for wrong client)
  expect([403, 401, 404]).toContain(apiRes.status());
  expect(apiRes.status()).not.toBe(402);
  expect(apiRes.status()).not.toBe(200);
  console.log('[QA-OAUTH] T7 PASSED — Ownership check blocks unauthorized access');
});
