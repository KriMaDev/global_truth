/** The About, Sources and Legal pages. Made-up feed data only. */
import { expect, test } from '@playwright/test';
import { feedsDocument, serveWorld } from './fixtures';

for (const path of ['/about/', '/sources/', '/legal/']) {
  test(`${path} fits the screen, and its in-page links lead somewhere`, async ({ page }) => {
    await serveWorld(page);
    await page.goto(path);
    // The release number and build date, linked to the changelog (src/version.ts).
    await expect(page.locator('#version')).toHaveText(
      /^Version \d+\.\d+\.\d+\+? · \d{4}-\d{2}-\d{2}$/,
    );
    await expect(page.locator('#version')).toHaveAttribute('href', /\/CHANGELOG\.md$/);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="#"]')]
        .map((a) => a.getAttribute('href') ?? '')
        .filter((href) => href.length > 1 && !document.querySelector(href)),
    );
    expect(broken).toEqual([]);
  });
}

// GDPR review of 14 November 2026: the full set of rights, the safeguard for data sent to the US,
// a way to have a headline about oneself removed, and where messages written to us are handled.
test('Legal lists every right and how to have a headline removed', async ({ page }) => {
  await serveWorld(page);
  await page.goto('/legal/');
  const privacy = page.locator('#privacy');
  await expect(privacy).toContainText('corrected or deleted, restrict its use or object to it');
  await expect(privacy).toContainText('Data Privacy Framework');
  await expect(privacy.locator('a[href="https://krimadev.com/privacy-policy/"]')).toHaveCount(1);
  await expect(page.locator('#corrections')).toContainText('a headline names you');
});

const outlets = {
  outlets: [
    {
      name: 'BBC News',
      slug: 'bbc-news',
      domain: 'bbc.co.uk',
      country: 'United Kingdom',
      region: 'Europe',
      ownership: 'public',
      ownership_label: 'Public',
      events: 7,
    },
  ],
  providers: [],
};

test('Sources shows each feed and how many events each outlet has', async ({ page }) => {
  await serveWorld(page, { feeds: feedsDocument({ gdelt: { status: 'partial' } }), outlets });
  await page.goto('/sources/');
  await expect(page.locator('#feed-rows tr')).toHaveCount(3);
  await expect(page.locator('#feed-rows')).toContainText('Some data missing');
  await expect(page.locator('#feed-summary')).toContainText('Updated');
  await expect(page.locator('#outlet-bbc-news [data-count]')).toHaveText('7');
  expect(await page.locator('[data-count]').count()).toBeGreaterThan(20);
  expect(await page.locator('#outlets tbody .badge-state').count()).toBeGreaterThan(0);
});

test('a link to one outlet lands on it', async ({ page }) => {
  await serveWorld(page, { outlets });
  await page.goto('/sources/#outlet-bbc-news');
  await expect(page.locator('#outlet-bbc-news')).toBeInViewport();
});

test('Sources says so when the status cannot be loaded, and still lists the outlets', async ({
  page,
}) => {
  await serveWorld(page, { feeds: 'missing' });
  await page.route('**/data/outlets.json', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/sources/');
  await expect(page.locator('#feed-summary')).toContainText("couldn't be loaded");
  await expect(page.locator('#feed-table')).toBeHidden();
  expect(await page.locator('[data-count]').count()).toBeGreaterThan(20);
});
