import { describe, expect, it } from 'vitest';
import {
  angularDistance,
  clusterDegrees,
  clusterEvents,
  clusterOf,
  fanOut,
  type Cluster,
} from './clusters';
import type { GlobeEvent, Severity } from './types';

function event(
  id: string,
  lat: number,
  lng: number,
  severity: Severity = 'low',
  published = '2026-11-07T10:00:00Z',
): GlobeEvent {
  return {
    id,
    title: `Event ${id}`,
    snippet: '',
    place: 'Somewhere',
    lat,
    lng,
    severity,
    categories: ['politics'],
    kind: 'news',
    published,
    sources: [{ name: 'Outlet', url: 'https://example.com/' + id }],
  };
}

describe('clusterDegrees', () => {
  it('groups less as the camera comes closer', () => {
    expect([3, 2, 1.6, 1.4, 1.2, 1, 0.9, 0.5].map(clusterDegrees)).toEqual([
      4, 4, 2, 2, 1, 1, 0, 0,
    ]);
  });
});

describe('angularDistance', () => {
  it('measures degrees on the globe', () => {
    expect(angularDistance(0, 0, 0, 10)).toBeCloseTo(10, 5);
    expect(angularDistance(0, 179, 0, -179)).toBeCloseTo(2, 5);
  });
});

describe('clusterEvents', () => {
  const hyderabad = event('hyd', 17.38, 78.48);
  const warangal = event('war', 17.97, 79.6, 'moderate');
  const vizag = event('viz', 17.69, 83.22);
  const tokyo = event('tok', 35.68, 139.69);

  it('groups nearby events behind the most severe one', () => {
    const clusters = clusterEvents([hyderabad, warangal, vizag, tokyo], 2);
    const india = clusters.find((c) => c.events.length === 2);
    expect(india?.lead.id).toBe('war');
    expect(india?.id).toBe('group:war');
    expect(india?.severity).toBe('moderate');
    expect([india?.lat, india?.lng]).toEqual([warangal.lat, warangal.lng]);
    expect(clusters).toHaveLength(3); // the India pair, Visakhapatnam, Tokyo
  });

  it('groups more from far away', () => {
    expect(clusterEvents([hyderabad, warangal, vizag, tokyo], 4)).toHaveLength(2);
  });

  it('does not group when zoomed right in', () => {
    const clusters = clusterEvents([hyderabad, warangal], 0);
    expect(clusters.map((c) => c.id)).toEqual(['war', 'hyd']);
  });

  it('groups across the date line', () => {
    expect(clusterEvents([event('a', -17, 179.5), event('b', -17, -179.5)], 2)).toHaveLength(1);
  });

  it('does not depend on input order', () => {
    const a = clusterEvents([hyderabad, warangal, vizag, tokyo], 2).map((c) => c.id);
    const b = clusterEvents([tokyo, vizag, warangal, hyderabad], 2).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('never groups a natural disaster with other news', () => {
    const quake = {
      ...event('quake', 17.4, 78.5, 'high'),
      categories: ['natural-disasters' as const],
      hazard: 'EQ',
    };
    const flood = {
      ...event('flood', 17.9, 79.6),
      categories: ['natural-disasters' as const],
      hazard: 'FL',
    };
    const clusters = clusterEvents([hyderabad, warangal, quake, flood], 4);
    expect(clusters).toHaveLength(2);
    const disasters = clusters.find((c) => c.lead.id === 'quake');
    expect(disasters?.events.map((e) => e.id).sort()).toEqual(['flood', 'quake']);
    const news = clusters.find((c) => c !== disasters);
    expect(news?.events.every((e) => !e.categories.includes('natural-disasters'))).toBe(true);
    // Still most severe first overall.
    expect(clusters[0].lead.id).toBe('quake');
  });

  it('finds the group an event belongs to', () => {
    const clusters = clusterEvents([hyderabad, warangal, tokyo], 2);
    expect(clusterOf(clusters, 'hyd')?.id).toBe('group:war');
    expect(clusterOf(clusters, 'tok')?.id).toBe('tok');
  });
});

describe('fanOut', () => {
  const marker = (id: string, lat: number, lng: number): Cluster =>
    ({ id, lead: { id }, events: [{ id }], lat, lng, severity: 'low' }) as unknown as Cluster;

  it('moves markers at the same place apart, each remembering its true place', () => {
    const out = fanOut([marker('a', 40, 10), marker('b', 40, 10), marker('c', 40, 10)], 1);
    expect(out.every((c) => c.anchor?.lat === 40 && c.anchor?.lng === 10)).toBe(true);
    for (const [i, a] of out.entries()) {
      for (const b of out.slice(i + 1)) {
        expect(angularDistance(a.lat, a.lng, b.lat, b.lng)).toBeGreaterThanOrEqual(0.99);
      }
    }
  });

  it('leaves markers with room where they are', () => {
    const out = fanOut([marker('a', 40, 10), marker('b', 45, 10)], 1);
    expect(out.map((c) => [c.lat, c.lng, c.anchor])).toEqual([
      [40, 10, undefined],
      [45, 10, undefined],
    ]);
  });

  it('keeps many markers apart in more than one ring', () => {
    const out = fanOut(
      Array.from({ length: 20 }, (_, i) => marker(String(i), 0, 0)),
      1,
    );
    expect(new Set(out.map((c) => `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`)).size).toBe(20);
    expect(out).toHaveLength(20);
  });

  it('does nothing with a spacing of 0', () => {
    const clusters = [marker('a', 40, 10), marker('b', 40, 10)];
    expect(fanOut(clusters, 0)).toBe(clusters);
  });
});
