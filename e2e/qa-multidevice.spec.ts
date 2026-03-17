import { test, devices } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'https://www.steve.cl';

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
  for (const pg of PAGES) {
    test(`${device.name} — ${pg.name} loads without errors`, async ({ browser }) => {
      const context = await browser.newContext(device.config);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));

      await page.goto(`${BASE}${pg.path}`);
      await page.waitForTimeout(3000);

      await page.screenshot({
        path: `logs/qa/screenshots/${device.name.replace(/\s/g, '_')}_${pg.name}.png`,
        fullPage: true,
      });

      if (errors.length > 0) {
        await context.close();
        throw new Error(`JS errors on ${device.name}: ${errors.join(', ')}`);
      }

      const body = await page.textContent('body') || '';
      if (body.includes('NaN') || body.includes('Infinity') || body.includes('undefined')) {
        await context.close();
        throw new Error(`Broken data on ${device.name}: found NaN/Infinity/undefined`);
      }

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 10;
      });
      if (hasOverflow) {
        await context.close();
        throw new Error(`Horizontal overflow on ${device.name} at ${pg.path} — layout broken`);
      }

      await context.close();
    });
  }
}
