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
import type { GlobeApp } from "./globe/globe";
import { attachKeyboard } from "./globe/keyboard";
import { SEVERITY_STYLES } from "./severity";
import type { GlobeEvent } from "./types";
import { createEventCard } from "./ui/event-card";
import { renderEventList } from "./ui/event-list";
import { renderLegend } from "./ui/legend";
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

let events: GlobeEvent[] = [];
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

/** A message that stays visible over the globe (loading problems, empty data). */
function notice(message: string): void {
  status.textContent = message;
  status.classList.add("notice");
  status.hidden = false;
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

function openEvent(event: GlobeEvent, focus: boolean): void {
  app?.select(event.id);
  app?.flyTo(event);
  setAccent(SEVERITY_STYLES[event.severity].color);
  card.open(event, focus);
}

function showList(message: string): void {
  document.body.classList.add("no-globe");
  status.textContent = message;
  status.hidden = false;
  renderEventList(list, events, { onOpen: (event) => card.open(event, true) });
}

async function start(): Promise<void> {
  renderLegend(byId("legend"));
  setupMotionToggle(byId<HTMLButtonElement>("motion-toggle"), (on) => app?.setReducedMotion(on));

  let loadFailed = false;
  try {
    const loaded = await loadEvents();
    events = loaded.events;
    dataTime = loaded.generated;
    if (loaded.sample) byId("preview-note").hidden = false;
  } catch (error) {
    console.error(error);
    loadFailed = true;
  }

  if (!hasWebGL()) {
    showList("This browser cannot show the 3D globe, so the events are listed instead.");
    return;
  }
  try {
    const { createGlobeApp } = await import("./globe/globe");
    app = await createGlobeApp(container, {
      events,
      reducedMotion: initialReducedMotion(),
      onSelect: (event) => openEvent(event, false),
      onView: (pov) => {
        view = pov;
        updateHud();
      },
    });
    window.setInterval(updateHud, 30_000);
    attachKeyboard(container, app);
    renderEventList(list, events, {
      onFocus: (event) => {
        app?.select(event.id);
        app?.flyTo(event);
      },
      onOpen: (event) => openEvent(event, true),
    });
    status.hidden = true;
    container.classList.add("ready");
    if (loadFailed) notice("Couldn't load the latest events. Please try again in a few minutes.");
    else if (events.length === 0) notice("No events in the last 72 hours.");
  } catch (error) {
    console.error(error);
    showList("The 3D globe could not start, so the events are listed instead.");
  }
}

void start();
