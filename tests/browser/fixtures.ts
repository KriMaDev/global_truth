/**
 * What the browser tests share: made-up events and feeds (never real headlines), a way to open
 * the globe on them under the site's real security policy, and small helpers.
 */
import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const policy =
  /Content-Security-Policy: (.+)/.exec(readFileSync('frontend/public/_headers', 'utf8'))?.[1] ?? '';

/** An ISO time this many minutes ago. */
export const ago = (minutes = 0): string => new Date(Date.now() - minutes * 60_000).toISOString();

function geoOf(continent: string, region: string, country: string, code: string) {
  return {
    continent,
    region,
    country,
    country_code: code,
    admin1: null,
    city: null,
    precision: 'country',
  };
}

export function syntheticEvent(
  id: string,
  lat: number,
  lng: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    title: `Test event ${id} near a made-up place`,
    snippet: '',
    lat,
    lng,
    severity: 'moderate',
    severity_reason: 'Test data',
    categories: ['politics'],
    category_basis: { politics: 'headline' },
    kind: 'news',
    feed: 'gdelt',
    hazard: null,
    published: ago(10),
    first_seen: ago(10),
    coverage: 1,
    place: 'Testland',
    geo: geoOf('Europe', 'Western Europe', 'Testland', 'TL'),
    location_method: 'machine-coded',
    sources: [{ name: 'Test Outlet', url: 'https://example.org/1', state_affiliated: false }],
    ...overrides,
  };
}

export type SyntheticEvent = ReturnType<typeof syntheticEvent>;

/** Many events around the world, for scrolling and for the map. */
export const scatteredEvents = (count = 30): SyntheticEvent[] =>
  Array.from({ length: count }, (_, i) => syntheticEvent(`e${i}`, -60 + i * 4, -170 + i * 11));

/** A small world whose every number the tests can predict. Seven events, all within 3 days. */
export function knownWorld(): SyntheticEvent[] {
  const outlet = (name: string, state = false) => [
    { name, url: `https://example.org/${name.length}`, state_affiliated: state },
  ];
  return [
    syntheticEvent('news-fr', 48.8, 2.3, {
      title: 'Made-up headline about a vote in a test city',
      severity_reason: 'Headline reports 3 deaths',
      place: 'France',
      geo: geoOf('Europe', 'Western Europe', 'France', 'FR'),
      published: ago(60),
    }),
    syntheticEvent('war-ua', 50.4, 30.5, {
      title: 'Made-up headline about a conflict for testing',
      severity: 'critical',
      categories: ['war'],
      category_basis: { war: 'headline' },
      place: 'Ukraine',
      geo: geoOf('Europe', 'Eastern Europe', 'Ukraine', 'UA'),
      sources: outlet('State Test Agency', true),
      published: ago(30),
    }),
    syntheticEvent('quake-jp', 35.7, 139.7, {
      title: 'M 6.0 test earthquake',
      severity: 'high',
      categories: ['natural-disasters'],
      category_basis: undefined,
      kind: 'data-feed',
      feed: 'usgs',
      hazard: 'EQ',
      place: 'Japan',
      geo: geoOf('Asia', 'Eastern Asia', 'Japan', 'JP'),
      location_method: 'source',
      sources: outlet('USGS'),
      published: ago(120),
    }),
    syntheticEvent('sport-br', -15.8, -47.9, {
      title: 'Made-up headline about a football test',
      severity: 'low',
      categories: ['sport'],
      category_basis: { sport: 'sport-section' },
      place: 'Brazil',
      geo: geoOf('Americas', 'South America', 'Brazil', 'BR'),
      published: ago(200),
    }),
    syntheticEvent('old-ar', -34.6, -58.4, {
      title: 'Made-up headline about prices, from two days ago',
      severity: 'low',
      categories: ['economic'],
      category_basis: { economic: 'headline' },
      place: 'Argentina',
      geo: geoOf('Americas', 'South America', 'Argentina', 'AR'),
      published: ago(40 * 60),
    }),
    syntheticEvent('group-1', 45.4, -75.7, {
      title: 'First made-up headline in a group',
      severity: 'low',
      place: 'Canada',
      geo: geoOf('Americas', 'Northern America', 'Canada', 'CA'),
      published: ago(90),
    }),
    syntheticEvent('group-2', 45.4, -75.7, {
      title: 'Second made-up headline in a group',
      severity: 'low',
      place: 'Canada',
      geo: geoOf('Americas', 'Northern America', 'Canada', 'CA'),
      published: ago(100),
    }),
  ];
}

export function feedRow(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name,
    kind: id === 'gdelt' ? 'news' : 'data-feed',
    homepage: 'https://example.org/',
    status: 'ok',
    last_attempt: ago(5),
    last_success: ago(5),
    count: 3,
    ...overrides,
  };
}

/** The three feeds, all healthy; pass changes by feed id. */
export function feedsDocument(
  changes: Record<string, Record<string, unknown>> = {},
  generated = ago(5),
) {
  return {
    generated,
    feeds: [
      feedRow('usgs', 'USGS Earthquake Hazards Program', changes.usgs),
      feedRow('gdacs', 'GDACS', changes.gdacs),
      feedRow('gdelt', 'GDELT Project', changes.gdelt),
    ],
  };
}

export interface WorldOptions {
  events?: SyntheticEvent[];
  /** How old the data says it is. */
  dataAgeMinutes?: number;
  feeds?: ReturnType<typeof feedsDocument> | 'missing';
  eventsFail?: boolean;
  daysFail?: boolean;
  outlets?: unknown;
}

/** Serves made-up data, adds the site's security policy, and keeps outside services out. */
export async function serveWorld(page: Page, options: WorldOptions = {}): Promise<void> {
  const events = options.events ?? scatteredEvents();
  const generated = ago(options.dataAgeMinutes ?? 5);
  const doc = { generated, window_hours: 72, counts: {}, events };
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('gibs.earthdata') || url.includes('cloudflareinsights')) return route.abort();
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    return route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': policy },
    });
  });
  await page.route('**/data/events.json', (route) =>
    options.eventsFail ? route.fulfill({ status: 500, body: '' }) : route.fulfill({ json: doc }),
  );
  const today = ago().slice(0, 10);
  const dayIndex = { days: [{ day: today, file: `${today}.json` }] };
  await page.route('**/data/days/**', (route) => {
    if (options.daysFail) return route.fulfill({ status: 404, body: '' });
    const isIndex = route.request().url().endsWith('/index.json');
    return route.fulfill({ json: isIndex ? dayIndex : doc });
  });
  await page.route('**/data/feeds.json', (route) =>
    options.feeds === 'missing'
      ? route.fulfill({ status: 404, body: '' })
      : route.fulfill({ json: options.feeds ?? feedsDocument({}, generated) }),
  );
  await page.route('**/data/outlets.json', (route) =>
    route.fulfill({ json: options.outlets ?? { outlets: [], providers: [] } }),
  );
}

export async function openGlobe(page: Page, path = '/', options: WorldOptions = {}): Promise<void> {
  await serveWorld(page, options);
  await page.goto(path);
  await expect(page.locator('#rotate-toggle')).toBeVisible({ timeout: 60_000 });
}

/** Errors and refused content the page reports while a test runs. */
export function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

export async function box(page: Page, selector: string) {
  const found = await page.locator(selector).boundingBox();
  if (!found) throw new Error(`${selector} is not visible`);
  return found;
}

/** The camera's latitude and longitude, from the readout. */
export async function view(page: Page): Promise<[number, number]> {
  const text = (await page.locator('#hud').textContent()) ?? '';
  const found = /([\d.]+)°([NS]) ([\d.]+)°([EW])/.exec(text);
  if (!found) throw new Error(`No position in "${text}"`);
  return [
    Number(found[1]) * (found[2] === 'N' ? 1 : -1),
    Number(found[3]) * (found[4] === 'E' ? 1 : -1),
  ];
}

/** Where the camera is, from the readout (kept up to date even when hidden on phones). */
export async function altitude(page: Page): Promise<number> {
  const text = await page.locator('#hud').textContent();
  return Number(/ALT ([\d.]+)/.exec(text ?? '')?.[1]);
}

/** Centre of a showing map label with only the map under it (labels let fingers through on
 * touch screens), away from the screen's edges. */
export function visibleLabel(page: Page) {
  return page.evaluate(() => {
    for (const label of document.querySelectorAll<HTMLElement>('.map-label')) {
      if (label.matches('.is-hidden, .is-crowded')) continue;
      const area = label.getBoundingClientRect();
      const x = area.x + area.width / 2;
      const y = area.y + area.height / 2;
      if (area.width && x > 40 && x < 370 && y > 200 && y < 520) {
        if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return { x, y };
      }
    }
    return null;
  });
}

/** Opens an event's card the way the keyboard list does. */
export async function openEvent(page: Page, id: string): Promise<void> {
  await page.evaluate((eventId) => {
    document.querySelector<HTMLButtonElement>(`#event-list [data-event-id="${eventId}"]`)?.click();
  }, id);
  await expect(page.locator('#event-card')).toBeVisible();
}

/** Turns the globe to Europe and comes in close: where it starts depends on the time of day. */
export async function showEurope(page: Page): Promise<void> {
  await openEvent(page, 'news-fr');
  await page.keyboard.press('Escape');
  await expect(page.locator('#event-card')).toBeHidden();
  await page.waitForTimeout(1800); // The flight to the event.
  await page.locator('#zoom-in').click();
  await page.waitForTimeout(800);
}
