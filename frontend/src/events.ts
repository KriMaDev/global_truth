/**
 * Checking and ordering events. Event data comes from outside (feeds via the pipeline),
 * so every field is checked before use and anything malformed is dropped, not shown.
 */

import { CATEGORIES, KINDS, SEVERITIES, type GlobeEvent } from "./types";

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
  return isRecord(value) && isText(value.name, 120) && isHttpUrl(value.url);
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
    sources.every(isSource)
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
