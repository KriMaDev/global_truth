/**
 * The page shell: legend, event card and keyboard list appear at once; the
 * events (/data/events.json, written by the pipeline) and the 3D globe (three.js, the largest
 * part) load afterwards. Without WebGL, or if the globe fails, the events are shown as a plain
 * list instead; if the events cannot be loaded, the globe still shows and says so.
 */

// The same fonts as krimadev.com (SIL Open Font License): Michroma for the title,
// Hanken Grotesk for text, JetBrains Mono for labels. Bundled, so no outside requests.
import '@fontsource/michroma/400.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './style.css';
import { startAnalytics } from './analytics';
import { compareBySeverity, parseEvents } from './events';
import type { Cluster } from './clusters';
import {
  defaultFilters,
  fromQuery,
  isDefault,
  matchesExceptTime,
  toQuery,
  windowOf,
  withPageState,
  type FilterState,
} from './filters';
import { parseFeeds } from './feeds';
import { CATEGORIES, SEVERITIES } from './types';
import { createFilterPanel, type Counts } from './ui/filter-panel';
import { createNewsPanel } from './ui/news-panel';
import { createTimeline } from './ui/timeline';
import { createPlacePicker } from './ui/place-picker';
import { placeAltitude, placeCenter, placeNames } from './places';
import {
  countryCounts,
  countryLabel,
  countrySeverity,
  formatPopulation,
  type GeographyData,
  type MapLabel,
  type PlacesData,
} from './geography';
import { placeCardParts } from './ui/place-card';
import type { GlobeApp } from './globe/globe';
import { attachKeyboard } from './globe/keyboard';
import { SEVERITY_STYLES } from './severity';
import type { GlobeEvent } from './types';
import { createEventCard } from './ui/event-card';
import { renderEventList } from './ui/event-list';
import { parseOutletDirectory, setOutletDirectory } from './outlets';
import { renderLegend, renderSummary } from './ui/legend';
import { setupInfoPanel } from './ui/info-panel';
import { followDeviceMotion, initialReducedMotion } from './ui/motion';
import { setupFloatingPanelTitle } from './ui/panel-title';
import { applySavedTextSize, setupTextSize } from './ui/text-size';

applySavedTextSize();

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} in index.html`);
  return element as T;
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

interface Loaded {
  events: GlobeEvent[];
  /** When the pipeline wrote the data (ISO), or null for sample data. */
  generated: string | null;
  sample: boolean;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

/** The latest events; in development without pipeline data, the sample events instead. */
async function loadEvents(): Promise<Loaded> {
  try {
    const doc = (await fetchJson('/data/events.json')) as { generated?: unknown; events?: unknown };
    return {
      events: parseEvents(doc?.events).sort(compareBySeverity),
      generated: typeof doc?.generated === 'string' ? doc.generated : null,
      sample: false,
    };
  } catch (error) {
    if (import.meta.env.DEV) {
      const { default: sample } = await import('./data/sample-events.json');
      return { events: parseEvents(sample).sort(compareBySeverity), generated: null, sample: true };
    }
    throw error;
  }
}

/** Every event loaded, and those that pass the filters. */
let allEvents: GlobeEvent[] = [];
let events: GlobeEvent[] = [];
let filters: FilterState = fromQuery(window.location.search);
/** Read now: the address is rewritten as soon as the filters are applied. */
const startWithHeadlines = new URLSearchParams(window.location.search).get('list') === '1';
let dataTime: string | null = null;
let loadFailed = false;
const container = byId<HTMLDivElement>('globe');
const status = byId<HTMLParagraphElement>('status');
const announcer = byId<HTMLParagraphElement>('announce');
let announcedCount: number | null = null;

/** Tells screen readers how many events are left, only when a change alters the number. */
function announceCount(count: number): void {
  if (allEvents.length === 0 || loadingHistory) return;
  if (announcedCount !== null && count !== announcedCount) {
    announcer.textContent = `${count} ${count === 1 ? 'event' : 'events'} shown`;
  }
  announcedCount = count;
}
const list = byId<HTMLElement>('event-list');

const hud = byId<HTMLParagraphElement>('hud');
let view = { lat: 0, lng: 0, altitude: 0 };

function degrees(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(1)}°${value >= 0 ? positive : negative}`;
}

/** The readout: the UTC time the day/night line is drawn for, when the data was updated,
 * and where the camera looks. */
function updateHud(): void {
  const utc = new Date().toISOString().slice(11, 16);
  const data = dataTime ? ` · DATA ${new Date(dataTime).toISOString().slice(11, 16)}` : '';
  const lng = ((((view.lng + 180) % 360) + 360) % 360) - 180;
  hud.textContent = `UTC ${utc}${data} · ${degrees(view.lat, 'N', 'S')} ${degrees(lng, 'E', 'W')} · ALT ${view.altitude.toFixed(1)}`;
  if (dataTime) {
    byId('info-updated').textContent =
      `Data updated ${new Date(dataTime).toISOString().slice(11, 16)} UTC`;
  }
}

/** What the page is waiting for on the way to the globe. */
function showLoadStep(step: number, text: string): void {
  status.textContent = `Step ${step} of 3 · ${text}`;
}

/** A message that stays visible over the globe (loading problems, empty data), or none. */
let noticeTimer = 0;
function notice(message: string | null, hideAfterMs?: number): void {
  window.clearTimeout(noticeTimer);
  status.textContent = message ?? '';
  status.classList.add('notice');
  status.hidden = message === null;
  if (message !== null && hideAfterMs)
    noticeTimer = window.setTimeout(() => notice(null), hideAfterMs);
}

/**
 * The interface's accent: greyish white by default, the event's severity colour while one is
 * open, so the brackets and highlights point at what is selected.
 */
function setAccent(color: string | null): void {
  if (color) document.documentElement.style.setProperty('--accent', color);
  else document.documentElement.style.removeProperty('--accent');
}

// The footer's height, so on phones the event card sits just above the legend.
const footer = document.querySelector<HTMLElement>('.bottom');
if (footer) {
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--bottom-h', `${footer.offsetHeight}px`);
  }).observe(footer);
}

// Where the top row ends and the footer's right side begins, so panels on the right fit between
// them at any screen size (the row can be taller, or the footer have more lines).
const topRow = document.querySelector<HTMLElement>('.topbar-actions');
const footerRight = document.querySelector<HTMLElement>('.bottom-right');
if (topRow && footerRight) {
  const measureEdges = (): void => {
    const root = document.documentElement.style;
    root.setProperty('--top-h', `${Math.round(topRow.getBoundingClientRect().bottom)}px`);
    const foot = window.innerHeight - footerRight.getBoundingClientRect().top;
    root.setProperty('--foot-h', `${Math.round(foot)}px`);
  };
  const observer = new ResizeObserver(measureEdges);
  observer.observe(topRow);
  observer.observe(footerRight);
  window.addEventListener('resize', measureEdges);
}

let app: GlobeApp | null = null;
const card = createEventCard(byId('event-card'), () => {
  app?.select(null);
  app?.setCardOpen(false);
  setAccent(null);
});

/** The Rotate button: pressed while the globe turns by itself. */
const rotateToggle = byId<HTMLButtonElement>('rotate-toggle');
function showRotation(on: boolean): void {
  rotateToggle.setAttribute('aria-pressed', String(on));
  rotateToggle.title = on ? 'Stop the globe turning' : 'Let the globe turn by itself';
}

/** Steps of the on-screen zoom buttons: bigger than the keyboard's, to need fewer taps. */
const BUTTON_ZOOM_IN = 0.65;
const BUTTON_ZOOM_OUT = 1.5;

/** On-screen zoom, for anyone who can't pinch, and a one-tap way back to the whole globe. */
function showZoomButtons(globeApp: GlobeApp): void {
  byId('zoom-in').addEventListener('click', () => globeApp.zoomBy(BUTTON_ZOOM_IN));
  byId('zoom-out').addEventListener('click', () => globeApp.zoomBy(BUTTON_ZOOM_OUT));
  byId('zoom-whole').addEventListener('click', () => globeApp.showWholeGlobe());
  byId('zoom-controls').hidden = false;
}

/** How to use the globe, on touch screens, until the first touch. Nothing is stored. */
function showGestureHint(): void {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  const hint = byId('gesture-hint');
  hint.hidden = false;
  document.addEventListener('pointerdown', () => (hint.hidden = true), { once: true });
}

/** iPhones can ignore `touch-action` for pinches (style.css); this stops them zooming the
 * page. The globe's own pinch uses pointer events and is not affected. */
function stopPageZoomOnIPhones(): void {
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }
}

function clearFilters(): void {
  filters = defaultFilters();
  applyFilters();
}

/** On wide screens Filters and Headlines sit side by side; otherwise one replaces the other. */
const roomForBothPanels = window.matchMedia('(min-width: 1240px)');

const panel = createFilterPanel(
  byId('filter-panel'),
  byId<HTMLButtonElement>('filter-toggle'),
  (change) => {
    filters = { ...filters, ...change };
    applyFilters();
  },
  clearFilters,
  () => {
    card.close();
    if (!roomForBothPanels.matches) headlines.close();
  },
);

const headlines = createNewsPanel(byId('news-panel'), byId<HTMLButtonElement>('news-toggle'), {
  onPick: (event) => {
    // A back button normally means the globe is already there; from the list it is not.
    app?.flyTo(event);
    openEvent(
      event,
      true,
      () => {
        card.close();
        headlines.open(true, event.id);
      },
      '← Back to the headlines',
    );
  },
  onClear: clearFilters,
  onOpen: () => {
    card.close();
    if (!roomForBothPanels.matches) panel.close();
  },
  onToggle: updateAddress,
});

/** A card takes the place of the panels. */
function closePanels(): void {
  panel.close();
  headlines.close();
}

/** How many kinds of filter are on (categories, severities, time, place). */
function activeFilters(state: FilterState): number {
  const fresh = defaultFilters();
  return [
    state.categories.size !== fresh.categories.size,
    state.severities.size !== fresh.severities.size,
    state.range !== fresh.range || state.end !== null,
    state.place.length > 0,
  ].filter(Boolean).length;
}

/** Event counts for the chips: each chip counts the events it would show, given the other
 * filters. */
function chipCounts(inWindow: GlobeEvent[]): Counts {
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Counts['categories'];
  const severities = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Counts['severities'];
  for (const event of inWindow) {
    if (matchesExceptTime(event, { ...filters, categories: new Set(CATEGORIES) })) {
      for (const category of event.categories) categories[category] += 1;
    }
    if (matchesExceptTime(event, { ...filters, severities: new Set(SEVERITIES) })) {
      severities[event.severity] += 1;
    }
  }
  return { categories, severities };
}

const listHandlers = {
  onFocus: (event: GlobeEvent) => {
    app?.select(event.id);
    app?.flyTo(event);
  },
  onOpen: (event: GlobeEvent) => openEvent(event, true),
};

/** Choosing a place filters to it and flies the globe there. */
const placePicker = createPlacePicker(
  byId('filter-panel').querySelector<HTMLElement>('[data-filter=place]')!,
  (path) => {
    filters = { ...filters, place: path };
    applyFilters();
    const { from, to } = windowOf(filters, Date.now());
    const inWindow = allEvents.filter((e) => {
      const time = Date.parse(e.published);
      return time >= from && time <= to;
    });
    const center = placeCenter(inWindow, path);
    if (center) app?.flyOver(center.lat, center.lng, placeAltitude(path.length));
  },
);

const timeline = createTimeline(
  byId('filter-panel').querySelector<HTMLElement>('[data-filter=time]')!,
  (change) => {
    filters = { ...filters, ...change };
    applyFilters();
  },
);

/** The 72 hours in events.json are loaded first; older days come from /data/days/ when
 * the time window reaches them, each file once. */
const RECENT_HOURS = 72;
const loadedDays = new Set<string>();
let dayIndex: { day: string; file: string }[] | null = null;
let loadingHistory = false;

async function loadHistory(from: number): Promise<boolean> {
  if (dayIndex === null) {
    const doc = (await fetchJson('/data/days/index.json')) as { days?: unknown };
    dayIndex = Array.isArray(doc?.days)
      ? doc.days.filter(
          (d): d is { day: string; file: string } =>
            typeof d?.day === 'string' &&
            typeof d?.file === 'string' &&
            /^[\d-]+\.json$/.test(d.file),
        )
      : [];
  }
  const firstDay = new Date(from).toISOString().slice(0, 10);
  const needed = dayIndex.filter((d) => d.day >= firstDay && !loadedDays.has(d.day));
  const files = await Promise.all(needed.map((d) => fetchJson(`/data/days/${d.file}`)));
  const known = new Set(allEvents.map((e) => e.id));
  for (const [i, doc] of files.entries()) {
    loadedDays.add(needed[i].day);
    for (const event of parseEvents((doc as { events?: unknown })?.events)) {
      if (!known.has(event.id)) {
        known.add(event.id);
        allEvents.push(event);
      }
    }
  }
  return needed.length > 0;
}

/** Loads older days if the window needs them, then applies the filters again. */
function ensureHistory(from: number): void {
  // events.json covers the 72 hours before it was generated; only earlier windows need days.
  const recentFrom = (dataTime ? Date.parse(dataTime) : Date.now()) - RECENT_HOURS * 3_600_000;
  if (loadingHistory || from >= recentFrom) return;
  const firstDay = new Date(from).toISOString().slice(0, 10);
  if (dayIndex !== null && dayIndex.every((d) => d.day < firstDay || loadedDays.has(d.day))) return;
  loadingHistory = true;
  notice('Loading older events…');
  loadHistory(from)
    .then((added) => {
      loadingHistory = false;
      notice(null);
      if (added) applyFilters();
    })
    .catch((error: unknown) => {
      loadingHistory = false;
      console.warn('Older events unavailable:', error);
      notice("Older events couldn't be loaded. Please try again later.");
    });
}

/** Applies the filters to every part of the page and to the web address. */
function applyFilters(): void {
  const now = Date.now();
  const { from, to } = windowOf(filters, now);
  ensureHistory(from);
  const inWindow = allEvents.filter((e) => {
    const time = Date.parse(e.published);
    return time >= from && time <= to;
  });
  events = inWindow.filter((e) => matchesExceptTime(e, filters)).sort(compareBySeverity);
  panel.render(filters, chipCounts(inWindow), activeFilters(filters));
  timeline.update(filters, now);
  placePicker.update(
    filters.place,
    inWindow.filter((e) => matchesExceptTime(e, { ...filters, place: [] })),
  );
  renderSummary(events.length, allEvents.length, !isDefault(filters), clearFilters);
  announceCount(events.length);
  headlines.render({
    events,
    place: placeNames(allEvents, filters.place),
    dataTime,
    canClear: !isDefault(filters),
    failed: loadFailed,
  });
  updateAddress();
  if (app) {
    app.setEvents(events);
    if (geoView && geoData) app.setGeography(geoData, countrySeverity(events));
    renderEventList(list, events, listHandlers);
    if (allEvents.length > 0 && !loadingHistory) {
      // A short hint when filters leave nothing, unless a whole group was switched off on
      // purpose ("All off"); the legend keeps saying "Showing 0 of …" with a Clear link.
      const deliberate = filters.categories.size === 0 || filters.severities.size === 0;
      if (events.length === 0 && !deliberate) notice('No events match these filters.', 5000);
      else if (status.textContent === 'No events match these filters.') notice(null);
    }
  }
}

/**
 * The geography view: countries coloured by their events' severity, map labels, events as
 * small dots, and "About this place" for everything labelled. Its data (Natural Earth; facts
 * and text from Wikidata and Wikipedia) loads the first time it is opened.
 */
let geoView = new URLSearchParams(window.location.search).get('view') === 'geo';
let geoData: GeographyData | null = null;
/** Facts and text for places; the view works without them. */
let placesData: PlacesData | null = null;
const geoToggle = byId<HTMLButtonElement>('geo-toggle');

/** Keeps the web address in step with the filters, the view and the Headlines panel. */
function updateAddress(): void {
  const query = withPageState(toQuery(filters), { geo: geoView, list: headlines.isOpen });
  window.history.replaceState(null, '', window.location.pathname + query);
}

async function loadGeography(): Promise<GeographyData> {
  const [countries, labels, lakes] = await Promise.all([
    fetchJson('/geo/countries.json'),
    fetchJson('/geo/labels.json'),
    // Lakes are extra: the map works without them.
    fetchJson('/geo/lakes.json').catch((error: unknown) => {
      console.warn('Lakes unavailable:', error);
      return [];
    }),
  ]);
  const parts = labels as Partial<GeographyData['labels']> | null;
  if (!Array.isArray(countries) || !parts) throw new Error('geography files are malformed');
  return {
    countries: countries as GeographyData['countries'],
    labels: {
      seas: parts.seas ?? [],
      regions: parts.regions ?? [],
      peaks: parts.peaks ?? [],
      waters: parts.waters ?? [],
    },
    lakes: Array.isArray(lakes) ? (lakes as GeographyData['lakes']) : [],
  };
}

/** The texts for "About this place", fetched once; the map works without them. */
let placesLoading: Promise<void> | null = null;
function loadPlaces(): Promise<void> {
  placesLoading ??= fetchJson('/geo/places.json')
    .then((doc) => {
      const places = doc as Partial<PlacesData> | null;
      placesData = places?.places
        ? { generated: String(places.generated ?? ''), places: places.places }
        : null;
    })
    .catch((error: unknown) => console.warn('Place descriptions unavailable:', error));
  return placesLoading;
}

async function setGeoView(on: boolean): Promise<void> {
  geoView = on;
  geoToggle.setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('geo-view', on);
  if (on && !geoData) {
    try {
      notice('Loading the map…');
      geoData = await loadGeography();
      notice(null);
    } catch (error) {
      console.warn('Geography unavailable:', error);
      notice("The geography view couldn't be loaded. Please try again later.");
      geoView = false;
      geoToggle.setAttribute('aria-pressed', 'false');
      document.body.classList.remove('geo-view');
      return;
    }
  }
  app?.setGeography(geoView ? geoData : null, countrySeverity(events));
  applyFilters();
  // The map first, the texts for the cards after it.
  if (geoView) void loadPlaces();
}

/** "12 events: 3 high, 9 low", for the current filters and time window. */
function countryEventSummary(iso2: string): string | null {
  const counts = countryCounts(events, iso2);
  const total = SEVERITIES.reduce((sum, s) => sum + counts[s], 0);
  if (total === 0) return null;
  const parts = [...SEVERITIES]
    .reverse()
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${SEVERITY_STYLES[s].label.toLowerCase()}`);
  return `${total} event${total === 1 ? '' : 's'}: ${parts.join(', ')}`;
}

/** The lines under a country's name when hovering it in the geography view. */
function describeCountry(iso2: string): string[] {
  const country = geoData?.countries.find((c) => c.iso2 === iso2);
  const facts = country?.wikidata ? placesData?.places[country.wikidata] : undefined;
  const lines: string[] = [];
  const where = [country?.region, country?.continent].filter(Boolean).join(' · ');
  if (where) lines.push(where);
  const basics = [
    facts?.capital ? `Capital ${facts.capital}` : null,
    facts?.population ? `${formatPopulation(facts.population)} people` : null,
  ].filter(Boolean);
  if (basics.length) lines.push(basics.join(' · '));
  lines.push(countryEventSummary(iso2) ?? 'No events in the current filters');
  lines.push(`Click for more about ${country?.name ?? 'this country'}`);
  return lines;
}

/** Opens "About this place" for a label (or a country) and turns the globe to it. */
function openPlace(
  label: MapLabel,
  extra: { where?: string | null; events?: { summary: string; onShow?: () => void } | null } = {},
): void {
  closePanels();
  app?.select(null);
  // On a slow connection the card waits for its text rather than opening without it.
  void loadPlaces().then(() => {
    const facts = label.wikidata ? placesData?.places[label.wikidata] : undefined;
    card.openPanel(
      label.id,
      placeCardParts({ label, facts, asOf: placesData?.generated ?? null, ...extra }),
      false,
    );
    app?.setCardOpen(true);
  });
  // Closer for small places, never further out than now.
  const reach: Record<MapLabel['kind'], number> = {
    ocean: 2.4,
    country: 1.6,
    sea: 1.6,
    range: 1.4,
    desert: 1.6,
    peak: 1,
    river: 1.4,
    lake: 1,
  };
  app?.flyOver(label.lat, label.lng, Math.min(view.altitude, reach[label.kind]));
}

/** A country (shape or name) was clicked: its card, with its events and a filter button. */
function chooseCountry(iso2: string): void {
  const country = geoData?.countries.find((c) => c.iso2 === iso2);
  if (!country) return;
  const { from, to } = windowOf(filters, Date.now());
  const match = allEvents.find((e) => {
    const time = Date.parse(e.published);
    return (
      e.geo?.country_code === iso2 && e.geo.continent && e.geo.region && time >= from && time <= to
    );
  });
  const summary = countryEventSummary(iso2);
  const severity = countrySeverity(events).get(iso2);
  setAccent(severity ? SEVERITY_STYLES[severity].color : null);
  openPlace(countryLabel(country), {
    where: [country.region, country.continent].filter(Boolean).join(' · '),
    events: {
      summary: summary ?? 'No events in the current filters and time window.',
      onShow:
        summary && match?.geo?.continent && match.geo.region
          ? () => {
              filters = { ...filters, place: [match.geo!.continent!, match.geo!.region!, iso2] };
              applyFilters();
            }
          : undefined,
    },
  });
}

function openEvent(event: GlobeEvent, focus: boolean, back?: () => void, backLabel?: string): void {
  closePanels();
  app?.select(event.id);
  if (!back) app?.flyTo(event);
  setAccent(SEVERITY_STYLES[event.severity].color);
  app?.setCardOpen(true);
  card.open(event, focus, back, backLabel);
}

/** A pillar was chosen: one event opens its card, a group opens its list. */
function openCluster(cluster: Cluster, focus: boolean): void {
  if (cluster.events.length === 1) {
    openEvent(cluster.lead, focus);
    return;
  }
  closePanels();
  app?.select(cluster.id);
  app?.flyTo(cluster);
  setAccent(SEVERITY_STYLES[cluster.severity].color);
  app?.setCardOpen(true);
  card.openList(cluster, focus, (event) =>
    openEvent(event, true, () => {
      app?.select(cluster.id);
      setAccent(SEVERITY_STYLES[cluster.severity].color);
      card.openList(cluster, true, (again) =>
        openEvent(again, true, () => openCluster(cluster, true)),
      );
    }),
  );
}

function showList(message: string): void {
  document.body.classList.add('no-globe');
  status.textContent = message;
  status.hidden = false;
  renderEventList(list, events, { onOpen: (event) => card.open(event, true) });
}

/** The footer's version: build date and commit, linked to that commit on GitHub. */
function showVersion(): void {
  const link = byId<HTMLAnchorElement>('version');
  link.textContent = `Version ${__BUILD_DATE__} · ${__BUILD_COMMIT__}`;
  const sha = __BUILD_COMMIT__.replace('+', '');
  if (/^[0-9a-f]{7}$/.test(sha))
    link.href = `https://github.com/KriMaDev/world_news_globe/commit/${sha}`;
}

async function start(): Promise<void> {
  showVersion();
  startAnalytics();
  renderLegend(byId('legend'));
  if (footer) setupInfoPanel(footer, byId<HTMLButtonElement>('info-toggle'));
  setupTextSize(byId('text-normal'), byId('text-large'));
  setupFloatingPanelTitle(byId('news-toggle'), [byId('news-panel'), byId('filter-panel')]);
  stopPageZoomOnIPhones();
  followDeviceMotion((on) => {
    app?.setReducedMotion(on);
    // The device asking for less motion also stops the rotation; turning it off leaves it to
    // the Rotate button.
    if (on) app?.setRotating(false);
  });

  // Who reported what (country, ownership, credit lines on cards): extra, loaded alongside.
  void fetchJson('/data/outlets.json')
    .then((doc) => setOutletDirectory(parseOutletDirectory(doc)))
    .catch((error: unknown) => console.warn('Outlet details unavailable:', error));

  // Each feed's last update and any failure (Headlines panel): extra as well.
  void fetchJson('/data/feeds.json')
    .then((doc) => headlines.setFeeds(parseFeeds(doc)))
    .catch((error: unknown) => console.warn('Feed status unavailable:', error));

  // The 3D code starts downloading now, alongside the events, not after them.
  const canDraw = hasWebGL();
  const globeCode = canDraw ? import('./globe/globe') : null;
  globeCode?.catch(() => undefined); // Reported where it is awaited, below.
  showLoadStep(1, 'Getting the latest news…');

  try {
    const loaded = await loadEvents();
    allEvents = loaded.events;
    dataTime = loaded.generated;
    if (loaded.sample) byId('preview-note').hidden = false;
  } catch (error) {
    console.error(error);
    loadFailed = true;
  }
  applyFilters();
  if (startWithHeadlines) headlines.open(false);

  if (!globeCode || !canDraw) {
    showList('This browser cannot show the 3D globe, so the events are listed instead.');
    return;
  }
  try {
    showLoadStep(2, 'Loading the globe…');
    const { createGlobeApp } = await globeCode;
    showLoadStep(3, 'Loading the map images…');
    app = await createGlobeApp(container, {
      events,
      reducedMotion: initialReducedMotion(),
      onSelect: (cluster) => openCluster(cluster, false),
      onView: (pov) => {
        view = pov;
        updateHud();
      },
      onCountry: chooseCountry,
      onPlace: (label) => {
        setAccent(null);
        openPlace(label);
      },
      describeCountry,
      onRotationChange: showRotation,
    });
    showRotation(!initialReducedMotion());
    rotateToggle.hidden = false;
    rotateToggle.addEventListener('click', () =>
      app?.setRotating(rotateToggle.getAttribute('aria-pressed') !== 'true'),
    );
    showZoomButtons(app);
    showGestureHint();
    geoToggle.hidden = false;
    geoToggle.addEventListener('click', () => void setGeoView(!geoView));
    if (geoView) void setGeoView(true);
    window.setInterval(updateHud, 30_000);
    attachKeyboard(container, app);
    status.hidden = true;
    container.classList.add('ready');
    applyFilters();
    if (loadFailed) notice("Couldn't load the latest events. Please try again in a few minutes.");
    else if (allEvents.length === 0) notice('No events in the last 7 days.');
  } catch (error) {
    console.error(error);
    showList('The 3D globe could not start, so the events are listed instead.');
  }
}

void start();
