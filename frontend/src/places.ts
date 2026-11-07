/**
 * The place drill-down: All → continent → region → country → province/state → city, built
 * from the events themselves (their `geo`), so every choice shows how many events it has.
 */

import { PLACE_LEVELS, type PlaceLevel } from "./filters";
import type { GlobeEvent } from "./types";

export interface PlaceOption {
  value: string;
  label: string;
  count: number;
}

export const LEVEL_NAMES: Record<PlaceLevel, string> = {
  continent: "Continent",
  region: "Region",
  country_code: "Country",
  admin1: "Province or state",
  city: "City",
};

function inPlace(event: GlobeEvent, path: string[]): boolean {
  const geo = event.geo;
  return Boolean(geo) && path.every((value, level) => geo?.[PLACE_LEVELS[level]] === value);
}

/** The label for a value at a level (country codes show the country's name). */
function labelOf(event: GlobeEvent, level: PlaceLevel): string | null {
  const geo = event.geo;
  if (!geo) return null;
  return level === "country_code" ? geo.country : geo[level];
}

/** The choices one level below `path`, most events first, with counts. */
export function placeOptions(events: GlobeEvent[], path: string[]): PlaceOption[] {
  if (path.length >= PLACE_LEVELS.length) return [];
  const level = PLACE_LEVELS[path.length];
  const options = new Map<string, PlaceOption>();
  for (const event of events) {
    if (!inPlace(event, path)) continue;
    const value = event.geo?.[level];
    if (!value) continue;
    const option = options.get(value) ?? { value, label: labelOf(event, level) ?? value, count: 0 };
    option.count += 1;
    options.set(value, option);
  }
  return [...options.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Readable names for each step of a path, e.g. ["Asia", "Southern Asia", "India"]. */
export function placeNames(events: GlobeEvent[], path: string[]): string[] {
  return path.map((value, level) => {
    if (PLACE_LEVELS[level] !== "country_code") return value;
    const match = events.find((e) => e.geo?.country_code === value);
    return match?.geo?.country ?? value;
  });
}

const RAD = Math.PI / 180;

/** The middle of a place's events (an average on the sphere), or null with none. */
export function placeCenter(events: GlobeEvent[], path: string[]): { lat: number; lng: number } | null {
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (const event of events) {
    if (!inPlace(event, path)) continue;
    const lat = event.lat * RAD;
    const lng = event.lng * RAD;
    x += Math.cos(lat) * Math.cos(lng);
    y += Math.cos(lat) * Math.sin(lng);
    z += Math.sin(lat);
    n += 1;
  }
  if (n === 0) return null;
  return {
    lat: Math.atan2(z, Math.hypot(x, y)) / RAD,
    lng: Math.atan2(y, x) / RAD,
  };
}

/** How high to fly for a place level: the whole world, then ever closer. */
export function placeAltitude(depth: number): number {
  return [2.4, 2.0, 1.6, 1.0, 0.6, 0.4][Math.min(depth, 5)];
}
