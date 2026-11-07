/**
 * The card for one event: the headline as published, place, severity and why, categories,
 * time, any snippet, notes on where it comes from, and every source with a link. Built from
 * text nodes only, since every field comes from outside.
 */

import type { Cluster } from "../clusters";
import { SEVERITY_STYLES } from "../severity";
import { CATEGORY_LABELS, KIND_LABELS, type GlobeEvent } from "../types";

export interface EventCard {
  /** One event's card; `back`, if given, adds "Back to the list". */
  open(event: GlobeEvent, focus: boolean, back?: () => void): void;
  /** A group's list of events. */
  openList(cluster: Cluster, focus: boolean, onPick: (event: GlobeEvent) => void): void;
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

  const closeButton = (): HTMLButtonElement => {
    const button = el("button", "card-close", "×");
    button.type = "button";
    button.setAttribute("aria-label", "Close");
    button.addEventListener("click", close);
    return button;
  };

  const rememberFocus = (focus: boolean): void => {
    if (returnFocus === null && focus && document.activeElement instanceof HTMLElement) {
      returnFocus = document.activeElement;
    }
  };

  const open = (event: GlobeEvent, focus: boolean, back?: () => void): void => {
    const style = SEVERITY_STYLES[event.severity];
    openId = event.id;
    rememberFocus(focus);

    const parts: HTMLElement[] = [closeButton()];
    if (back) {
      const backButton = el("button", "card-back", "← Back to the list");
      backButton.type = "button";
      backButton.addEventListener("click", back);
      parts.push(backButton);
    }
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

    parts.push(kind, title, el("p", "card-place", placeLine(event)), meta);
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
    root.scrollTop = 0;
    if (focus) title.focus();
  };

  /** A group's card: every event in it, most severe first; choosing one opens its card. */
  const openList = (cluster: Cluster, focus: boolean, onPick: (event: GlobeEvent) => void): void => {
    openId = cluster.id;
    rememberFocus(focus);
    const style = SEVERITY_STYLES[cluster.severity];
    const title = el("h2", "card-title", `${cluster.events.length} events near ${cluster.lead.place}`);
    title.id = "event-card-title";
    title.tabIndex = -1;
    const list = el("ul", "card-list");
    for (const event of cluster.events) {
      const button = el("button", "card-list-item");
      button.type = "button";
      const dot = el("span", "card-dot");
      dot.setAttribute("aria-hidden", "true");
      dot.style.setProperty("--dot-color", SEVERITY_STYLES[event.severity].color);
      const text = el("span", "card-list-text");
      text.append(
        el("span", "card-list-title", event.title),
        el(
          "span",
          "card-list-meta",
          `${SEVERITY_STYLES[event.severity].label} · ${event.sources[0]?.name ?? KIND_LABELS[event.kind]} · ${timeFormat.format(new Date(event.published))}`,
        ),
      );
      button.append(dot, text);
      button.addEventListener("click", () => onPick(event));
      const item = el("li", "");
      item.append(button);
      list.append(item);
    }
    root.replaceChildren(
      closeButton(),
      el("p", "card-kind", `Group · ${cluster.events.length} events`),
      title,
      el("p", "card-reason", `Most severe here: ${style.label}. Events within a short distance are grouped; zoom in to separate them.`),
      list,
    );
    root.hidden = false;
    root.scrollTop = 0;
    if (focus) title.focus();
  };

  return {
    open,
    openList,
    close,
    get openId() {
      return openId;
    },
  };
}
