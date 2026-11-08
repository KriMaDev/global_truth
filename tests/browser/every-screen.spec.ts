/**
 * Touch screens of every size, and laptops: everything can be tapped, and nothing covers
 * anything else. Made-up events only.
 */
import { expect, test, type Page } from '@playwright/test';
import { box, knownWorld, openEvent, openGlobe } from './fixtures';

async function smallestHeight(page: Page, selector: string): Promise<number> {
  const heights = await page
    .locator(`${selector}:visible`)
    .evaluateAll((all) => all.map((e) => e.getBoundingClientRect().height));
  expect(heights.length, `${selector} is on screen`).toBeGreaterThan(0);
  return Math.min(...heights);
}

async function expectTappable(page: Page, selectors: string[]): Promise<void> {
  for (const selector of selectors) {
    expect(await smallestHeight(page, selector), selector).toBeGreaterThanOrEqual(44);
  }
}

/** The open panel starts under the top row, and stops above the footer's right side. */
async function expectPanelFits(page: Page, panel: string): Promise<void> {
  await page.waitForTimeout(400); // The panel slides in by a few pixels.
  const area = await box(page, panel);
  const row = await box(page, '.topbar-actions');
  expect(area.y, `${panel} under the top row`).toBeGreaterThanOrEqual(row.y + row.height);
  const footer = await box(page, '.bottom-right');
  expect(area.y + area.height, `${panel} above the footer`).toBeLessThanOrEqual(footer.y + 1);
  await expect(page.locator('#zoom-controls')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

const TOUCH_SCREENS = [
  ['phone sideways', 844, 390],
  ['small tablet', 768, 1024],
  ['tablet', 820, 1180],
  ['small tablet sideways', 1024, 768],
  ['tablet sideways', 1180, 820],
  ['large tablet sideways', 1366, 1024],
] as const;

for (const [name, width, height] of TOUCH_SCREENS) {
  test.describe(name, () => {
    test.use({ viewport: { width, height } });
    test.skip(({ isMobile }) => !isMobile, 'Touch screens only');

    test('everything can be tapped, and panels fit', async ({ page }) => {
      await openGlobe(page, '/', { events: knownWorld() });
      await expectTappable(page, [
        '.topbar-actions button',
        '.view-option',
        '.zoom-button',
        '#info-toggle',
        '.legend-head',
      ]);
      await expect(page.locator('.legend-toggle')).toHaveAttribute('aria-expanded', 'false');
      const tops = await page
        .locator('.topbar-actions button:visible')
        .evaluateAll((all) => all.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size, 'the controls stay on one row').toBe(1);

      await page.locator('#filter-toggle').click();
      await expect(page.locator('#filter-panel')).toBeVisible();
      await expectPanelFits(page, '#filter-panel');
      await expectTappable(page, [
        '#filter-panel .chip',
        '#filter-panel .filter-all',
        '#filter-panel .card-close',
        '#filter-panel .place-select',
      ]);

      await page.locator('#filter-toggle').click();
      await page.locator('#news-toggle').click();
      await expect(page.locator('#news-panel')).toBeVisible();
      await expectPanelFits(page, '#news-panel');
      await expectTappable(page, ['#news-panel .chip', '#news-panel .card-close']);

      await page.keyboard.press('Escape');
      await openEvent(page, 'news-fr');
      await expectPanelFits(page, '#event-card');
      await expectTappable(page, ['#event-card .card-close']);
    });
  });
}

for (const [width, height] of [
  [1366, 768],
  [1280, 600],
  [1440, 900],
] as const) {
  test.describe(`laptop ${width}×${height}`, () => {
    test.use({ viewport: { width, height } });
    test.skip(({ isMobile }) => isMobile, 'Screens without touch only');

    test('panels fit between the top row and the footer', async ({ page }) => {
      await openGlobe(page, '/', { events: knownWorld() });
      await page.locator('#filter-toggle').click();
      await expect(page.locator('#filter-panel')).toBeVisible();
      await expectPanelFits(page, '#filter-panel');

      await page.keyboard.press('Escape');
      await page.locator('#news-toggle').click();
      await expect(page.locator('#news-panel')).toBeVisible();
      await expectPanelFits(page, '#news-panel');

      await page.keyboard.press('Escape');
      await openEvent(page, 'news-fr');
      await expectPanelFits(page, '#event-card');
    });
  });
}
