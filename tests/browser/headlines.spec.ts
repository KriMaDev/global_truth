/** The Headlines panel, including when data is old, missing or failing. Made-up events only. */
import { expect, test, type Page } from '@playwright/test';
import { ago, feedsDocument, knownWorld, openGlobe, watchProblems } from './fixtures';

const rows = (page: Page) => page.locator('#news-panel [data-event-id]');
const panel = (page: Page) => page.locator('#news-panel');
const warnings = (page: Page) => page.locator('#news-panel .news-warning');

test('it opens, counts its rows, and shows headlines word for word', async ({ page }) => {
  const problems = watchProblems(page);
  await openGlobe(page, '/', { events: knownWorld() });
  await expect(panel(page)).toBeHidden();

  await page.locator('#news-toggle').click();
  await expect(panel(page)).toBeVisible();
  await expect(page).toHaveURL(/list=1/);
  await expect(page.locator('#news-title')).toBeFocused();
  await expect(rows(page)).toHaveCount(7);
  await expect(page.locator('[data-news=count]')).toContainText('7 events');
  await expect(warnings(page)).toHaveCount(0);
  await expect(panel(page)).toContainText('Made-up headline about a vote in a test city');
  expect(problems).toEqual([]);
});

test('most severe comes first, and it can sort by newest', async ({ page }) => {
  await openGlobe(page, '/?list=1', { events: knownWorld() });
  await expect(rows(page).first()).toHaveAttribute('data-event-id', 'war-ua');

  await page.locator('[data-news=sort-newest]').click();
  await expect(page.locator('[data-news=sort-newest]')).toHaveAttribute('aria-pressed', 'true');
  const times = await page
    .locator('#news-panel time')
    .evaluateAll((all) => all.map((t) => Date.parse((t as HTMLTimeElement).dateTime)));
  expect(times.length).toBe(7);
  expect(times.every((time, i) => i === 0 || times[i - 1] >= time)).toBe(true);
});

test('a row opens its card, and Back returns to the same row', async ({ page }) => {
  await openGlobe(page, '/?list=1', { events: knownWorld() });
  const row = page.locator('#news-panel [data-event-id="quake-jp"]');
  await row.click();

  await expect(page.locator('#event-card-title')).toHaveText('M 6.0 test earthquake');
  await expect(panel(page)).toBeHidden();
  await expect(page).not.toHaveURL(/list=1/);

  const back = page.locator('#event-card .card-back');
  await expect(back).toContainText('headlines');
  await back.click();
  await expect(panel(page)).toBeVisible();
  await expect(page.locator('#event-card')).toBeHidden();
  await expect(row).toBeFocused();
});

test('Escape closes it and puts the focus back on the button', async ({ page }) => {
  await openGlobe(page, '/', { events: knownWorld() });
  await page.locator('#news-toggle').click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(page.locator('#news-toggle')).toBeFocused();
  await expect(page).not.toHaveURL(/list=1/);
});

test('the address can open it with a filter already set', async ({ page }) => {
  await openGlobe(page, '/?range=24h&list=1', { events: knownWorld() });
  await expect(panel(page)).toBeVisible();
  await expect(rows(page)).toHaveCount(6);
  await expect(page).toHaveURL(/range=24h/);
  await expect(page).toHaveURL(/list=1/);
});

test('with Filters: beside the list on wide screens, in its place on narrow ones', async ({
  page,
  isMobile,
}) => {
  await openGlobe(page, '/?list=1', { events: knownWorld() });
  await page.locator('#filter-toggle').click();
  await expect(page.locator('#filter-panel')).toBeVisible();
  if (isMobile) {
    await expect(panel(page)).toBeHidden();
    return;
  }
  await expect(panel(page)).toBeVisible();
  await page.locator('[data-filter=categories] .chip', { hasText: 'Politics' }).click();
  await expect(rows(page)).toHaveCount(4);
});

test('old data and a failed feed are said plainly', async ({ page }) => {
  await openGlobe(page, '/?list=1', {
    events: knownWorld(),
    dataAgeMinutes: 200,
    feeds: feedsDocument({ gdacs: { status: 'error', last_success: ago(200) } }, ago(200)),
  });
  await expect(warnings(page).filter({ hasText: 'Data may be out of date' })).toHaveCount(1);
  await expect(warnings(page).filter({ hasText: 'GDACS failed' })).toHaveCount(1);
});

test('a partly read feed is said plainly', async ({ page }) => {
  await openGlobe(page, '/?list=1', {
    events: knownWorld(),
    feeds: feedsDocument({ gdelt: { status: 'partial' } }),
  });
  await expect(warnings(page).filter({ hasText: 'GDELT was read only in part' })).toHaveCount(1);
});

test('no matching events: it says so and offers Clear filters', async ({ page }) => {
  await openGlobe(page, '/?sev=none&list=1', { events: knownWorld() });
  const empty = page.locator('#news-panel .news-empty');
  await expect(empty).toContainText('No events match');

  await empty.locator('button').click();
  await expect(rows(page)).toHaveCount(7);
  await expect(page.locator('#news-title')).toBeFocused();
});

test('without the feed status it still works', async ({ page }) => {
  await openGlobe(page, '/?list=1', { events: knownWorld(), feeds: 'missing' });
  await expect(rows(page)).toHaveCount(7);
  await expect(page.locator('[data-news=updated]')).toContainText('Updated');
  await expect(page.locator('[data-news=details]')).toBeHidden();
});

test('when the events cannot be loaded, it says so', async ({ page }) => {
  await openGlobe(page, '/?list=1', { eventsFail: true, daysFail: true });
  await expect(page.locator('#news-panel .news-empty')).toContainText("couldn't be loaded");
});

test('when only the latest file fails, older days fill in and it says so', async ({ page }) => {
  await openGlobe(page, '/?range=7d&list=1', { events: knownWorld(), eventsFail: true });
  await expect(rows(page).first()).toBeVisible();
  await expect(warnings(page).filter({ hasText: 'may be older' })).toHaveCount(1);
});
