import { test, devices } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'https://betabgnuevosupa.vercel.app';

const DEVICE_LIST = [
  { name: 'iPhone 12', config: devices['iPhone 12'] },
  { name: 'Galaxy S21', config: { viewport: { width: 360, height: 800 }, userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36', isMobile: true, hasTouch: true } },
  { name: 'iPad', config: devices['iPad (gen 7)'] },
  { name: 'Desktop 1920x1080', config: { viewport: { width: 1920, height: 1080 } } },
  { name: 'Desktop 1366x768', config: { viewport: { width: 1366, height: 768 } } },
  { name: 'Pixel 2', config: devices['Pixel 2'] },
];

const PAGES = [
  { name: 'landing', path: '/' },
  { name: 'auth', path: '/auth' },
];

for (const device of DEVICE_LIST) {
  test.describe(`${device.name}`, () => {
    test.use(device.config);

    for (const pg of PAGES) {
      test(`${pg.name} loads without errors`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        
        await page.goto(`${BASE}${pg.path}`);
        await page.waitForTimeout(3000);
        
        // Screenshot for evidence
        await page.screenshot({ 
          path: `logs/qa/screenshots/${device.name.replace(/\s/g, '_')}_${pg.name}.png`,
          fullPage: true 
        });
        
        // No JS errors
        if (errors.length > 0) {
          throw new Error(`JS errors on ${device.name}: ${errors.join(', ')}`);
        }

        // No broken layout indicators
        const body = await page.textContent('body') || '';
        if (body.includes('NaN') || body.includes('Infinity') || body.includes('undefined')) {
          throw new Error(`Broken data on ${device.name}: found NaN/Infinity/undefined`);
        }

        // Check no horizontal overflow (broken layout)
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth + 10;
        });
        if (hasOverflow) {
          throw new Error(`Horizontal overflow on ${device.name} at ${pg.path} — layout broken`);
        }
      });
    }
  });
}
