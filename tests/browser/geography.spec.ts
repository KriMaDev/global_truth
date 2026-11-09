/** The geography view: the switch, the labels, and place cards. Made-up events only. */
import { expect, test, type Page } from '@playwright/test';
import { knownWorld, openGlobe, showEurope, watchProblems } from './fixtures';

const shownLabels = (page: Page) => page.locator('.map-label:not(.is-hidden):not(.is-crowded)');

test('the switch changes the map and the address, and back again', async ({ page }) => {
  const problems = watchProblems(page);
  await openGlobe(page, '/', { events: knownWorld() });
  const toggle = page.locator('#geo-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/view=geo/);
  await expect(shownLabels(page).first()).toBeAttached({ timeout: 30_000 });

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page).not.toHaveURL(/view=geo/);
  await expect(page.locator('.map-label')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('the country shapes are drawn as one object, also after switching away and back', async ({
  page,
}) => {
  await openGlobe(page, '/?view=geo', { events: knownWorld() });
  const globe = page.locator('#globe');
  await expect(globe).toHaveAttribute('data-shapes', /^[1-9]\d+$/, { timeout: 30_000 });

  await page.locator('#geo-toggle').click();
  await expect(globe).not.toHaveAttribute('data-shapes');

  await page.locator('#geo-toggle').click();
  await expect(globe).toHaveAttribute('data-shapes', /^[1-9]\d+$/, { timeout: 30_000 });
});

test('a country label opens "About this place", with where its text comes from', async ({
  page,
}) => {
  await openGlobe(page, '/?view=geo', { events: knownWorld() });
  const label = page.locator('.map-label.kind-country:not(.is-hidden):not(.is-crowded)').first();
  await expect(label).toBeAttached({ timeout: 30_000 });
  await label.evaluate((element) => (element as HTMLElement).click());

  const card = page.locator('#event-card');
  await expect(card.locator('.card-kind')).toContainText('Country');
  await expect(card.locator('.card-title')).not.toBeEmpty();
  await expect(card.locator('a[href*="wikipedia.org"]').first()).toBeAttached();
});

/** A press lasting as long as a real one: globe.gl only looks under the pointer every 50 ms. */
async function press(page: Page, isMobile: boolean, x: number, y: number): Promise<void> {
  if (!isMobile) {
    await page.mouse.click(x, y, { delay: 150 });
    return;
  }
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(150);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}

test('a country pressed on the map itself opens its card', async ({
  page,
  isMobile,
  browserName,
  viewport,
}) => {
  test.skip(browserName !== 'chromium', 'The touch tool exists in Chromium and Edge only');
  test.setTimeout(120_000); // Software graphics here run at a few frames a second.
  await openGlobe(page, '/?view=geo', { events: knownWorld() });
  await page.locator('#rotate-toggle').click();
  await showEurope(page);
  await expect(page.locator('.map-label').first()).toBeAttached({ timeout: 30_000 });
  await page.waitForTimeout(2500); // The country shapes are built in the background.

  const card = page.locator('#event-card');
  const { width, height } = viewport ?? { width: 412, height: 839 };
  // The side of the globe in view depends on the time of day, so try across all of it.
  const across = [0.3, 0.4, 0.5, 0.6, 0.7];
  for (const [fx, fy] of across.flatMap((x) => [0.3, 0.42, 0.54, 0.66].map((y) => [x, y]))) {
    await press(page, isMobile, width * fx, height * fy);
    const opened = await card
      .waitFor({ state: 'visible', timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      await expect(card.locator('.card-kind')).toContainText('Country');
      return;
    }
  }
  throw new Error('No press on the map opened a country');
});

test('close up, the map names rivers, lakes or mountains, not only countries', async ({ page }) => {
  await openGlobe(page, '/?view=geo', { events: knownWorld() });
  await expect(shownLabels(page).first()).toBeAttached({ timeout: 30_000 });
  await showEurope(page);
  await page.locator('#zoom-in').click();
  await page.waitForTimeout(800);
  const nature =
    '.map-label.kind-river, .map-label.kind-lake, .map-label.kind-range, .map-label.kind-peak';
  await expect.poll(() => page.locator(nature).count(), { timeout: 15_000 }).toBeGreaterThan(0);
});
