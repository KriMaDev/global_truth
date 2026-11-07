/**
 * The card for one event: the headline as published, place, severity and why, categories,
 * time, any snippet, notes on where it comes from, and every source with a link. Built from
 * text nodes only, since every field comes from outside.
 */

import { SEVERITY_STYLES } from "../severity";
import { CATEGORY_LABELS, KIND_LABELS, type GlobeEvent } from "../types";

export interface EventCard {
  open(event: GlobeEvent, focus: boolean): void;
  close(): void;
  readonly openId: string | null;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const FEED_NAMES: Record<string, string> = { usgs: "USGS", gdacs: "GDACS", gdelt: "GDELT" };

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function kindLine(event: GlobeEvent): string {
  const kind = KIND_LABELS[event.kind];
  if (event.kind === "data-feed" && event.feed && FEED_NAMES[event.feed]) {
    return `${kind} · ${FEED_NAMES[event.feed]}`;
  }
  return kind;
}

function placeLine(event: GlobeEvent): string {
  if (event.geo?.precision === "country") return `${event.place} (country level)`;
  if (event.geo?.precision === "remote") return `${event.place} (remote area or at sea)`;
  return event.place;
}

/** Plain notes on where the event comes from, so the reader can judge it. */
function notes(event: GlobeEvent): string[] {
  const lines: string[] = [];
  if (event.kind === "news") {
    lines.push(`Headline as published by ${event.sources[0]?.name ?? "the outlet"}.`);
    if (event.location_method === "machine-coded") {
      lines.push("Location machine-coded by GDELT from the article.");
    }
  }
  if (event.feed === "gdacs" || event.sources.some((s) => s.name === "GDACS")) {
    lines.push("GDACS alerts are automated estimates. Check official national authorities.");
  }
  if (event.kind === "sample") lines.push("No source: this is sample data for the preview.");
  return lines;
}

function sourcesBlock(event: GlobeEvent): HTMLElement {
  const block = el("div", "card-sources");
  if (event.sources.length === 0) return block;
  const count = event.coverage ?? event.sources.length;
  block.append(el("h3", "card-subtitle", count > 1 ? `Reported by ${count}` : "Source"));
  const list = el("ul", "card-source-list");
  for (const source of event.sources) {
    const link = el("a", "", source.name);
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const item = el("li", "");
    item.append(link);
    if (source.state_affiliated) {
      const badge = el("span", "badge-state", "State-affiliated");
      badge.title = "Funded and editorially controlled by a government (see Sources)";
      item.append(" ", badge);
    }
    list.append(item);
  }
  block.append(list);
  return block;
}

export function createEventCard(root: HTMLElement, onClose: () => void): EventCard {
  let openId: string | null = null;
  let returnFocus: HTMLElement | null = null;

  const close = (): void => {
    if (openId === null) return;
    openId = null;
    root.hidden = true;
    root.replaceChildren();
    onClose();
    returnFocus?.focus();
    returnFocus = null;
  };

  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  const open = (event: GlobeEvent, focus: boolean): void => {
    const style = SEVERITY_STYLES[event.severity];
    openId = event.id;
    returnFocus = focus && document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const closeButton = el("button", "card-close", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close");
    closeButton.addEventListener("click", close);

    const kind = el("p", `card-kind kind-${event.kind}`, kindLine(event));
    const title = el("h2", "card-title", event.title);
    title.id = "event-card-title";
    title.tabIndex = -1;

    const severity = el("li", "card-severity");
    const dot = el("span", "card-dot");
    dot.setAttribute("aria-hidden", "true");
    dot.style.setProperty("--dot-color", style.color);
    severity.append(dot, document.createTextNode(`${style.label} severity`));

    const time = el("time", "", timeFormat.format(new Date(event.published)));
    time.dateTime = event.published;
    const when = el("li", "");
    when.append(time);

    const meta = el("ul", "card-meta");
    meta.append(
      severity,
      el("li", "", event.categories.map((c) => CATEGORY_LABELS[c]).join(", ") || "No category"),
      when,
    );

    const parts: HTMLElement[] = [closeButton, kind, title, el("p", "card-place", placeLine(event)), meta];
    if (event.severity_reason) parts.push(el("p", "card-reason", `Why ${style.label.toLowerCase()}: ${event.severity_reason}`));
    if (event.snippet) parts.push(el("p", "card-snippet", event.snippet));
    const noteLines = notes(event);
    if (noteLines.length) {
      const box = el("div", "card-notes");
      for (const line of noteLines) box.append(el("p", "card-note", line));
      parts.push(box);
    }
    parts.push(sourcesBlock(event));

    root.replaceChildren(...parts);
    root.hidden = false;
    if (focus) title.focus();
  };

  return {
    open,
    close,
    get openId() {
      return openId;
    },
  };
}
