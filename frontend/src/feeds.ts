/**
 * How fresh the data is, from /data/feeds.json (each source's health, written by the pipeline
 * at every run). The site says when each feed last updated and says so plainly when something
 * is old or failing, instead of showing old news as if it were current.
 */

import type { FeedStatus } from './types';

export interface FeedsReport {
  generated: string | null;
  feeds: FeedStatus[];
}

export const FEED_NAMES: Record<string, string> = { usgs: 'USGS', gdacs: 'GDACS', gdelt: 'GDELT' };

/** The update runs every 30 minutes; after 2 hours, something is wrong. */
export const STALE_AFTER_MS = 2 * 3_600_000;

function isDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isFeed(value: unknown): value is FeedStatus {
  if (typeof value !== 'object' || value === null) return false;
  const feed = value as Record<string, unknown>;
  return (
    typeof feed.id === 'string' &&
    typeof feed.name === 'string' &&
    typeof feed.status === 'string' &&
    (feed.last_success === undefined || feed.last_success === null || isDate(feed.last_success))
  );
}

/** The report from untrusted JSON; malformed feeds are left out. */
export function parseFeeds(input: unknown): FeedsReport {
  const doc = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  return {
    generated: isDate(doc.generated) ? doc.generated : null,
    feeds: Array.isArray(doc.feeds) ? doc.feeds.filter(isFeed) : [],
  };
}

/** "just now", "12 min ago", "5 h ago", "3 days ago". */
export function relativeTime(time: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(time)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/** A feed's status in words, for the Sources page. */
export function statusLabel(status: string): string {
  if (status === 'ok') return 'OK';
  return status === 'partial' ? 'Partly read' : 'Failed';
}

function feedName(feed: FeedStatus): string {
  return FEED_NAMES[feed.id] ?? feed.name;
}

export interface Freshness {
  /** "Updated 12 min ago", or that the time is unknown. */
  updated: string;
  /** "USGS 12 min ago · GDACS 12 min ago · GDELT 12 min ago"; empty without feeds.json. */
  details: string;
  /** Warnings to show: old data, failed feeds. */
  warnings: string[];
}

/** What to say about the data's age. `dataTime` is when the events on screen were written. */
export function describeFreshness(
  dataTime: string | null,
  report: FeedsReport | null,
  now: number,
): Freshness {
  const generated = dataTime ?? report?.generated ?? null;
  const feeds = report?.feeds ?? [];
  const warnings: string[] = [];
  if (generated && now - Date.parse(generated) > STALE_AFTER_MS) {
    warnings.push(`Data may be out of date: the last update was ${relativeTime(generated, now)}.`);
  }
  for (const feed of feeds.filter((f) => f.status !== 'ok')) {
    if (feed.status === 'partial') {
      warnings.push(
        `${feedName(feed)} was read only in part in the last update. The missing part is tried again next time.`,
      );
      continue;
    }
    const since = feed.last_success
      ? ` Its latest good data is from ${relativeTime(feed.last_success, now)}.`
      : '';
    warnings.push(`${feedName(feed)} failed in the last update.${since}`);
  }
  return {
    updated: generated ? `Updated ${relativeTime(generated, now)}` : 'Update time unknown',
    details: feeds
      .map((f) => `${feedName(f)} ${f.last_success ? relativeTime(f.last_success, now) : 'never'}`)
      .join(' · '),
    warnings,
  };
}
