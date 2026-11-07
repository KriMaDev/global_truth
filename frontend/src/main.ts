/**
 * The page shell: legend, motion switch, event card and keyboard list appear at once; the 3D
 * globe (three.js, the largest part) is loaded afterwards. Without WebGL, or if the globe
 * fails, the events are shown as a plain list instead, so the page always works.
 */

import sampleEvents from "./data/sample-events.json";
import { compareBySeverity, parseEvents } from "./events";
import type { GlobeApp } from "./globe/globe";
import { attachKeyboard } from "./globe/keyboard";
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

const events = parseEvents(sampleEvents).sort(compareBySeverity);
const container = byId<HTMLDivElement>("globe");
const status = byId<HTMLParagraphElement>("status");
const list = byId<HTMLElement>("event-list");

let app: GlobeApp | null = null;
const card = createEventCard(byId("event-card"), () => app?.select(null));

function openEvent(event: GlobeEvent, focus: boolean): void {
  app?.select(event.id);
  app?.flyTo(event);
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

  if (events.length === 0) {
    status.textContent = "No events to show right now.";
    return;
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
    });
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
  } catch (error) {
    console.error(error);
    showList("The 3D globe could not start, so the events are listed instead.");
  }
}

void start();
