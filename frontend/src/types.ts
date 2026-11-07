/**
 * The shape of an event on the globe. The data pipeline writes the same shape
 * (documented in docs/architecture.md); keep both in step.
 */

export const SEVERITIES = ["low", "moderate", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CATEGORIES = ["war", "politics", "natural-disasters", "economic", "technology"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  war: "War",
  politics: "Politics",
  "natural-disasters": "Natural disasters",
  economic: "Economic",
  technology: "Technology advancements",
};

/** Where an event comes from: a verified data feed, a news report, or preview sample data. */
export const KINDS = ["data-feed", "news", "sample"] as const;
export type EventKind = (typeof KINDS)[number];

export const KIND_LABELS: Record<EventKind, string> = {
  "data-feed": "Data feed",
  news: "News report",
  sample: "Sample, not a real event",
};

export interface EventSource {
  name: string;
  url: string;
}

export interface GlobeEvent {
  id: string;
  /** The original headline, never rewritten. */
  title: string;
  /** A short snippet from the source (at most 280 characters), never the full text. */
  snippet: string;
  /** Human-readable place, e.g. "Tokyo, Japan". */
  place: string;
  lat: number;
  lng: number;
  severity: Severity;
  categories: Category[];
  kind: EventKind;
  /** ISO 8601 time the source published it. */
  published: string;
  sources: EventSource[];
}
