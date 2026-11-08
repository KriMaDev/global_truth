/** The Filters panel and the web address that remembers it. Made-up events only. */
import { expect, test, type Page } from '@playwright/test';
import { knownWorld, openGlobe } from './fixtures';

const chip = (page: Page, group: string, name: string) =>
  page.locator(`[data-filter=${group}] .chip`, { hasText: name });
const summary = (page: Page) => page.locator('#legend-summary');

test.beforeEach(async ({ page }) => {
  await openGlobe(page, '/', { events: knownWorld() });
  await page.locator('#filter-toggle').click();
  await expect(page.locator('#filter-panel')).toBeVisible();
});

test('everything is on at first, and the address stays clean', async ({ page }) => {
  const pressed = await page
    .locator('[data-filter=categories] .chip')
    .evaluateAll((chips) => chips.map((c) => c.getAttribute('aria-pressed')));
  expect(pressed.length).toBeGreaterThan(5);
  expect(pressed.every((value) => value === 'true')).toBe(true);
  await expect(chip(page, 'categories', 'Sport')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#filter-toggle .toggle-count')).toHaveText('');
  await expect(summary(page)).toBeHidden();
  expect(new URL(page.url()).search).toBe('');
});

test('turning a category off narrows the events, and survives a reload', async ({ page }) => {
  await chip(page, 'categories', 'Politics').click();
  await expect(summary(page)).toContainText('Showing 4 of 7');
  await expect(page).toHaveURL(/cat=/);
  await expect(page.locator('#filter-toggle .toggle-count')).not.toHaveText('');

  await page.reload();
  await expect(page.locator('#rotate-toggle')).toBeVisible({ timeout: 60_000 });
  await expect(summary(page)).toContainText('Showing 4 of 7');
});

test('Clear filters brings everything back', async ({ page }) => {
  await chip(page, 'severities', 'Critical').click();
  await expect(summary(page)).toContainText('Showing 6 of 7');
  await expect(page).toHaveURL(/sev=/);

  await page.locator('[data-filter=clear]').click();
  await expect(summary(page)).toBeHidden();
  expect(new URL(page.url()).search).toBe('');
});

test('All off leaves no events and says so in the address', async ({ page }) => {
  await page.locator('[data-filter=categories-all]').click();
  await expect(summary(page)).toContainText('Showing 0 of 7');
  await expect(page).toHaveURL(/cat=none/);
});

test('a shorter time window leaves older events out', async ({ page }) => {
  await chip(page, 'time', '24 h').click();
  await expect(summary(page)).toContainText('Showing 6 of');
  await expect(page).toHaveURL(/range=24h/);
});

test('choosing a place narrows the events, and All goes back', async ({ page }) => {
  await page.locator('[data-filter=place] .place-select').selectOption('Europe');
  await expect(summary(page)).toContainText('Showing 2 of 7');
  await expect(page).toHaveURL(/place=Europe/);

  await page.locator('[data-filter=place] button.place-crumb', { hasText: 'All' }).click();
  await expect(summary(page)).toBeHidden();
});
