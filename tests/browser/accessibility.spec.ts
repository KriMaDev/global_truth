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

test.describe('keyboard and screen readers', () => {
  test.setTimeout(120_000);

  test('Tab reaches every control, and each shows where the focus is', async ({
    page,
    isMobile,
  }) => {
    await openWorld(page);
    await expect(page.locator('#geo-toggle')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#zoom-in')).toBeVisible();
    const wanted = [
      'geo-toggle',
      'news-toggle',
      'filter-toggle',
      'rotate-toggle',
      'globe',
      'zoom-in',
      'zoom-out',
      'zoom-whole',
      ...(isMobile ? ['info-toggle'] : []),
    ].sort();
    const seen = new Set<string>();
    for (let step = 0; step < 60 && seen.size < wanted.length; step += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement;
        const style = getComputedStyle(element);
        const outlined = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        return { id: element.id, shown: outlined || style.boxShadow !== 'none' };
      });
      if (!wanted.includes(focused.id)) continue;
      seen.add(focused.id);
      expect(focused.shown, focused.id).toBe(true);
    }
    expect([...seen].sort()).toEqual(wanted);
  });

  test('Escape closes Info and goes back to its button', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Wider screens have no Info button');
    await openWorld(page);
    const button = page.locator('#info-toggle');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
  });

  test('changing the filters says how many events are left', async ({ page }) => {
    await openWorld(page);
    const announcer = page.locator('#announce');
    await expect(announcer).toHaveText('');
    await page.locator('#filter-toggle').click();
    await page.locator('[data-filter=categories-all]').click();
    await expect(announcer).toHaveText('0 events shown');
    await page.locator('[data-filter=categories-all]').click();
    await expect(announcer).toHaveText('7 events shown');
  });

  test('the disaster symbols control looks like a button and works by keyboard', async ({
    page,
    isMobile,
  }) => {
    await openWorld(page);
    if (isMobile) await page.locator('.legend-toggle').click();
    const control = page.locator('.legend-symbols summary');
    await expect(control).toHaveText('Show disaster symbols');
    await expect(control).toHaveCSS('border-top-style', 'solid');
    if (isMobile) expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await control.focus();
    await page.keyboard.press('Enter');
    await expect(control).toHaveText('Hide disaster symbols');
    await expect(page.locator('.legend-symbols ul')).toBeVisible();
  });
});
