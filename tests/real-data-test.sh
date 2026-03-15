#!/bin/bash
# Real Data Testing — pull real client data from Supabase, test with it
set -o pipefail
cd ~/steve

TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
LOGDIR="logs/qa"
FIXTURES_DIR="tests/fixtures"
mkdir -p "$LOGDIR" "$FIXTURES_DIR"

SUPABASE_URL="https://zpswjccsxjtnhetkkqde.supabase.co"
SUPABASE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-$(grep VITE_SUPABASE_PUBLISHABLE_KEY .env | cut -d'"' -f2)}"

echo "[${TIMESTAMP}] 🔍 Sacando datos reales de Supabase..."

# ══════════════════════════════════════════════
# STEP 1: Pull real edge-case data from Supabase
# ══════════════════════════════════════════════

# Products with no image
curl -s "${SUPABASE_URL}/rest/v1/shopify_products?image_url=is.null&select=id,title,client_id,price,product_type&limit=20" \
  -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" \
  > "$FIXTURES_DIR/products_no_image.json"

# Products with weird names (unicode, emoji, very long)
curl -s "${SUPABASE_URL}/rest/v1/shopify_products?select=id,title,client_id,price,image_url&order=title.desc&limit=20" \
  -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" \
  > "$FIXTURES_DIR/products_all.json"

# Clients with empty fields
curl -s "${SUPABASE_URL}/rest/v1/clients?select=id,name,company,shop_domain,client_user_id&limit=50" \
  -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" \
  > "$FIXTURES_DIR/clients_all.json"

# Platform connections (check for missing tokens, inactive)
curl -s "${SUPABASE_URL}/rest/v1/platform_connections?select=id,client_id,platform,is_active,account_id,last_sync_at&limit=50" \
  -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" \
  > "$FIXTURES_DIR/connections_all.json"

# Campaign metrics (check for zero values, nulls)
curl -s "${SUPABASE_URL}/rest/v1/campaign_metrics?select=id,client_id,campaign_name,spend,roas,conversions,impressions,clicks&limit=50" \
  -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" \
  > "$FIXTURES_DIR/campaigns_all.json"

# Email subscribers
curl -s "${SUPABASE_URL}/rest/v1/email_subscribers?select=id,email,client_id,status&limit=50" \
  -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" \
  > "$FIXTURES_DIR/subscribers_all.json"

echo "[$(date '+%H:%M:%S')] Data pulled. Analyzing edge cases..."

# ══════════════════════════════════════════════
# STEP 2: Analyze for edge cases
# ══════════════════════════════════════════════

EDGE_CASES=""

# Products without images
NO_IMG_COUNT=$(jq 'length' "$FIXTURES_DIR/products_no_image.json" 2>/dev/null || echo 0)
if [ "$NO_IMG_COUNT" -gt 0 ]; then
  EDGE_CASES="${EDGE_CASES}\n- ${NO_IMG_COUNT} productos sin imagen"
fi

# Clients with null company or shop_domain
NULL_CLIENTS=$(jq '[.[] | select(.company == null or .shop_domain == null)] | length' "$FIXTURES_DIR/clients_all.json" 2>/dev/null || echo 0)
if [ "$NULL_CLIENTS" -gt 0 ]; then
  EDGE_CASES="${EDGE_CASES}\n- ${NULL_CLIENTS} clientes con campos vacíos (company/shop_domain)"
fi

# Campaigns with 0 spend or 0 impressions
ZERO_CAMPAIGNS=$(jq '[.[] | select(.spend == "0" or .spend == null or .impressions == "0" or .impressions == null)] | length' "$FIXTURES_DIR/campaigns_all.json" 2>/dev/null || echo 0)
if [ "$ZERO_CAMPAIGNS" -gt 0 ]; then
  EDGE_CASES="${EDGE_CASES}\n- ${ZERO_CAMPAIGNS} campañas con spend/impressions en 0 o null"
fi

# Inactive connections
INACTIVE_CONN=$(jq '[.[] | select(.is_active == false)] | length' "$FIXTURES_DIR/connections_all.json" 2>/dev/null || echo 0)
if [ "$INACTIVE_CONN" -gt 0 ]; then
  EDGE_CASES="${EDGE_CASES}\n- ${INACTIVE_CONN} conexiones inactivas"
fi

echo -e "Edge cases encontrados:${EDGE_CASES}"

# ══════════════════════════════════════════════
# STEP 3: Generate and run Playwright tests with real data
# ══════════════════════════════════════════════

REAL_TEST="tests/_real-data-${TIMESTAMP}.spec.ts"

cat > "$REAL_TEST" << 'TESTEOF'
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = process.env.TEST_BASE_URL || 'https://betabgnuevosupa.vercel.app';
const FIXTURES = path.join(process.cwd(), 'tests/fixtures');

function loadFixture(name: string) {
  try {
    return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf-8'));
  } catch { return []; }
}

test.describe('Real Data Edge Cases', () => {

  test('Landing page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE);
    await page.waitForTimeout(3000);
    expect(errors).toEqual([]);
  });

  test('Auth page handles edge case emails', async ({ page }) => {
    await page.goto(`${BASE}/auth`);
    await page.waitForTimeout(2000);
    const emailField = page.locator('input[type="email"]').first();
    if (await emailField.isVisible()) {
      // Test with empty email
      await emailField.fill('');
      await page.locator('button:has-text("Iniciar")').first().click();
      await page.waitForTimeout(1000);
      // Should not crash — should show validation error

      // Test with very long email
      await emailField.fill('a'.repeat(200) + '@test.com');
      await page.locator('button:has-text("Iniciar")').first().click();
      await page.waitForTimeout(1000);
    }
  });

  test('Products without images dont crash the UI', async ({ page }) => {
    const products = loadFixture('products_no_image.json');
    if (products.length === 0) { test.skip(); return; }

    // Navigate to portal — if products without images exist, the UI should handle gracefully
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/portal`);
    await page.waitForTimeout(5000);

    // No JS errors from missing images
    const imgErrors = errors.filter(e => e.includes('image') || e.includes('null') || e.includes('undefined'));
    expect(imgErrors).toEqual([]);
  });

  test('Campaigns with zero metrics dont show NaN or Infinity', async ({ page }) => {
    const campaigns = loadFixture('campaigns_all.json');
    const zeroCampaigns = campaigns.filter((c: any) => c.spend === '0' || c.spend === null);
    if (zeroCampaigns.length === 0) { test.skip(); return; }

    await page.goto(`${BASE}/portal`);
    await page.waitForTimeout(5000);

    // Check page doesnt contain NaN or Infinity anywhere
    const body = await page.textContent('body') || '';
    expect(body).not.toContain('NaN');
    expect(body).not.toContain('Infinity');
    expect(body).not.toContain('undefined');
  });

  test('Page doesnt crash with real client data', async ({ page }) => {
    const clients = loadFixture('clients_all.json');
    const nullClients = clients.filter((c: any) => !c.company || !c.shop_domain);
    if (nullClients.length === 0) { test.skip(); return; }

    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/portal`);
    await page.waitForTimeout(5000);

    // No crashes from null client data
    expect(errors.length).toBe(0);
  });
});
TESTEOF

echo "[$(date '+%H:%M:%S')] 🧪 Corriendo tests con datos reales..."
npx playwright test "$REAL_TEST" --config playwright-qa.config.ts --reporter=line > "$LOGDIR/real-data-${TIMESTAMP}.log" 2>&1
TEST_EXIT=$?

# Cleanup test file
rm -f "$REAL_TEST"

if [ $TEST_EXIT -eq 0 ]; then
  echo "[$(date '+%H:%M:%S')] ✅ Tests con datos reales OK"
  rm -f "$LOGDIR/real-data-${TIMESTAMP}.log"
else
  FAILED=$(grep -E "failed|FAILED|✘|×|Error" "$LOGDIR/real-data-${TIMESTAMP}.log" | head -5)
  echo "[$(date '+%H:%M:%S')] ❌ Tests con datos reales FALLARON"
  openclaw message send "🚨 REAL DATA QA — Tests con datos reales fallaron a las $(date '+%H:%M %d/%m')

Edge cases en la DB:
$(echo -e "$EDGE_CASES")

Fallos:
${FAILED}

Log: $LOGDIR/real-data-${TIMESTAMP}.log" 2>/dev/null
fi

echo "[$(date '+%H:%M:%S')] Done."
