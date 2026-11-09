/** Automatic accessibility checks (axe) on every page and panel. Made-up data only. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { knownWorld, openEvent, openGlobe, serveWorld } from './fixtures';

/** Fails on anything axe rates serious or critical, and says where it is. */
async function expectNoSeriousProblems(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations
    .filter((found) => found.impact === 'serious' || found.impact === 'critical')
    .map((found) => ({
      rule: found.id,
      where: found.nodes.slice(0, 6).map((node) => node.target.join(' ')),
    }));
  expect(serious).toEqual([]);
}

const openWorld = (page: Page, path = '/') => openGlobe(page, path, { events: knownWorld() });

test.describe('axe finds nothing serious', () => {
  test.setTimeout(120_000);

  test('the globe page', async ({ page }) => {
    await openWorld(page);
    await expectNoSeriousProblems(page);
  });

  test('Filters', async ({ page }) => {
    await openWorld(page);
    await page.locator('#filter-toggle').click();
    await expect(page.locator('#filter-panel')).toBeVisible();
    await expectNoSeriousProblems(page);
  });

  test('Headlines', async ({ page }) => {
    await openWorld(page);
    await page.locator('#news-toggle').click();
    await expect(page.locator('#news-panel')).toBeVisible();
    await expectNoSeriousProblems(page);
  });

  test('an event card', async ({ page }) => {
    await openWorld(page);
    await openEvent(page, 'war-ua');
    await expectNoSeriousProblems(page);
  });

  test('a group list', async ({ page }) => {
    await openWorld(page);
    await expect(page.locator('.cluster-badge').first()).toBeAttached();
    await page.evaluate(() => document.querySelector<HTMLElement>('.cluster-badge')?.click());
    await expect(page.locator('#event-card')).toBeVisible();
    await expectNoSeriousProblems(page);
  });

  test('the open legend', async ({ page }) => {
    await openWorld(page);
    const toggle = page.locator('.legend-toggle');
    if (await toggle.isVisible()) await toggle.click(); // Wider screens always show it all.
    await expect(page.locator('.legend-more')).toBeVisible();
    await expectNoSeriousProblems(page);
  });

  test('the open Info panel', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Wider screens always show it, and are covered by the globe page test');
    await openWorld(page);
    await page.locator('#info-toggle').click();
    await expect(page.locator('#info-panel')).toBeVisible();
    await expectNoSeriousProblems(page);
  });

  test('the Geography view', async ({ page }) => {
    await openWorld(page, '/?view=geo');
    await expect(page.locator('.map-label:not(.is-hidden):not(.is-crowded)').first()).toBeAttached({
      timeout: 30_000,
    });
    await expectNoSeriousProblems(page);
  });

  test('a place card', async ({ page }) => {
    await openWorld(page, '/?view=geo');
    const label = page.locator('.map-label.kind-country:not(.is-hidden):not(.is-crowded)').first();
    await expect(label).toBeAttached({ timeout: 30_000 });
    await label.evaluate((element) => (element as HTMLElement).click());
    await expect(page.locator('#event-card .card-title')).not.toBeEmpty();
    await expectNoSeriousProblems(page);
  });

  for (const path of ['/about/', '/sources/', '/legal/', '/404.html']) {
    test(`the page ${path}`, async ({ page }) => {
      await serveWorld(page);
      await page.goto(path);
      await expectNoSeriousProblems(page);
    });
  }
});
