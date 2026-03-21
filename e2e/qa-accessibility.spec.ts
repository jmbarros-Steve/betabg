import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.TEST_BASE_URL || 'https://betabgnuevosupa.vercel.app';

const pages = [
  { name: 'Auth / Login', path: '/auth' },
  { name: 'Landing', path: '/' },
  { name: 'FAQ', path: '/faq' },
];

for (const page of pages) {
  test(`Accessibility — ${page.name} has no critical violations`, async ({ page: p }) => {
    await p.goto(`${BASE}${page.path}`, { waitUntil: 'networkidle' });

    const results = await new AxeBuilder({ page: p })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    if (critical.length > 0) {
      console.log('Critical accessibility violations:');
      for (const v of critical) {
        console.log(`  [${v.impact}] ${v.id}: ${v.description}`);
        for (const node of v.nodes.slice(0, 3)) {
          console.log(`    - ${node.target.join(' > ')}`);
        }
      }
    }

    expect(critical).toHaveLength(0);
  });
}

test('Accessibility — Portal (authenticated) has no critical violations', async ({ page }) => {
  // Login first
  await page.goto(`${BASE}/auth`);
  await page.locator('input[type="email"]').fill('patricio.correa@jardindeeva.cl');
  await page.locator('input[type="password"]').fill('Jardin2026');
  await page.locator('button:has-text("Iniciar")').click();
  await page.waitForTimeout(8000);

  // Now check portal accessibility
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const critical = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );

  expect(critical).toHaveLength(0);
});
