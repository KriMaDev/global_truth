/** The three maps: what each one shows and hides. Made-up events only. */
import { expect, test, type Page } from '@playwright/test';
import { knownWorld, openGlobe, showEurope } from './fixtures';

const shownLabels = (page: Page, kind: string) =>
  page.locator(`.map-label.kind-${kind}:not(.is-hidden):not(.is-crowded)`);

const openCountry = async (page: Page, name: string): Promise<void> => {
  const label = page.locator('.map-label.kind-country', { hasText: name }).first();
  await expect(label).toBeAttached({ timeout: 30_000 });
  await label.evaluate((element) => (element as HTMLElement).click());
  await expect(page.locator('#event-card .card-title')).toHaveText(name);
};

test('the News map keeps its markers', async ({ page }) => {
  await openGlobe(page, '/', { events: knownWorld() });
  await expect(page.locator('.cluster-badge').first()).toBeAttached();
  await expect(page.locator('.map-label')).toHaveCount(0);
});

test('Geography has coloured countries, no markers, and only countries, seas and capitals', async ({
  page,
}) => {
  await openGlobe(page, '/?view=geo', { events: knownWorld() });
  const globe = page.locator('#globe');
  await expect(globe).toHaveAttribute('data-markers', 'off', { timeout: 30_000 });
  await expect(page.locator('.cluster-badge')).toHaveCount(0);
  await showEurope(page);
  await expect(shownLabels(page, 'country').first()).toBeAttached();
  await expect(page.locator('.map-label.kind-capital').first()).toBeAttached();
  for (const kind of ['river', 'lake', 'peak', 'range', 'desert']) {
    await expect(page.locator(`.map-label.kind-${kind}`)).toHaveCount(0);
  }
});

test('a country on Geography shows its news, and Back returns to it', async ({ page }) => {
  await openGlobe(page, '/?view=geo', { events: knownWorld() });
  await showEurope(page);
  await openCountry(page, 'France');
  const row = page.locator('#event-card .card-list-item');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Made-up headline about a vote');
  const newsFirst = await page.evaluate(() => {
    const news = document.querySelector('#event-card .place-events');
    const article = document.querySelector('#event-card .place-text');
    return Boolean(news && article && news.compareDocumentPosition(article) & 4);
  });
  expect(newsFirst, 'the news comes before the long article').toBe(true);
  await row.click();
  await expect(page.locator('#event-card .card-title')).toContainText('Made-up headline');
  await page.locator('#event-card .card-back').first().click();
  await expect(page.locator('#event-card .card-title')).toHaveText('France');
});

test('a country with no news says so', async ({ page }) => {
  await openGlobe(page, '/?view=geo', { events: knownWorld() });
  await showEurope(page);
  await openCountry(page, 'Germany');
  await expect(page.locator('#event-card .place-events')).toContainText('No news here');
});

test('the Atlas has no news at all, and countries still open their card', async ({ page }) => {
  await openGlobe(page, '/?view=atlas', { events: knownWorld() });
  await expect(page.locator('#globe')).toHaveAttribute('data-markers', 'off', { timeout: 30_000 });
  await expect(page.locator('.legend-atlas')).toBeVisible();
  for (const hidden of ['#news-toggle', '#filter-toggle', '.legend-head']) {
    await expect(page.locator(hidden)).toBeHidden();
  }
  await showEurope(page);
  await openCountry(page, 'France');
  await expect(page.locator('#event-card .place-events')).toHaveCount(0);
});

test('switching to the Atlas closes what belongs to the news', async ({ page }) => {
  await openGlobe(page, '/', { events: knownWorld() });
  await page.locator('#news-toggle').click();
  await expect(page.locator('#news-panel')).toBeVisible();
  await page.locator('#view-atlas').click();
  await expect(page.locator('#news-panel')).toBeHidden();
  await expect(page).not.toHaveURL(/list=1/);
});

for (const path of ['/', '/?view=geo', '/?view=atlas']) {
  test(`the top row fits on the smallest phone at ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openGlobe(page, path, { events: knownWorld() });
    await expect(page.locator('#view-switch')).toBeVisible({ timeout: 30_000 });
    const fits = await page.evaluate(() => {
      const areas = [...document.querySelectorAll<HTMLElement>('.topbar-actions > *')]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => element.getBoundingClientRect());
      return areas.every(
        (a) => a.right <= window.innerWidth && Math.abs(a.top - areas[0]!.top) < 2,
      );
    });
    expect(fits).toBe(true);
  });
}
