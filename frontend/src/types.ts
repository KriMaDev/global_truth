/**
 * The shape of an event on the globe. The data pipeline writes the same shape
 * (documented in docs/architecture.md); keep both in step.
 */

export const SEVERITIES = ["low", "moderate", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CATEGORIES = [
  "war",
  "politics",
  "natural-disasters",
  "economic",
  "technology",
  "health",
  "climate",
  "crime",
  "humanitarian",
  "science",
  "sport",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  war: "War",
  politics: "Politics",
  "natural-disasters": "Natural disasters",
  economic: "Economic",
  technology: "Technology advancements",
  health: "Health & outbreaks",
  climate: "Climate & environment",
  crime: "Crime & justice",
  humanitarian: "Humanitarian & migration",
  science: "Science & space",
  sport: "Sport",
};

/** Natural disaster types by hazard code: GDACS's codes, plus ours for news headlines
 * (pipeline/globe_pipeline/categorize.py, HAZARD_WORDS). */
export const HAZARD_LABELS: Record<string, string> = {
  EQ: "Earthquake",
  TS: "Tsunami",
  TC: "Tropical cyclone",
  VO: "Volcano",
  WF: "Wildfire",
  FL: "Flood",
  LS: "Landslide",
  AV: "Avalanche",
  DR: "Drought",
  HW: "Heatwave",
  ST: "Storm",
};

/** The disaster type of an event ("Earthquake"), or null when it has none or it is unknown. */
export function hazardLabel(event: { hazard?: string | null }): string | null {
  return (event.hazard && HAZARD_LABELS[event.hazard]) || null;
}

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
  /** Funded and editorially controlled by a government (docs/sources.md). */
  state_affiliated?: boolean;
}

export const PRECISIONS = ["city", "region", "country", "remote"] as const;
export type Precision = (typeof PRECISIONS)[number];

/** Where an event is, as a place hierarchy (for drill-down and the geography view). */
export interface EventGeo {
  continent: string | null;
  region: string | null;
  country: string | null;
  country_code: string | null;
  admin1: string | null;
  city: string | null;
  precision: Precision;
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
  /** Where each category came from: "headline", "section:<name>", "topics" or
   * "sport-section" (docs/categories.md). Absent for data feeds. */
  category_basis?: Partial<Record<Category, string>>;
  kind: EventKind;
  /** ISO 8601 time the source published it (for news: when GDELT first saw it). */
  published: string;
  sources: EventSource[];
  /** Why it has this severity, in plain words (docs/severity.md). */
  severity_reason?: string;
  /** Which feed it came from: "usgs", "gdacs" or "gdelt". */
  feed?: string;
  hazard?: string | null;
  first_seen?: string;
  /** How many different outlets or providers report it. */
  coverage?: number;
  geo?: EventGeo;
  /** "source": coordinates from the feed; "machine-coded": worked out from the text. */
  location_method?: "source" | "machine-coded";
}

/** One source's health, from feeds.json. */
export interface FeedStatus {
  id: string;
  name: string;
  kind: string;
  homepage: string;
  status: string;
  last_success?: string;
  last_attempt?: string;
  count?: number;
}
