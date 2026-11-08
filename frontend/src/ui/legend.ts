/** The always-visible legend, built from SEVERITY_STYLES so it can never drift from the globe. */

import { HAZARD_ICONS, iconSvg } from "../globe/hazard-icons";
import { SEVERITY_STYLES } from "../severity";
import { SEVERITIES } from "../types";

/** Pillar height in pixels for the lowest level; grows like the pillars on the globe. */
const PILLAR_PX = 7;

export function pulseLabel(pulseSeconds: number | null): string {
  if (pulseSeconds === null) return "steady";
  if (pulseSeconds >= 2) return "slow pulse";
  if (pulseSeconds >= 1.2) return "pulse";
  return "fast pulse";
}

/** The symbols' highlight colour in the legend (on the globe it is the severity colour). */
const LEGEND_ACCENT = "#f2b24c";

function span(className: string, text?: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A small glass disc with a symbol, like those on the globe. */
export function symbolBadge(code: string): HTMLSpanElement {
  const badge = span("legend-symbol");
  badge.setAttribute("aria-hidden", "true");
  const icon = HAZARD_ICONS.find((i) => i.code === code) ?? HAZARD_ICONS[HAZARD_ICONS.length - 1];
  badge.append(iconSvg(icon, LEGEND_ACCENT));
  return badge;
}

/** "Pillar = news report, symbol = natural disaster", and every symbol by name on request. */
function markersKey(): HTMLElement[] {
  const key = document.createElement("p");
  key.className = "legend-markers";
  const pillar = span("legend-pillar");
  pillar.setAttribute("aria-hidden", "true");
  pillar.style.setProperty("--pillar-h", "13px");
  pillar.style.setProperty("--pillar-w", "3px");
  pillar.style.setProperty("--dot-color", "var(--accent)");
  const news = span("legend-marker");
  news.append(pillar, "News report");
  const disaster = span("legend-marker");
  disaster.append(symbolBadge("EQ"), "Natural disaster");
  key.append(news, disaster);

  const details = document.createElement("details");
  details.className = "legend-symbols";
  const summary = document.createElement("summary");
  summary.textContent = "Disaster symbols";
  const list = document.createElement("ul");
  for (const icon of HAZARD_ICONS) {
    const item = document.createElement("li");
    item.append(symbolBadge(icon.code), icon.label);
    list.append(item);
  }
  details.append(summary, list);
  return [key, details];
}

export function renderLegend(root: HTMLElement): void {
  const heading = document.createElement("h2");
  heading.className = "legend-title";
  heading.textContent = "Severity";

  const list = document.createElement("ul");
  list.className = "legend-list";
  for (const level of [...SEVERITIES].reverse()) {
    const style = SEVERITY_STYLES[level];
    const item = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = style.pulseSeconds === null ? "legend-pillar" : "legend-pillar pulsing";
    dot.setAttribute("aria-hidden", "true");
    dot.style.setProperty("--pillar-h", `${Math.round(PILLAR_PX * style.size ** 1.6)}px`);
    dot.style.setProperty("--pillar-w", `${(3 * Math.sqrt(style.size)).toFixed(1)}px`);
    dot.style.setProperty("--dot-color", style.color);
    if (style.pulseSeconds !== null) dot.style.setProperty("--pulse", `${style.pulseSeconds}s`);
    const name = document.createElement("span");
    name.className = "legend-name";
    name.textContent = style.label;
    const how = document.createElement("span");
    how.className = "legend-how";
    how.textContent = style.rings ? `${pulseLabel(style.pulseSeconds)}, rings` : pulseLabel(style.pulseSeconds);
    item.append(dot, name, how);
    list.append(item);
  }

  const link = document.createElement("a");
  link.className = "legend-link";
  link.href = "https://github.com/KriMaDev/global_truth/blob/main/docs/severity.md";
  link.textContent = "How severity is decided";
  link.target = "_blank";
  link.rel = "noopener";

  const summary = document.createElement("p");
  summary.className = "legend-summary";
  summary.id = "legend-summary";
  summary.setAttribute("aria-live", "polite");
  summary.hidden = true;

  // Shown in the geography view only (by CSS, body.geo-view).
  const geoNote = document.createElement("p");
  geoNote.className = "legend-geo-note";
  geoNote.textContent = "Countries take the colour of their most severe event";

  root.replaceChildren(heading, list, ...markersKey(), geoNote, link, summary);
}

/** "Showing 37 of 412 events · Clear filters" while filters are on; hidden otherwise. */
export function renderSummary(shown: number, total: number, filtered: boolean, onClear: () => void): void {
  const summary = document.getElementById("legend-summary");
  if (!summary) return;
  summary.hidden = !filtered;
  if (!filtered) return;
  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "Clear";
  clear.addEventListener("click", onClear);
  summary.replaceChildren(`Showing ${shown} of ${total} events`, clear);
}
