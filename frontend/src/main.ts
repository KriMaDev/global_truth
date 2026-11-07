/**
 * The page shell: legend, motion switch, event card and keyboard list appear at once; the
 * events (/data/events.json, written by the pipeline) and the 3D globe (three.js, the largest
 * part) load afterwards. Without WebGL, or if the globe fails, the events are shown as a plain
 * list instead; if the events cannot be loaded, the globe still shows and says so.
 */

// The same fonts as krimadev.com (SIL Open Font License): Michroma for the title,
// Hanken Grotesk for text, JetBrains Mono for labels. Bundled, so no outside requests.
import "@fontsource/michroma/400.css";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./style.css";
import { compareBySeverity, parseEvents } from "./events";
import type { Cluster } from "./clusters";
import {
  defaultFilters,
  fromQuery,
  isDefault,
  matchesExceptTime,
  toQuery,
  windowOf,
  type FilterState,
} from "./filters";
import { CATEGORIES, SEVERITIES } from "./types";
import { createFilterPanel, type Counts } from "./ui/filter-panel";
import type { GlobeApp } from "./globe/globe";
import { attachKeyboard } from "./globe/keyboard";
import { SEVERITY_STYLES } from "./severity";
import type { GlobeEvent } from "./types";
import { createEventCard } from "./ui/event-card";
import { renderEventList } from "./ui/event-list";
import { renderLegend, renderSummary } from "./ui/legend";
import { initialReducedMotion, setupMotionToggle } from "./ui/motion";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} in index.html`);
  return element as T;
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
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
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

/** The latest events; in development without pipeline data, the sample events instead. */
async function loadEvents(): Promise<Loaded> {
  try {
    const doc = (await fetchJson("/data/events.json")) as { generated?: unknown; events?: unknown };
    return {
      events: parseEvents(doc?.events).sort(compareBySeverity),
      generated: typeof doc?.generated === "string" ? doc.generated : null,
      sample: false,
    };
  } catch (error) {
    if (import.meta.env.DEV) {
      const { default: sample } = await import("./data/sample-events.json");
      return { events: parseEvents(sample).sort(compareBySeverity), generated: null, sample: true };
    }
    throw error;
  }
}

/** Every event loaded, and those that pass the filters. */
let allEvents: GlobeEvent[] = [];
let events: GlobeEvent[] = [];
let filters: FilterState = fromQuery(window.location.search);
let dataTime: string | null = null;
const container = byId<HTMLDivElement>("globe");
const status = byId<HTMLParagraphElement>("status");
const list = byId<HTMLElement>("event-list");

const hud = byId<HTMLParagraphElement>("hud");
let view = { lat: 0, lng: 0, altitude: 0 };

function degrees(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(1)}°${value >= 0 ? positive : negative}`;
}

/** The readout: the UTC time the day/night line is drawn for, when the data was updated,
 * and where the camera looks. */
function updateHud(): void {
  const utc = new Date().toISOString().slice(11, 16);
  const data = dataTime ? ` · DATA ${new Date(dataTime).toISOString().slice(11, 16)}` : "";
  const lng = ((((view.lng + 180) % 360) + 360) % 360) - 180;
  hud.textContent = `UTC ${utc}${data} · ${degrees(view.lat, "N", "S")} ${degrees(lng, "E", "W")} · ALT ${view.altitude.toFixed(1)}`;
}

/** A message that stays visible over the globe (loading problems, empty data), or none. */
function notice(message: string | null): void {
  status.textContent = message ?? "";
  status.classList.add("notice");
  status.hidden = message === null;
}

/**
 * The interface's accent: greyish white by default, the event's severity colour while one is
 * open, so the brackets and highlights point at what is selected.
 */
function setAccent(color: string | null): void {
  if (color) document.documentElement.style.setProperty("--accent", color);
  else document.documentElement.style.removeProperty("--accent");
}

// The footer's height, so on phones the event card sits just above the legend.
const footer = document.querySelector<HTMLElement>(".bottom");
if (footer) {
  new ResizeObserver(() => {
    document.documentElement.style.setProperty("--bottom-h", `${footer.offsetHeight}px`);
  }).observe(footer);
}

let app: GlobeApp | null = null;
const card = createEventCard(byId("event-card"), () => {
  app?.select(null);
  setAccent(null);
});

const panel = createFilterPanel(
  byId("filter-panel"),
  byId<HTMLButtonElement>("filter-toggle"),
  (change) => {
    filters = { ...filters, ...change };
    applyFilters();
  },
  () => {
    filters = defaultFilters();
    applyFilters();
  },
  () => card.close(),
);

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
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Counts["categories"];
  const severities = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Counts["severities"];
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

/** Applies the filters to every part of the page and to the web address. */
function applyFilters(): void {
  const { from, to } = windowOf(filters, Date.now());
  const inWindow = allEvents.filter((e) => {
    const time = Date.parse(e.published);
    return time >= from && time <= to;
  });
  events = inWindow.filter((e) => matchesExceptTime(e, filters)).sort(compareBySeverity);
  panel.render(filters, chipCounts(inWindow), activeFilters(filters));
  renderSummary(events.length, allEvents.length, !isDefault(filters), () => {
    filters = defaultFilters();
    applyFilters();
  });
  window.history.replaceState(null, "", window.location.pathname + toQuery(filters));
  if (app) {
    app.setEvents(events);
    renderEventList(list, events, listHandlers);
    if (allEvents.length > 0) notice(events.length === 0 ? "No events match these filters." : null);
  }
}

function openEvent(event: GlobeEvent, focus: boolean, back?: () => void): void {
  panel.close();
  app?.select(event.id);
  if (!back) app?.flyTo(event);
  setAccent(SEVERITY_STYLES[event.severity].color);
  card.open(event, focus, back);
}

/** A pillar was chosen: one event opens its card, a group opens its list. */
function openCluster(cluster: Cluster, focus: boolean): void {
  if (cluster.events.length === 1) {
    openEvent(cluster.lead, focus);
    return;
  }
  panel.close();
  app?.select(cluster.id);
  app?.flyTo(cluster);
  setAccent(SEVERITY_STYLES[cluster.severity].color);
  card.openList(cluster, focus, (event) =>
    openEvent(event, true, () => {
      app?.select(cluster.id);
      setAccent(SEVERITY_STYLES[cluster.severity].color);
      card.openList(cluster, true, (again) => openEvent(again, true, () => openCluster(cluster, true)));
    }),
  );
}

function showList(message: string): void {
  document.body.classList.add("no-globe");
  status.textContent = message;
  status.hidden = false;
  renderEventList(list, events, { onOpen: (event) => card.open(event, true) });
}

/** The footer's version: build date and commit, linked to that commit on GitHub. */
function showVersion(): void {
  const link = byId<HTMLAnchorElement>("version");
  link.textContent = `Version ${__BUILD_DATE__} · ${__BUILD_COMMIT__}`;
  const sha = __BUILD_COMMIT__.replace("+", "");
  if (/^[0-9a-f]{7}$/.test(sha)) link.href = `https://github.com/KriMaDev/global_truth/commit/${sha}`;
}

async function start(): Promise<void> {
  showVersion();
  renderLegend(byId("legend"));
  setupMotionToggle(byId<HTMLButtonElement>("motion-toggle"), (on) => app?.setReducedMotion(on));

  let loadFailed = false;
  try {
    const loaded = await loadEvents();
    allEvents = loaded.events;
    dataTime = loaded.generated;
    if (loaded.sample) byId("preview-note").hidden = false;
  } catch (error) {
    console.error(error);
    loadFailed = true;
  }
  applyFilters();

  if (!hasWebGL()) {
    showList("This browser cannot show the 3D globe, so the events are listed instead.");
    return;
  }
  try {
    const { createGlobeApp } = await import("./globe/globe");
    app = await createGlobeApp(container, {
      events,
      reducedMotion: initialReducedMotion(),
      onSelect: (cluster) => openCluster(cluster, false),
      onView: (pov) => {
        view = pov;
        updateHud();
      },
    });
    window.setInterval(updateHud, 30_000);
    attachKeyboard(container, app);
    status.hidden = true;
    container.classList.add("ready");
    applyFilters();
    if (loadFailed) notice("Couldn't load the latest events. Please try again in a few minutes.");
    else if (allEvents.length === 0) notice("No events in the last 7 days.");
  } catch (error) {
    console.error(error);
    showList("The 3D globe could not start, so the events are listed instead.");
  }
}

void start();
