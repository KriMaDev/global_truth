/**
 * The Sources page. The tables are plain HTML (readable without scripts); this adds what
 * changes: each feed's live status (feeds.json) and each outlet's event count (outlets.json).
 * If either file can't be loaded, the page says so or simply keeps its dashes.
 */

import "./page";
import { describeFreshness, parseFeeds, relativeTime, statusLabel, type FeedsReport } from "./feeds";
import { parseOutletDirectory } from "./outlets";
import { KIND_LABELS, type EventKind, type FeedStatus } from "./types";
import { el, timeFormat } from "./ui/dom";

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function need(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} on the Sources page`);
  return node;
}

function nameCell(feed: FeedStatus): HTMLTableCellElement {
  const cell = el("td", "");
  if (/^https:\/\//.test(feed.homepage ?? "")) {
    const link = el("a", "", feed.name);
    link.href = feed.homepage;
    cell.append(link);
  } else {
    cell.textContent = feed.name;
  }
  return cell;
}

function feedRow(feed: FeedStatus, now: number): HTMLTableRowElement {
  const row = el("tr", "");
  const when = el("td", "", feed.last_success ? relativeTime(feed.last_success, now) : "Never");
  if (feed.last_success) when.title = timeFormat.format(new Date(feed.last_success));
  row.append(
    nameCell(feed),
    el("td", "", KIND_LABELS[feed.kind as EventKind] ?? feed.kind),
    el("td", feed.status === "ok" ? "" : "doc-failed", statusLabel(feed.status)),
    when,
    el("td", "", feed.count === undefined ? "–" : String(feed.count)),
  );
  return row;
}

function showFeeds(report: FeedsReport): void {
  const now = Date.now();
  const fresh = describeFreshness(null, report, now);
  need("feed-summary").textContent = `${fresh.updated}. The feeds are checked every 30 minutes.`;
  need("feed-warnings").replaceChildren(...fresh.warnings.map((line) => el("p", "news-warning", line)));
  need("feed-rows").replaceChildren(...report.feeds.map((feed) => feedRow(feed, now)));
  need("feed-table").hidden = report.feeds.length === 0;
}

function showOutletCounts(doc: unknown): void {
  for (const outlet of parseOutletDirectory(doc).outlets.values()) {
    const cell = document.getElementById(`outlet-${outlet.slug}`)?.querySelector("[data-count]");
    if (cell) cell.textContent = String(outlet.events);
  }
}

fetchJson("/data/feeds.json")
  .then((doc) => showFeeds(parseFeeds(doc)))
  .catch((error: unknown) => {
    console.warn("Feed status unavailable:", error);
    need("feed-summary").textContent = "The feed status couldn't be loaded. Please try again in a few minutes.";
  });

fetchJson("/data/outlets.json")
  .then(showOutletCounts)
  .catch((error: unknown) => console.warn("Outlet counts unavailable:", error));
