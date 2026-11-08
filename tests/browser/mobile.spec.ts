/**
 * The globe page on phones, with made-up events only. Page zoom is tested with a real pinch
 * gesture through the browser's own tools (Chromium and Edge).
 */
import { expect, test } from '@playwright/test';
import { altitude, box, knownWorld, openGlobe, showEurope, view, visibleLabel } from './fixtures';

test.skip(({ isMobile }) => !isMobile, 'Phone layout only');

for (const [width, height] of [
  [320, 568],
  [360, 640],
  [412, 740],
] as const) {
  test.describe(`${width}×${height}`, () => {
    test.use({ viewport: { width, height } });

    test('every control fits on one row, and is big enough to tap', async ({ page }) => {
      await openGlobe(page);
      await expect(page.locator('.geo-rest')).toBeHidden();
      const controls = ['#geo-toggle', '#news-toggle', '#filter-toggle', '#rotate-toggle'];
      const boxes = await Promise.all(controls.map((selector) => box(page, selector)));
      for (const control of boxes) {
        expect(control.height).toBeGreaterThanOrEqual(44);
        expect(control.y).toBe(boxes[0].y);
        expect(control.x + control.width).toBeLessThanOrEqual(width - 16);
      }
      for (let i = 1; i < boxes.length; i += 1) {
        expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width);
      }
      await expect(page.locator('#motion-toggle')).toHaveCount(0);
    });

    test('the footer stays small: the legend row and the Info row', async ({ page }) => {
      await openGlobe(page);
      const footer = await box(page, '.bottom');
      expect(footer.height).toBeLessThanOrEqual(125);
      for (const selector of ['#info-toggle', '.legend-head']) {
        expect((await box(page, selector)).height).toBeGreaterThanOrEqual(44);
      }
      expect((await box(page, '.legend-head')).height).toBeLessThanOrEqual(60);
      const row = await box(page, '.legend-head');
      expect(row.x + row.width).toBeLessThanOrEqual(width);
      const lastName = await box(page, '.legend-head li:last-child .legend-name');
      expect(lastName.x + lastName.width).toBeLessThanOrEqual(row.x + row.width);
      await expect(page.locator('.credits-data')).toContainText('GDELT');
    });
  });
}

test('the legend opens, closes and is remembered', async ({ page }) => {
  await openGlobe(page);
  const toggle = page.locator('.legend-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.legend-more')).toBeHidden();
  await expect(page.locator('.legend-head')).toContainText('Critical');

  await toggle.click();
  await expect(page.locator('.legend-more')).toBeVisible();
  await expect(page.locator('.legend-more')).toContainText('Natural disaster');

  await page.reload();
  await expect(page.locator('.legend-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.legend-toggle').click();
  expect(await page.evaluate(() => localStorage.getItem('wng-legend-open'))).toBeNull();
});

test('Info opens the links and closes again', async ({ page }) => {
  await openGlobe(page);
  const about = page.locator('.info-panel a', { hasText: 'About' });
  await expect(about).toBeHidden();
  await page.locator('#info-toggle').click();
  await expect(about).toBeVisible();
  await expect(page.locator('#info-updated')).toContainText('Data updated');
  await page.keyboard.press('Escape');
  await expect(about).toBeHidden();
});

test('zoom buttons work, stop at the limit, and Whole globe comes back', async ({ page }) => {
  await openGlobe(page);
  await expect.poll(() => altitude(page)).toBeGreaterThan(3);
  await page.locator('#zoom-in').click();
  await expect.poll(() => altitude(page)).toBeLessThan(3);

  await page.locator('#zoom-whole').click();
  await expect.poll(() => altitude(page), { timeout: 5000 }).toBeGreaterThan(3.5);

  for (let i = 0; i < 4; i += 1) {
    await page.locator('#zoom-out').click();
    await page.waitForTimeout(500);
  }
  await expect.poll(() => altitude(page), { timeout: 5000 }).toBe(7);
});

test('a pinch on the controls does not zoom the page', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The pinch tool exists in Chromium and Edge only');
  await openGlobe(page);
  const client = await page.context().newCDPSession(page);
  const header = await box(page, '.topbar');
  await client.send('Input.synthesizePinchGesture', {
    x: header.x + header.width / 2,
    y: header.y + header.height / 2,
    scaleFactor: 2,
    gestureSourceType: 'touch',
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
});

test('a drag that starts on a map label turns the globe, and a tap opens the label', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The touch tool exists in Chromium and Edge only');
  test.setTimeout(120_000); // Software graphics here run at a few frames a second.
  await openGlobe(page, '/?view=geo', { events: knownWorld() });
  await page.locator('#rotate-toggle').click();
  await expect(page.locator('#rotate-toggle')).toHaveAttribute('aria-pressed', 'false');
  await showEurope(page);
  await expect.poll(() => visibleLabel(page), { timeout: 15_000 }).not.toBeNull();
  await page.waitForTimeout(1000);

  const start = await visibleLabel(page);
  if (!start) throw new Error('No label to press');
  const before = await view(page);
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  for (let i = 1; i <= 12; i += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: start.x + i * 8, y: start.y + i * 3 }],
    });
    await page.waitForTimeout(25);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect
    .poll(async () => {
      const after = await view(page);
      return Math.abs(after[0] - before[0]) + Math.abs(after[1] - before[1]);
    })
    .toBeGreaterThan(3);
  await expect(page.locator('#event-card')).toBeHidden();

  await page.waitForTimeout(1800); // The globe glides to a stop after a drag.
  const label = await visibleLabel(page);
  if (!label) throw new Error('No label to tap');
  await page.touchscreen.tap(label.x, label.y);
  await expect(page.locator('#event-card')).toBeVisible();
});

test('geography: slow gestures open nothing, and a pinch stays centred', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The touch tool exists in Chromium and Edge only');
  test.setTimeout(120_000); // Software graphics here run at a few frames a second.
  await openGlobe(page, '/?view=geo');
  await page.locator('#rotate-toggle').click();
  for (let i = 0; i < 2; i += 1) {
    await page.locator('#zoom-in').click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  expect(await page.locator('.map-label').count()).toBeLessThanOrEqual(150);

  const card = page.locator('#event-card');
  const client = await page.context().newCDPSession(page);
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    touchPoints: { x: number; y: number; id?: number }[],
  ) => client.send('Input.dispatchTouchEvent', { type, touchPoints });

  const spot = { x: 206, y: 380 };

  // One finger, in steps too small for the library to call it a drag.
  await touch('touchStart', [spot]);
  for (let i = 1; i <= 40; i += 1) {
    await touch('touchMove', [{ x: spot.x + i * 0.5, y: spot.y }]);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', []);
  await page.waitForTimeout(800);
  await expect(card).toBeHidden();

  // Two fingers, slowly, around the middle of the screen.
  const before = await view(page);
  const middle = { x: 206, y: 370 };
  const fingers = (spread: number) => [
    { x: middle.x - spread * 0.7, y: middle.y - spread, id: 1 },
    { x: middle.x + spread * 0.7, y: middle.y + spread, id: 2 },
  ];
  await touch('touchStart', fingers(70));
  for (let i = 1; i <= 60; i += 1) {
    await touch('touchMove', fingers(70 + i * 0.5));
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', []);
  await page.waitForTimeout(800);
  await expect(card).toBeHidden();
  const after = await view(page);
  expect(Math.abs(after[0] - before[0])).toBeLessThan(1);
  expect(Math.abs(after[1] - before[1])).toBeLessThan(1);
});

test('after a pinch with a finger on a label, one finger still turns the globe', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The touch tool exists in Chromium and Edge only');
  test.setTimeout(120_000); // Software graphics here run at a few frames a second.
  await openGlobe(page, '/?view=geo', { events: knownWorld() });
  await page.locator('#rotate-toggle').click();
  await showEurope(page);
  await expect.poll(() => visibleLabel(page), { timeout: 15_000 }).not.toBeNull();
  await page.waitForTimeout(1000);
  const label = await visibleLabel(page);
  if (!label) throw new Error('No label to press');

  const client = await page.context().newCDPSession(page);
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    touchPoints: { x: number; y: number; id?: number }[],
  ) => client.send('Input.dispatchTouchEvent', { type, touchPoints });

  const first = { x: 320, y: 240, id: 1 };
  await touch('touchStart', [first]);
  await page.waitForTimeout(40);
  await touch('touchStart', [first, { ...label, id: 2 }]);
  for (let i = 1; i <= 20; i += 1) {
    await touch('touchMove', [
      { ...first, y: first.y - i * 2 },
      { x: label.x, y: label.y + i * 2, id: 2 },
    ]);
    await page.waitForTimeout(25);
  }
  await touch('touchEnd', []);
  await page.waitForTimeout(1800);

  const altitudeBefore = await altitude(page);
  const before = await view(page);
  const start = { x: 80, y: 300, id: 5 };
  await touch('touchStart', [start]);
  for (let i = 1; i <= 20; i += 1) {
    await touch('touchMove', [{ x: start.x + i * 8, y: start.y + i * 3, id: 5 }]);
    await page.waitForTimeout(25);
  }
  await touch('touchEnd', []);
  await page.waitForTimeout(1800);

  const after = await view(page);
  expect(Math.abs(after[0] - before[0]) + Math.abs(after[1] - before[1])).toBeGreaterThan(3);
  expect(await altitude(page)).toBeCloseTo(altitudeBefore, 1);
});

test.describe('a panel that scrolls', () => {
  test.use({ viewport: { width: 412, height: 640 } });

  for (const [toggle, panel, name] of [
    ['#news-toggle', '#news-panel', 'Headlines'],
    ['#filter-toggle', '#filter-panel', 'Filters'],
  ] as const) {
    test(`${name}: the name moves to the gap above the panel`, async ({ page }) => {
      await openGlobe(page);
      const title = page.locator('#panel-float-title');
      await page.locator(toggle).click();
      await page.waitForTimeout(500);
      await expect(title).toBeHidden();

      await page.locator(panel).evaluate((element) => element.scrollTo(0, 400));
      await expect(title).toBeVisible();
      await expect(title).toHaveText(name);

      const area = await box(page, panel);
      const place = await box(page, '#panel-float-title');
      const heading = await box(page, `${panel} .filter-head`);
      const row = await box(page, toggle);
      expect(heading.y + heading.height).toBeLessThanOrEqual(area.y + 1);
      expect(place.y + place.height).toBeLessThanOrEqual(area.y);
      expect(place.y).toBeGreaterThanOrEqual(row.y + row.height);

      await page.locator(toggle).click();
      await expect(title).toBeHidden();
    });
  }
});

test('the hint leaves at the first touch', async ({ page }) => {
  await openGlobe(page);
  await expect(page.locator('#gesture-hint')).toBeVisible();
  await page.touchscreen.tap(200, 300);
  await expect(page.locator('#gesture-hint')).toBeHidden();
});

test.describe('with the device set to reduce motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the globe starts still, and Rotate still works', async ({ page }) => {
    await openGlobe(page);
    const rotate = page.locator('#rotate-toggle');
    await expect(rotate).toHaveAttribute('aria-pressed', 'false');
    await rotate.click();
    await expect(rotate).toHaveAttribute('aria-pressed', 'true');
  });
});

test('rotation is on by default, and an old saved choice is forgotten', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wng-reduce-motion', '1'));
  await openGlobe(page);
  await expect(page.locator('#rotate-toggle')).toHaveAttribute('aria-pressed', 'true');
});

test('an open event card sits above the footer, and the zoom buttons make way', async ({
  page,
}) => {
  await openGlobe(page);
  await page.evaluate(() => {
    (document.querySelector('#event-list button') as HTMLButtonElement).click();
  });
  await expect(page.locator('#event-card')).toBeVisible();
  await page.waitForTimeout(500); // The card slides in by a few pixels.
  const card = await box(page, '#event-card');
  const legend = await box(page, '#legend');
  expect(card.y + card.height).toBeLessThanOrEqual(legend.y + 1);
  await expect(page.locator('#zoom-controls')).toBeHidden();
});
