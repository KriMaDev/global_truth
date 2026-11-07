/**
 * The geography view's data and rules: country shapes coloured by severity, and labels for
 * countries, oceans and seas, mountain ranges, deserts and peaks that appear by importance as
 * you zoom. Data: /geo/countries.json and /geo/labels.json (Natural Earth, public domain),
 * made by tools/build_geo.py.
 */

import { SEVERITIES, type GlobeEvent, type Severity } from "./types";

export interface CountryShape {
  iso2: string;
  name: string;
  continent: string | null;
  region: string | null;
  /** [lng, lat] where the name goes. */
  label: [number, number];
  /** Natural Earth label rank: 2 for the largest countries, up to 7. */
  rank: number;
  /** Polygons, each a list of rings, each a list of [lng, lat]. */
  polygons: number[][][][];
}

interface PlaceLabel {
  name: string;
  rank: number;
  at: [number, number];
}

export interface GeoLabels {
  seas: (PlaceLabel & { kind: string })[];
  regions: (PlaceLabel & { kind: "range" | "desert" })[];
  peaks: (PlaceLabel & { elevation: number })[];
}

export interface GeographyData {
  countries: CountryShape[];
  labels: GeoLabels;
}

export type LabelKind = "country" | "ocean" | "sea" | "range" | "desert" | "peak";

export interface MapLabel {
  id: string;
  kind: LabelKind;
  text: string;
  /** Natural Earth rank: lower is more important. */
  rank: number;
  lat: number;
  lng: number;
}

/**
 * The colour rule (docs/severity.md, "Geography view"): a country takes the highest severity
 * among its events in the current filters and time window. Countries without events stay
 * neutral.
 */
export function countrySeverity(events: GlobeEvent[]): Map<string, Severity> {
  const result = new Map<string, Severity>();
  for (const event of events) {
    const code = event.geo?.country_code;
    if (!code) continue;
    const current = result.get(code);
    if (!current || SEVERITIES.indexOf(event.severity) > SEVERITIES.indexOf(current)) {
      result.set(code, event.severity);
    }
  }
  return result;
}

/** Event counts per country and severity, for the country's hover label. */
export function countryCounts(events: GlobeEvent[], iso2: string): Record<Severity, number> {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const event of events) if (event.geo?.country_code === iso2) counts[event.severity] += 1;
  return counts;
}

/** 0 when far away, up to 3 when zoomed right in. */
export function labelLevel(altitude: number): 0 | 1 | 2 | 3 {
  // Within the zoom limits (closest 0.5, or 0.9 on phones), every level is reachable.
  if (altitude >= 2) return 0;
  if (altitude >= 1.4) return 1;
  if (altitude >= 1) return 2;
  return 3;
}

/** Highest rank shown at each level (lower rank = more important). */
const LIMITS = {
  country: [3, 4, 7, 7],
  sea: [0, 1, 3, 4],
  region: [1, 2, 3, 4],
  peak: [1, 2, 4, 5],
} as const;

const formatter = new Intl.NumberFormat("en-GB");

function titleCase(text: string): string {
  // Natural Earth writes some names in capitals ("HIMALAYAS"); the labels are shown in
  // capitals anyway, but tooltips and screen readers read better in title case.
  return text === text.toUpperCase()
    ? text.toLowerCase().replace(/(^|[\s(-])\p{L}/gu, (m) => m.toUpperCase())
    : text;
}

const KIND_ORDER: Record<LabelKind, number> = { ocean: 0, country: 1, sea: 2, range: 3, desert: 3, peak: 4 };

/** Which label wins where two would overlap: oceans, then countries, seas, ranges and
 * deserts, then peaks; within a kind, the more important (lower rank) first. */
export function labelPriority(label: MapLabel): number {
  return KIND_ORDER[label.kind] * 100 + label.rank;
}

/** The labels to show at a camera altitude. */
export function labelsFor(altitude: number, data: GeographyData): MapLabel[] {
  const level = labelLevel(altitude);
  const labels: MapLabel[] = [];
  for (const country of data.countries) {
    if (country.rank > LIMITS.country[level]) continue;
    labels.push({ id: `country:${country.iso2}`, kind: "country", text: country.name, rank: country.rank, lng: country.label[0], lat: country.label[1] });
  }
  for (const sea of data.labels.seas) {
    if (sea.rank > LIMITS.sea[level]) continue;
    labels.push({
      id: `sea:${sea.name}`,
      kind: sea.kind === "ocean" ? "ocean" : "sea",
      text: titleCase(sea.name),
      rank: sea.rank,
      lng: sea.at[0],
      lat: sea.at[1],
    });
  }
  for (const region of data.labels.regions) {
    if (region.rank > LIMITS.region[level]) continue;
    labels.push({ id: `${region.kind}:${region.name}`, kind: region.kind, text: titleCase(region.name), rank: region.rank, lng: region.at[0], lat: region.at[1] });
  }
  for (const peak of data.labels.peaks) {
    if (peak.rank > LIMITS.peak[level]) continue;
    labels.push({
      id: `peak:${peak.name}`,
      kind: "peak",
      text: `${peak.name} ${formatter.format(peak.elevation)} m`,
      rank: peak.rank,
      lng: peak.at[0],
      lat: peak.at[1],
    });
  }
  return labels;
}
