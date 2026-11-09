/** The three maps: what each one shows and hides. Made-up events only. */
import { expect, test, type Page } from '@playwright/test';
import {
  altitude,
  knownWorld,
  openEvent,
  openGlobe,
  showEurope,
  syntheticEvent,
  view,
} from './fixtures';

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

test('with a mouse, clicking a place name leaves the globe still afterwards', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Mouse only');
  await openGlobe(page, '/?view=atlas', { events: knownWorld() });
  await page.locator('#rotate-toggle').click();
  await expect(page.locator('.map-label').first()).toBeAttached({ timeout: 30_000 });
  await page.waitForTimeout(800);
  const spot = await page.evaluate(() => {
    for (const label of document.querySelectorAll<HTMLElement>('.map-label')) {
      if (label.matches('.is-hidden, .is-crowded')) continue;
      const area = label.getBoundingClientRect();
      const x = area.x + area.width / 2;
      const y = area.y + area.height / 2;
      if (area.width && document.elementFromPoint(x, y) === label) return { x, y };
    }
    return null;
  });
  if (!spot) throw new Error('No label to click');
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(page.locator('#event-card .card-title')).not.toBeEmpty({ timeout: 10_000 });
  // The flight to the place, which takes longer without a graphics card.
  let before = await view(page);
  for (let check = 0; check < 40; check += 1) {
    await page.waitForTimeout(500);
    const now = await view(page);
    if (now.join() === before.join()) break;
    before = now;
  }
  await page.mouse.move(spot.x + 200, spot.y + 120, { steps: 12 });
  await page.waitForTimeout(400);
  expect(await view(page)).toEqual(before);
});

test('zoomed in, news at the same place fans out and each can be opened', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Checked with a mouse; the tap target is the same');
  test.setTimeout(150_000);
  const same = { place: 'Testville', published: new Date().toISOString() };
  const events = ['one', 'two', 'three'].map((name) =>
    syntheticEvent(name, 43.7, -79.4, { ...same, title: `Stacked headline ${name}` }),
  );
  await openGlobe(page, '/', { events });
  await page.locator('#rotate-toggle').click();
  await openEvent(page, 'one');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1800);
  for (let step = 0; step < 4; step += 1) {
    await page.locator('#zoom-in').click();
    await page.waitForTimeout(700);
  }
  expect(await altitude(page)).toBeLessThan(0.9);
  await expect(page.locator('#globe')).toHaveAttribute('data-fanned', '3');
  await openEvent(page, 'one'); // Settles the camera where every later open will leave it.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1800);

  const size = page.viewportSize()!;
  const found = new Set<string>();
  search: for (let y = 70; y < size.height * 0.42; y += 20) {
    for (let x = size.width / 2 - 120; x <= size.width / 2 + 120; x += 20) {
      await page.mouse.click(x, y, { delay: 120 });
      const title = page.locator('#event-card .card-title');
      if (await title.isVisible()) {
        found.add((await title.textContent()) ?? '');
        await page.keyboard.press('Escape');
        await page
          .locator('#event-card .card-close')
          .click({ timeout: 300 })
          .catch(() => {});
        await page.waitForTimeout(1500);
        if (found.size === 3) break search;
      }
    }
  }
  expect([...found].sort()).toEqual([
    'Stacked headline one',
    'Stacked headline three',
    'Stacked headline two',
  ]);
});

test('the United States shows its states, and a state opens its card', async ({ page }) => {
  await openGlobe(page, '/?view=geo', { events: knownWorld() });
  await expect(page.locator('.map-label').first()).toBeAttached({ timeout: 30_000 });
  await openEvent(page, 'group-1');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1800);
  await page.locator('#zoom-in').click();
  await page.waitForTimeout(800);
  await page.locator('#zoom-in').click();
  const state = page.locator('.map-label.kind-state').first();
  await expect(state).toBeAttached({ timeout: 15_000 });
  await state.evaluate((element) => (element as HTMLElement).click());
  await expect(page.locator('#event-card .card-kind')).toContainText('State');
  await expect(page.locator('#event-card a[href*="wikipedia.org"]').first()).toBeAttached();
});
