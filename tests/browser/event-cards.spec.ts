/** Event cards and group lists: what they say, and how they close. Made-up events only. */
import { expect, test } from '@playwright/test';
import { knownWorld, openEvent, openGlobe, watchProblems } from './fixtures';

test('a news card shows the headline word for word, its outlet and why it is rated', async ({
  page,
}) => {
  const problems = watchProblems(page);
  await openGlobe(page, '/', { events: knownWorld() });
  await openEvent(page, 'news-fr');

  const card = page.locator('#event-card');
  await expect(page.locator('#event-card-title')).toHaveText(
    'Made-up headline about a vote in a test city',
  );
  await expect(card.locator('.card-kind')).toContainText('News report');
  await expect(card.locator('.card-reason')).toContainText('Headline reports 3 deaths');
  await expect(card.locator('.card-source-list a').first()).toHaveAttribute(
    'href',
    /^https:\/\/example\.org\//,
  );
  // No article text, ever: only what the outlet's headline says.
  await expect(card.locator('.card-snippet')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  expect(problems).toEqual([]);
});

test('a data feed is told apart from a news report', async ({ page }) => {
  await openGlobe(page, '/', { events: knownWorld() });
  await openEvent(page, 'quake-jp');
  await expect(page.locator('#event-card .card-kind')).toContainText('Data feed');
  await expect(page.locator('#event-card')).toContainText('USGS');
});

test('a state-affiliated outlet is labelled on the card', async ({ page }) => {
  await openGlobe(page, '/', { events: knownWorld() });
  await openEvent(page, 'war-ua');
  await expect(page.locator('#event-card .badge-state')).toContainText('State-affiliated');
});

test('the close button closes the card', async ({ page }) => {
  await openGlobe(page, '/', { events: knownWorld() });
  await openEvent(page, 'news-fr');
  await page.locator('#event-card .card-close').first().click();
  await expect(page.locator('#event-card')).toBeHidden();
});

test('a group opens as a list, its rows open cards, and Back returns', async ({ page }) => {
  await openGlobe(page, '/', { events: knownWorld() });
  const card = page.locator('#event-card');
  await expect(page.locator('.cluster-badge').first()).toBeAttached();
  await page.evaluate(() => document.querySelector<HTMLElement>('.cluster-badge')?.click());

  await expect(card.locator('.card-kind')).toContainText('Group · 2 events');
  const rows = card.locator('.card-list-item');
  await expect(rows).toHaveCount(2);

  await rows.first().click();
  await expect(page.locator('#event-card-title')).toContainText('in a group');

  await card.locator('.card-back').click();
  await expect(card.locator('.card-kind')).toContainText('Group · 2 events');
});
