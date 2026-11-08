/**
 * What the visitor chose to see: categories, severities, a time window and a place. Kept in
 * the web address (so a view can be shared) and applied to every part of the page.
 */

import { CATEGORIES, SEVERITIES, type Category, type GlobeEvent, type Severity } from "./types";

/** Time windows, in hours. The data covers 7 days. */
export const RANGES = { "6h": 6, "24h": 24, "3d": 72, "7d": 168 } as const;
export type RangeKey = keyof typeof RANGES;
export const RANGE_LABELS: Record<RangeKey, string> = {
  "6h": "6 h",
  "24h": "24 h",
  "3d": "3 days",
  "7d": "7 days",
};
export const DEFAULT_RANGE: RangeKey = "3d";
export const HISTORY_HOURS = 168;

/** Categories hidden until the visitor turns them on, so they don't crowd the globe (the
 * pipeline's OFF_BY_DEFAULT; a test keeps the two in step). */
export const OFF_BY_DEFAULT: readonly Category[] = ["sport"];
/** The categories shown when nothing else is chosen. */
export const DEFAULT_CATEGORIES: readonly Category[] = CATEGORIES.filter(
  (category) => !OFF_BY_DEFAULT.includes(category),
);

/** The place levels, from widest to narrowest; a path holds a value for the first few. */
export const PLACE_LEVELS = ["continent", "region", "country_code", "admin1", "city"] as const;
export type PlaceLevel = (typeof PLACE_LEVELS)[number];

export interface FilterState {
  categories: Set<Category>;
  severities: Set<Severity>;
  range: RangeKey;
  /** End of the time window (ms since 1970), or null for "now". */
  end: number | null;
  /** e.g. ["Asia", "Southern Asia", "IN"]; empty for the whole world. */
  place: string[];
}

export function defaultFilters(): FilterState {
  return {
    categories: new Set(DEFAULT_CATEGORIES),
    severities: new Set(SEVERITIES),
    range: DEFAULT_RANGE,
    end: null,
    place: [],
  };
}

const HOUR = 3_600_000;

/** The time window [from, to] in ms for a state; `now` is the current time. */
export function windowOf(state: FilterState, now: number): { from: number; to: number } {
  const to = state.end === null ? now : Math.min(state.end, now);
  return { from: to - RANGES[state.range] * HOUR, to };
}

function placeMatches(event: GlobeEvent, place: string[]): boolean {
  if (place.length === 0) return true;
  const geo = event.geo;
  if (!geo) return false;
  return place.every((value, level) => geo[PLACE_LEVELS[level]] === value);
}

/** Whether an event passes every filter except time. */
export function matchesExceptTime(event: GlobeEvent, state: FilterState): boolean {
  return (
    state.severities.has(event.severity) &&
    event.categories.some((category) => state.categories.has(category)) &&
    placeMatches(event, state.place)
  );
}

/** Whether an event passes every filter. */
export function matches(event: GlobeEvent, state: FilterState, now: number): boolean {
  const { from, to } = windowOf(state, now);
  const time = Date.parse(event.published);
  return time >= from && time <= to && matchesExceptTime(event, state);
}

function sameAs<T>(set: Set<T>, list: readonly T[]): boolean {
  return set.size === list.length && list.every((value) => set.has(value));
}

export function isDefault(state: FilterState): boolean {
  return (
    sameAs(state.categories, DEFAULT_CATEGORIES) &&
    state.severities.size === SEVERITIES.length &&
    state.range === DEFAULT_RANGE &&
    state.end === null &&
    state.place.length === 0
  );
}

/** The state as web-address parameters (only what differs from the default). */
export function toQuery(state: FilterState): string {
  const params = new URLSearchParams();
  if (!sameAs(state.categories, DEFAULT_CATEGORIES)) {
    params.set("cat", CATEGORIES.filter((c) => state.categories.has(c)).join(",") || "none");
  }
  if (state.severities.size !== SEVERITIES.length) {
    params.set("sev", SEVERITIES.filter((s) => state.severities.has(s)).join(",") || "none");
  }
  if (state.range !== DEFAULT_RANGE) params.set("range", state.range);
  if (state.end !== null) params.set("end", new Date(state.end).toISOString().slice(0, 13) + "Z");
  if (state.place.length) params.set("place", state.place.join("/"));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** A list from the address; "none" means none chosen, and a missing list or one with no valid
 * value at all (a broken link) gives the default rather than an empty globe. */
function listFrom<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: readonly T[] = allowed,
): Set<T> {
  if (value === null) return new Set(fallback);
  if (value === "none") return new Set();
  const valid = value.split(",").filter((v): v is T => (allowed as readonly string[]).includes(v));
  return new Set(valid.length ? valid : fallback);
}

/** Reads a state from web-address parameters; unknown or broken values are ignored. */
export function fromQuery(search: string): FilterState {
  const params = new URLSearchParams(search);
  const state = defaultFilters();
  state.categories = listFrom(params.get("cat"), CATEGORIES, DEFAULT_CATEGORIES);
  state.severities = listFrom(params.get("sev"), SEVERITIES);
  const range = params.get("range");
  if (range && range in RANGES) state.range = range as RangeKey;
  const end = params.get("end");
  if (end) {
    const parsed = Date.parse(end.length === 14 ? `${end.slice(0, 13)}:00:00Z` : end);
    if (!Number.isNaN(parsed)) state.end = parsed;
  }
  const place = params.get("place");
  if (place) state.place = place.split("/").filter(Boolean).slice(0, PLACE_LEVELS.length);
  return state;
}
