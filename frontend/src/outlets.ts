/**
 * Who reported an event: each outlet's country and ownership, and each data provider's credit
 * line, from /data/outlets.json (written by the pipeline from its outlet allowlist,
 * pipeline/globe_pipeline/outlets.py). The card works without it (names and links only).
 */

import type { EventSource, GlobeEvent } from './types';

export interface OutletInfo {
  name: string;
  slug: string;
  domain: string;
  country: string;
  region: string;
  ownership: 'state' | 'public' | 'private' | 'intergovernmental';
  ownership_label: string;
  /** Events it reports in the published 7 days. */
  events: number;
}

export interface ProviderInfo {
  /** The source name on events ("USGS"). */
  name: string;
  /** The credit the provider asks for ("U.S. Geological Survey"). */
  credit: string;
  homepage: string;
}

export interface OutletDirectory {
  outlets: Map<string, OutletInfo>;
  providers: Map<string, ProviderInfo>;
}

/** Where the outlet table is (each row has the id "outlet-<slug>"). */
export const OUTLET_TABLE = '/sources/';

const OWNERSHIPS = ['state', 'public', 'private', 'intergovernmental'];

function isText(value: unknown, max = 200): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isOutlet(value: unknown): value is OutletInfo {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    isText(o.name) &&
    isText(o.slug) &&
    /^[a-z0-9-]+$/.test(o.slug as string) &&
    isText(o.domain) &&
    isText(o.country) &&
    isText(o.region) &&
    OWNERSHIPS.includes(o.ownership as string) &&
    isText(o.ownership_label) &&
    Number.isInteger(o.events)
  );
}

function isProvider(value: unknown): value is ProviderInfo {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    isText(p.name) &&
    isText(p.credit) &&
    isText(p.homepage, 500) &&
    /^https:\/\//.test(p.homepage as string)
  );
}

/** The directory from untrusted JSON; malformed entries are left out. */
export function parseOutletDirectory(input: unknown): OutletDirectory {
  const doc = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const outlets = Array.isArray(doc.outlets) ? doc.outlets.filter(isOutlet) : [];
  const providers = Array.isArray(doc.providers) ? doc.providers.filter(isProvider) : [];
  return {
    outlets: new Map(outlets.map((o) => [o.name, o])),
    providers: new Map(providers.map((p) => [p.name, p])),
  };
}

let directory: OutletDirectory | null = null;

export function setOutletDirectory(value: OutletDirectory | null): void {
  directory = value;
}

/** What the card shows under a source's name, e.g. "United Kingdom · Public" with a link to
 * the outlet's row, or a data provider's credit line. Null when nothing is known. */
export function sourceDetails(
  source: EventSource,
  dir: OutletDirectory | null = directory,
): { text: string; href: string | null } | null {
  const outlet = dir?.outlets.get(source.name);
  if (outlet) {
    // "State-affiliated" has its own badge on the card; don't say it twice.
    const ownership = outlet.ownership === 'state' ? null : outlet.ownership_label;
    return {
      text: [outlet.country, ownership].filter(Boolean).join(' · '),
      href: `${OUTLET_TABLE}#outlet-${outlet.slug}`,
    };
  }
  const provider = dir?.providers.get(source.name);
  if (provider) return { text: `Data: ${provider.credit}`, href: provider.homepage };
  return null;
}

/** The sources heading: "Source", "Reported by 2 outlets", or "Reported by 3 outlets in 3
 * countries" when their countries are known. */
export function coverageHeading(
  event: Pick<GlobeEvent, 'sources' | 'coverage'>,
  dir: OutletDirectory | null = directory,
): string {
  const names = [...new Set(event.sources.map((s) => s.name))];
  const count = event.coverage ?? names.length;
  if (count <= 1) return 'Source';
  const countries = new Set(names.map((name) => dir?.outlets.get(name)?.country).filter(Boolean));
  const known = names.every((name) => dir?.outlets.has(name));
  const what = event.sources.every((s) => dir?.providers.has(s.name)) ? 'providers' : 'outlets';
  if (!known || countries.size === 0) return `Reported by ${count} ${what}`;
  return `Reported by ${count} ${what} in ${countries.size} ${countries.size === 1 ? 'country' : 'countries'}`;
}
