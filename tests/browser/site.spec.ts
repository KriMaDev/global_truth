/**
 * Every page in a real browser, under the site's real security policy. `vite preview` doesn't apply
 * frontend/public/_headers, so each test adds the policy to the page itself.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const policy = /Content-Security-Policy: (.+)/.exec(
  readFileSync('frontend/public/_headers', 'utf8'),
)?.[1];

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': policy ?? '' },
    });
  });
});

const pages = [
  ['/about/', 'About World News Globe'],
  ['/sources/', 'Sources'],
  ['/legal/', 'Legal and privacy'],
] as const;

for (const [path, heading] of pages) {
  test(`${path} shows its heading and breaks no security rule`, async ({ page }) => {
    const refused: string[] = [];
    page.on('console', (message) => {
      if (/content security policy/i.test(message.text())) refused.push(message.text());
    });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.locator('#version')).toContainText('Version');
    expect(refused).toEqual([]);
  });
}

test('the globe page starts without breaking a security rule', async ({ page }) => {
  const refused: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) refused.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('#version')).toContainText('Version');
  await page.waitForTimeout(1500);
  expect(refused).toEqual([]);
});
