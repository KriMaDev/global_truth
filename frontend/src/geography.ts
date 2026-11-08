/**
 * The geography view's data and rules: country shapes coloured by severity, lakes, and labels
 * for countries, oceans and seas, mountain ranges, deserts, peaks, rivers and lakes that appear
 * by importance as you zoom, and the facts and text for "About this place". Data:
 * /geo/countries.json, /geo/labels.json and /geo/lakes.json (Natural Earth, public domain, made
 * by tools/build_geo.py) and
 * /geo/places.json (Wikidata CC0 and Wikipedia CC BY-SA 4.0, made by tools/build_places.py).
 */

import { SEVERITIES, type GlobeEvent, type Severity } from './types';

export interface CountryShape {
  iso2: string;
  name: string;
  continent: string | null;
  region: string | null;
  /** [lng, lat] where the name goes. */
  label: [number, number];
  /** Natural Earth label rank: 2 for the largest countries, up to 7. */
  rank: number;
  /** Wikidata ID (from Natural Earth), for "About this place". */
  wikidata?: string | null;
  /** Polygons, each a list of rings, each a list of [lng, lat]. */
  polygons: number[][][][];
}

interface PlaceLabel {
  name: string;
  rank: number;
  at: [number, number];
  wikidata?: string | null;
}

export interface GeoLabels {
  seas: (PlaceLabel & { kind: string })[];
  regions: (PlaceLabel & { kind: 'range' | 'desert' })[];
  peaks: (PlaceLabel & { elevation: number })[];
  /** Rivers (ranked by length) and lakes. */
  waters: (PlaceLabel & { kind: 'river' | 'lake' })[];
}

/** A lake's shape, painted as water over the country colours. */
export interface LakeShape {
  name: string;
  wikidata?: string | null;
  /** Polygons, each a list of rings, each a list of [lng, lat]. */
  polygons: number[][][][];
}

export interface GeographyData {
  countries: CountryShape[];
  labels: GeoLabels;
  lakes: LakeShape[];
}

export type LabelKind =
  'country' | 'ocean' | 'sea' | 'range' | 'desert' | 'peak' | 'river' | 'lake';

export interface MapLabel {
  id: string;
  kind: LabelKind;
  /** Readable type: "Country", "Ocean", "Sea", "Gulf", "Bay", "Strait", "Mountain range"… */
  type: string;
  /** The place's name; `text` is what the label shows (peaks add their height). */
  name: string;
  text: string;
  wikidata: string | null;
  /** Countries only. */
  iso2?: string;
  /** Peaks only, in metres. */
  elevation?: number;
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

/** 0 when far away, up to 4 when zoomed right in (with NASA's sharp tiles, down to 0.15). */
export function labelLevel(altitude: number): 0 | 1 | 2 | 3 | 4 {
  if (altitude >= 2) return 0;
  if (altitude >= 1.4) return 1;
  if (altitude >= 1) return 2;
  if (altitude >= 0.5) return 3;
  return 4;
}

/** Highest rank shown at each level (lower rank = more important). */
const LIMITS = {
  country: [3, 4, 6, 7, 10],
  sea: [0, 1, 3, 4, 9],
  region: [1, 2, 3, 4, 9],
  peak: [1, 2, 4, 5, 7],
  /** Rivers and lakes: none from far away, then the largest (rank 3) first. */
  water: [0, 3, 4, 5, 7],
} as const;

const formatter = new Intl.NumberFormat('en-GB');

function titleCase(text: string): string {
  // Natural Earth writes some names in capitals ("HIMALAYAS"); the labels are shown in
  // capitals anyway, but tooltips and screen readers read better in title case.
  return text === text.toUpperCase()
    ? text.toLowerCase().replace(/(^|[\s(-])\p{L}/gu, (m) => m.toUpperCase())
    : text;
}

const KIND_ORDER: Record<LabelKind, number> = {
  ocean: 0,
  country: 1,
  sea: 2,
  range: 3,
  desert: 3,
  lake: 3,
  river: 3,
  peak: 4,
};

/** Which label wins where two would overlap: oceans, then countries, seas, ranges, deserts,
 * lakes and rivers, then peaks; within a kind, the more important (lower rank) first. */
export function labelPriority(label: MapLabel): number {
  return KIND_ORDER[label.kind] * 100 + label.rank;
}

/** Degrees along the globe's surface between two places. */
export function angularDegrees(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const cosine =
    Math.sin(lat1 * rad) * Math.sin(lat2 * rad) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng1 - lng2) * rad);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) / rad;
}

/** Past the horizon, so that a small turn doesn't show an empty edge. */
const LABEL_MARGIN_DEGREES = 15;

/** The labels that can be on screen from this view, most important first, at most `limit`. */
export function labelsInView(
  labels: MapLabel[],
  lat: number,
  lng: number,
  altitude: number,
  limit: number,
): MapLabel[] {
  const horizon = (Math.acos(1 / (1 + altitude)) * 180) / Math.PI;
  return labels
    .filter(
      (label) => angularDegrees(lat, lng, label.lat, label.lng) <= horizon + LABEL_MARGIN_DEGREES,
    )
    .sort((a, b) => labelPriority(a) - labelPriority(b))
    .slice(0, limit);
}

/** A country's label (also what its card is built from). */
export function countryLabel(country: CountryShape): MapLabel {
  return {
    id: `country:${country.iso2}`,
    kind: 'country',
    type: 'Country',
    name: country.name,
    text: country.name,
    rank: country.rank,
    wikidata: country.wikidata ?? null,
    iso2: country.iso2,
    lng: country.label[0],
    lat: country.label[1],
  };
}

/** The labels to show at a camera altitude. */
export function labelsFor(altitude: number, data: GeographyData): MapLabel[] {
  const level = labelLevel(altitude);
  const labels: MapLabel[] = [];
  for (const country of data.countries) {
    if (country.rank > LIMITS.country[level]) continue;
    labels.push(countryLabel(country));
  }
  for (const sea of data.labels.seas) {
    if (sea.rank > LIMITS.sea[level]) continue;
    const name = titleCase(sea.name);
    labels.push({
      id: `sea:${sea.name}`,
      kind: sea.kind === 'ocean' ? 'ocean' : 'sea',
      type: sea.kind.charAt(0).toUpperCase() + sea.kind.slice(1),
      name,
      text: name,
      rank: sea.rank,
      wikidata: sea.wikidata ?? null,
      lng: sea.at[0],
      lat: sea.at[1],
    });
  }
  for (const region of data.labels.regions) {
    if (region.rank > LIMITS.region[level]) continue;
    const name = titleCase(region.name);
    labels.push({
      id: `${region.kind}:${region.name}`,
      kind: region.kind,
      type: region.kind === 'range' ? 'Mountain range' : 'Desert',
      name,
      text: name,
      rank: region.rank,
      wikidata: region.wikidata ?? null,
      lng: region.at[0],
      lat: region.at[1],
    });
  }
  for (const water of data.labels.waters) {
    if (water.rank > LIMITS.water[level]) continue;
    labels.push(waterLabel(water));
  }
  for (const peak of data.labels.peaks) {
    if (peak.rank > LIMITS.peak[level]) continue;
    labels.push({
      id: `peak:${peak.name}`,
      kind: 'peak',
      type: 'Peak',
      name: peak.name,
      text: `${peak.name} ${formatter.format(peak.elevation)} m`,
      rank: peak.rank,
      wikidata: peak.wikidata ?? null,
      elevation: peak.elevation,
      lng: peak.at[0],
      lat: peak.at[1],
    });
  }
  return labels;
}

/** A river's or lake's label (also what its card is built from). */
export function waterLabel(water: GeoLabels['waters'][number]): MapLabel {
  return {
    id: `${water.kind}:${water.name}`,
    kind: water.kind,
    type: water.kind === 'river' ? 'River' : 'Lake',
    name: water.name,
    text: water.name,
    rank: water.rank,
    wikidata: water.wikidata ?? null,
    lng: water.at[0],
    lat: water.at[1],
  };
}

/** The label of a lake's shape (clicked or hovered), matched by Wikidata ID or name. */
export function lakeLabel(lake: LakeShape, data: GeographyData): MapLabel {
  const water = data.labels.waters.find(
    (w) =>
      w.kind === 'lake' &&
      ((lake.wikidata && w.wikidata === lake.wikidata) || w.name === lake.name),
  );
  if (water) return waterLabel(water);
  const [lng, lat] = lake.polygons[0]?.[0]?.[0] ?? [0, 0];
  return {
    id: `lake:${lake.name}`,
    kind: 'lake',
    type: 'Lake',
    name: lake.name,
    text: lake.name,
    rank: 9,
    wikidata: lake.wikidata ?? null,
    lng,
    lat,
  };
}

/** The lead text of a place's English Wikipedia article, word for word (CC BY-SA 4.0). */
export interface WikipediaText {
  title: string;
  description?: string | null;
  extract: string;
  url: string;
  revision?: string | null;
}

/** What /geo/places.json knows about a place (tools/build_places.py): facts from Wikidata
 * (SI units) and the Wikipedia text. Every field may be missing. */
export interface PlaceFacts {
  official_name?: string;
  capital?: string;
  population?: number;
  population_year?: number | null;
  area_m2?: number;
  languages?: string[];
  currency?: string[];
  highest_point?: string;
  max_depth_m?: number;
  length_m?: number;
  countries?: string[];
  range?: string;
  prominence_m?: number;
  wikipedia?: WikipediaText;
}

export interface PlacesData {
  /** The day the facts and text were fetched (YYYY-MM-DD). */
  generated: string;
  /** By Wikidata ID. */
  places: Record<string, PlaceFacts>;
}

/** "1.43 billion", "67.4 million", "889,953". */
export function formatPopulation(people: number): string {
  if (people >= 1e9) return `${(people / 1e9).toFixed(2)} billion`;
  if (people >= 1e6) return `${(people / 1e6).toFixed(1)} million`;
  return formatter.format(Math.round(people));
}

const metres = (m: number): string => `${formatter.format(Math.round(m))} m`;

/** The facts shown on a place's card, as [label, value] rows in a fixed order. */
export function factRows(
  label: Pick<MapLabel, 'kind' | 'elevation'>,
  facts: PlaceFacts | undefined,
): [string, string][] {
  const f = facts ?? {};
  const rows: [string, string][] = [];
  const add = (name: string, value: string | undefined | null | false): void => {
    if (value) rows.push([name, value]);
  };
  const list = (values: string[] | undefined): string | undefined =>
    values && values.length ? values.join(', ') : undefined;
  const area = f.area_m2 ? `${formatter.format(Math.round(f.area_m2 / 1e6))} km²` : undefined;
  if (label.kind === 'country') {
    add('Official name', f.official_name);
    add('Capital', f.capital);
    add(
      'Population',
      f.population
        ? `${formatPopulation(f.population)}${f.population_year ? ` (${f.population_year})` : ''}`
        : undefined,
    );
    add('Area', area);
    add(
      f.languages && f.languages.length > 1 ? 'Official languages' : 'Official language',
      list(f.languages),
    );
    add('Currency', list(f.currency));
    add('Highest point', f.highest_point);
  } else if (label.kind === 'ocean' || label.kind === 'sea') {
    add('Area', area);
    add('Greatest depth', f.max_depth_m ? metres(f.max_depth_m) : undefined);
    add('Bordering countries', list(f.countries));
  } else if (label.kind === 'lake') {
    add('Area', area);
    add('Greatest depth', f.max_depth_m ? metres(f.max_depth_m) : undefined);
    add('Countries', list(f.countries));
  } else if (label.kind === 'river') {
    add('Length', f.length_m ? `${formatter.format(Math.round(f.length_m / 1000))} km` : undefined);
    add('Countries', list(f.countries));
  } else if (label.kind === 'peak') {
    add('Elevation', label.elevation ? metres(label.elevation) : undefined);
    add('Prominence', f.prominence_m ? metres(f.prominence_m) : undefined);
    add('Range', f.range);
    add('Countries', list(f.countries));
  } else {
    add('Highest point', f.highest_point);
    add('Length', f.length_m ? `${formatter.format(Math.round(f.length_m / 1000))} km` : undefined);
    add('Area', area);
    add('Countries', list(f.countries));
  }
  return rows;
}
