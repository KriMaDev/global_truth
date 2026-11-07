/**
 * The card for one event: headline as published, place, severity, categories, time, snippet
 * and its sources. Built from text nodes only, since every field comes from outside.
 */

import { SEVERITY_STYLES } from "../severity";
import { CATEGORY_LABELS, KIND_LABELS, type GlobeEvent } from "../types";

export interface EventCard {
  open(event: GlobeEvent, focus: boolean): void;
  close(): void;
  readonly openId: string | null;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

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

function sourcesBlock(event: GlobeEvent): HTMLElement {
  const block = el("div", "card-sources");
  if (event.sources.length === 0) {
    block.append(el("p", "card-note", "No source: this is sample data for the preview."));
    return block;
  }
  block.append(el("h3", "card-subtitle", event.sources.length === 1 ? "Source" : "Sources"));
  const list = el("ul", "card-source-list");
  for (const source of event.sources) {
    const link = el("a", "", source.name);
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const item = el("li", "");
    item.append(link);
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

    const kind = el("p", `card-kind kind-${event.kind}`, KIND_LABELS[event.kind]);
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

    root.replaceChildren(
      closeButton,
      kind,
      title,
      el("p", "card-place", event.place),
      meta,
      el("p", "card-snippet", event.snippet),
      sourcesBlock(event),
    );
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
