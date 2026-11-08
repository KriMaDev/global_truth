import { describe, expect, it } from 'vitest';
import { placeAltitude, placeCenter, placeNames, placeOptions } from './places';
import type { EventGeo, GlobeEvent } from './types';

function event(id: string, lat: number, lng: number, geo: Partial<EventGeo>): GlobeEvent {
  return {
    id,
    title: id,
    snippet: '',
    place: '',
    lat,
    lng,
    severity: 'low',
    categories: ['politics'],
    kind: 'news',
    published: '2026-11-08T10:00:00Z',
    sources: [{ name: 'Outlet', url: 'https://example.com/' + id }],
    geo: {
      continent: null,
      region: null,
      country: null,
      country_code: null,
      admin1: null,
      city: null,
      precision: 'city',
      ...geo,
    },
  };
}

const INDIA = { continent: 'Asia', region: 'Southern Asia', country: 'India', country_code: 'IN' };
const events = [
  event('a', 17.4, 78.5, { ...INDIA, admin1: 'Telangana', city: 'Hyderabad' }),
  event('b', 18.0, 79.6, { ...INDIA, admin1: 'Telangana', city: 'Warangal' }),
  event('c', 28.6, 77.2, { ...INDIA, admin1: 'Delhi', city: 'New Delhi' }),
  event('d', 33.7, 73.1, {
    continent: 'Asia',
    region: 'Southern Asia',
    country: 'Pakistan',
    country_code: 'PK',
  }),
  event('e', 50.8, 4.4, {
    continent: 'Europe',
    region: 'Western Europe',
    country: 'Belgium',
    country_code: 'BE',
  }),
  { ...event('f', 0, 0, {}), geo: undefined },
];

describe('placeOptions', () => {
  it('lists continents with counts, most events first', () => {
    expect(placeOptions(events, [])).toEqual([
      { value: 'Asia', label: 'Asia', count: 4 },
      { value: 'Europe', label: 'Europe', count: 1 },
    ]);
  });

  it('shows country names but keeps codes as values', () => {
    expect(placeOptions(events, ['Asia', 'Southern Asia'])).toEqual([
      { value: 'IN', label: 'India', count: 3 },
      { value: 'PK', label: 'Pakistan', count: 1 },
    ]);
  });

  it('goes down to cities, skipping events without that level', () => {
    expect(
      placeOptions(events, ['Asia', 'Southern Asia', 'IN', 'Telangana']).map((o) => o.value),
    ).toEqual(['Hyderabad', 'Warangal']);
    expect(placeOptions(events, ['Asia', 'Southern Asia', 'PK'])).toEqual([]);
  });
});

describe('placeNames', () => {
  it('names each step', () => {
    expect(placeNames(events, ['Asia', 'Southern Asia', 'IN'])).toEqual([
      'Asia',
      'Southern Asia',
      'India',
    ]);
  });
});

describe('placeCenter', () => {
  it("averages a place's events on the sphere", () => {
    const center = placeCenter(events, ['Asia', 'Southern Asia', 'IN', 'Telangana']);
    expect(center?.lat).toBeCloseTo(17.7, 0);
    expect(center?.lng).toBeCloseTo(79.05, 0);
    expect(placeCenter(events, ['Oceania'])).toBeNull();
  });
});

describe('placeAltitude', () => {
  it('comes closer at each level', () => {
    const heights = [0, 1, 2, 3, 4, 5].map(placeAltitude);
    expect([...heights].sort((a, b) => b - a)).toEqual(heights);
  });
});
