import { test } from '@playwright/test';

test('Instagram Manage Messages - Demo for Meta Review', async ({ browser }) => {
  const context = await browser.newContext({
    recordVideo: { dir: 'e2e/videos/', size: { width: 1280, height: 720 } }
  });
  const page = await context.newPage();
  
  // 1. Go to app
  await page.goto('https://betabgnuevosupa.vercel.app');
  await page.waitForTimeout(3000);
  
  // 2. Login (if needed)
  await page.screenshot({ path: 'e2e/videos/01-landing.png' });
  
  // 3. Navigate to portal
  await page.goto('https://betabgnuevosupa.vercel.app/portal');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'e2e/videos/02-portal.png' });
  
  // 4. Navigate to Meta Ads → Social Inbox
  // Try clicking on Meta Ads section
  const metaLink = page.locator('text=Meta').first();
  if (await metaLink.isVisible()) {
    await metaLink.click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: 'e2e/videos/03-meta-section.png' });
  
  // 5. Look for Social Inbox / Bandeja Social
  const inboxLink = page.locator('text=Bandeja').first();
  if (await inboxLink.isVisible()) {
    await inboxLink.click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: 'e2e/videos/04-social-inbox.png' });
  
  // 6. Look for Instagram tab
  const igTab = page.locator('text=Instagram').first();
  if (await igTab.isVisible()) {
    await igTab.click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: 'e2e/videos/05-instagram-messages.png' });
  
  // Wait a bit to show the page
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'e2e/videos/06-final.png' });
  
  await context.close(); // This saves the video
});
