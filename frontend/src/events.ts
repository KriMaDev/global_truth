/**
 * Checking and ordering events. Event data comes from outside (feeds via the pipeline),
 * so every field is checked before use and anything malformed is dropped, not shown.
 */

import { CATEGORIES, KINDS, PRECISIONS, SEVERITIES, type GlobeEvent } from "./types";

const MAX_TITLE = 300;
const MAX_SNIPPET = 280;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    isText(value.name, 120) &&
    isHttpUrl(value.url) &&
    (value.state_affiliated === undefined || typeof value.state_affiliated === "boolean")
  );
}

function isNullableText(value: unknown): boolean {
  return value === null || (typeof value === "string" && value.length <= 200);
}

function isGeo(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    ["continent", "region", "country", "country_code", "admin1", "city"].every((key) =>
      isNullableText(value[key]),
    ) && (PRECISIONS as readonly unknown[]).includes(value.precision)
  );
}

/** Optional fields: absent, or well formed. */
function hasValidExtras(value: Record<string, unknown>): boolean {
  const { severity_reason, feed, hazard, first_seen, coverage, geo, location_method } = value;
  return (
    (severity_reason === undefined || isText(severity_reason, 200)) &&
    (feed === undefined || isText(feed, 20)) &&
    (hazard === undefined || isNullableText(hazard)) &&
    (first_seen === undefined || (typeof first_seen === "string" && !Number.isNaN(Date.parse(first_seen)))) &&
    (coverage === undefined || (Number.isInteger(coverage) && (coverage as number) >= 1)) &&
    (geo === undefined || isGeo(geo)) &&
    (location_method === undefined || location_method === "source" || location_method === "machine-coded")
  );
}

/** True when `value` is a complete, well-formed event. */
export function isGlobeEvent(value: unknown): value is GlobeEvent {
  if (!isRecord(value)) return false;
  const { id, title, snippet, place, lat, lng, severity, categories, kind, published, sources } =
    value;
  return (
    isText(id, 200) &&
    isText(title, MAX_TITLE) &&
    typeof snippet === "string" &&
    snippet.length <= MAX_SNIPPET &&
    isText(place, 200) &&
    typeof lat === "number" &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === "number" &&
    lng >= -180 &&
    lng <= 180 &&
    (SEVERITIES as readonly unknown[]).includes(severity) &&
    Array.isArray(categories) &&
    categories.every((c) => (CATEGORIES as readonly unknown[]).includes(c)) &&
    (KINDS as readonly unknown[]).includes(kind) &&
    typeof published === "string" &&
    !Number.isNaN(Date.parse(published)) &&
    Array.isArray(sources) &&
    sources.length > 0 === (kind !== "sample") &&
    sources.every(isSource) &&
    hasValidExtras(value)
  );
}

/** Keeps the well-formed events from untrusted input; anything else is dropped. */
export function parseEvents(input: unknown): GlobeEvent[] {
  return Array.isArray(input) ? input.filter(isGlobeEvent) : [];
}

/** Most severe first, then newest first. */
export function compareBySeverity(a: GlobeEvent, b: GlobeEvent): number {
  const bySeverity = SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity);
  return bySeverity !== 0 ? bySeverity : Date.parse(b.published) - Date.parse(a.published);
}
