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

/** Text smaller than 11 px on the page, with where it is. */
const tinyText = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const hasText = [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        return hasText && element.getClientRects().length > 0 && !element.closest('.sr-only');
      })
      .filter((element) => parseFloat(getComputedStyle(element).fontSize) < 10.99)
      .map((element) => `${element.tagName}.${element.className}`),
  );

/** Whether the top row's controls sit on one line, inside the screen. */
const topRowFits = (page: Page) =>
  page.evaluate(() => {
    const controls = [...document.querySelectorAll<HTMLElement>('.topbar-actions > *')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => element.getBoundingClientRect());
    return (
      controls.every((area) => Math.abs(area.top - (controls[0]?.top ?? 0)) < 2) &&
      controls.every((area) => area.right <= window.innerWidth)
    );
  });

const panelInsideScreen = (page: Page, selector: string) =>
  page.evaluate((target) => {
    const area = document.querySelector(target)?.getBoundingClientRect();
    return (
      Boolean(area) &&
      Number(area?.right) <= window.innerWidth + 1 &&
      Number(area?.bottom) <= window.innerHeight + 1 &&
      Number(area?.left) >= -1
    );
  }, selector);

test.describe('readable text', () => {
  test.setTimeout(120_000);

  test('no text under 11 px on the globe and its panels', async ({ page, isMobile }) => {
    await openWorld(page, '/?view=geo');
    await expect(page.locator('.map-label').first()).toBeAttached({ timeout: 30_000 });
    expect(await tinyText(page)).toEqual([]);
    if (isMobile) await page.locator('.legend-toggle').click();
    expect(await tinyText(page)).toEqual([]);
    await page.locator('#filter-toggle').click();
    expect(await tinyText(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.locator('#news-toggle').click();
    expect(await tinyText(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await openEvent(page, 'war-ua');
    expect(await tinyText(page)).toEqual([]);
  });

  for (const path of ['/about/', '/sources/', '/legal/']) {
    test(`no text under 11 px on ${path}`, async ({ page }) => {
      await serveWorld(page);
      await page.goto(path);
      expect(await tinyText(page)).toEqual([]);
    });
  }

  test('phones show a funnel for Filters, still named and tappable', async ({ page, isMobile }) => {
    await openWorld(page);
    const button = page.locator('#filter-toggle');
    await expect(button).toHaveAccessibleName(/^Filters/);
    const icon = button.locator('.filter-icon');
    if (!isMobile) {
      await expect(icon).toBeHidden();
      await expect(button.locator('.filter-word')).toHaveCSS('position', 'static');
      return;
    }
    await expect(icon).toBeVisible();
    const area = await button.boundingBox();
    expect(area?.width).toBeGreaterThanOrEqual(44);
    expect(area?.height).toBeGreaterThanOrEqual(44);
    expect((await button.locator('.filter-word').boundingBox())?.width).toBeLessThanOrEqual(1);
  });

  test('A+ enlarges the text and is remembered', async ({ page, isMobile }) => {
    await openWorld(page);
    const size = () =>
      page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const normal = await size();
    if (isMobile) await page.locator('#info-toggle').click();
    await page.locator('#text-large').click();
    await expect(page.locator('#text-large')).toHaveAttribute('aria-pressed', 'true');
    expect(await size()).toBeCloseTo(normal * 1.25, 1);
    expect(await page.evaluate(() => localStorage.getItem('wng-text-size'))).toBe('large');

    await page.reload();
    await expect(page.locator('#rotate-toggle')).toBeVisible({ timeout: 60_000 });
    expect(await size()).toBeCloseTo(normal * 1.25, 1);
    if (isMobile) await page.locator('#info-toggle').click();
    await page.locator('#text-normal').click();
    expect(await size()).toBeCloseTo(normal, 1);
    expect(await page.evaluate(() => localStorage.getItem('wng-text-size'))).toBeNull();
  });

  for (const screen of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'small phone', width: 320, height: 640 },
    { name: 'tablet', width: 820, height: 1180 },
  ]) {
    test(`on a ${screen.name} the top row and panels fit at A and A+`, async ({
      page,
      isMobile,
    }) => {
      await page.setViewportSize({ width: screen.width, height: screen.height });
      await openWorld(page);
      await expect(page.locator('#geo-toggle')).toBeVisible({ timeout: 30_000 });
      expect(await topRowFits(page)).toBe(true);
      await page.evaluate(() => document.documentElement.classList.add('text-large'));
      await page.waitForTimeout(200);
      // A narrow window with a mouse may use two rows; touch screens keep one.
      if (isMobile || screen.width <= 640) expect(await topRowFits(page)).toBe(true);
      await page.locator('#filter-toggle').click();
      await expect(page.locator('#filter-panel')).toBeVisible();
      expect(await panelInsideScreen(page, '#filter-panel')).toBe(true);
      await page.keyboard.press('Escape');
      await openEvent(page, 'war-ua');
      expect(await panelInsideScreen(page, '#event-card')).toBe(true);
    });
  }

  test('nothing runs off the screen at 200% text size', async ({ page }) => {
    await openWorld(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await page.locator('#filter-toggle').click({ force: true });
    await expect(page.locator('#filter-panel')).toBeVisible();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth),
    );
    expect(await panelInsideScreen(page, '#filter-panel')).toBe(true);
  });
});
