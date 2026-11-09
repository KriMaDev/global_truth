import { describe, expect, it } from 'vitest';
import {
  angularDegrees,
  countryCounts,
  countrySeverity,
  factRows,
  formatPopulation,
  labelLevel,
  labelPriority,
  labelsFor,
  labelsInView,
  lakeLabel,
  screenRadiusDegrees,
  flyTiltDegrees,
  type GeographyData,
  type MapLabel,
} from './geography';
import type { GlobeEvent, Severity } from './types';

function event(id: string, code: string | null, severity: Severity): GlobeEvent {
  return {
    id,
    title: id,
    snippet: '',
    place: '',
    lat: 0,
    lng: 0,
    severity,
    categories: ['war'],
    kind: 'news',
    published: '2026-11-08T10:00:00Z',
    sources: [{ name: 'Outlet', url: 'https://example.com/' + id }],
    geo: {
      continent: null,
      region: null,
      country: null,
      country_code: code,
      admin1: null,
      city: null,
      precision: 'country',
    },
  };
}

describe('labelsInView', () => {
  const label = (id: string, lat: number, lng: number, rank: number): MapLabel => ({
    id,
    kind: 'country',
    type: 'Country',
    name: id,
    text: id,
    rank,
    wikidata: null,
    lat,
    lng,
  });

  it('leaves out labels on the far side of the globe', () => {
    const seen = labelsInView(
      [label('near', 10, 10, 2), label('far', -10, -170, 2)],
      0,
      0,
      0.5,
      10,
    );
    expect(seen.map((l) => l.id)).toEqual(['near']);
  });

  it('keeps the most important when there are too many', () => {
    const seen = labelsInView(
      [label('minor', 0, 1, 7), label('major', 0, 2, 2), label('middle', 0, 3, 4)],
      0,
      0,
      1,
      2,
    );
    expect(seen.map((l) => l.id)).toEqual(['major', 'middle']);
  });

  it('leaves out what cannot come into view, even when it is more important', () => {
    const seen = labelsInView(
      [label('off-screen major', 0, 30, 2), label('on-screen minor', 0, 1, 7)],
      0,
      0,
      0.3,
      1,
    );
    expect(seen.map((l) => l.id)).toEqual(['on-screen minor']);
  });

  it('keeps room for rivers and mountains among many country names', () => {
    const seas = Array.from({ length: 20 }, (_, i): MapLabel => ({
      ...label(`s${i}`, 0, i * 0.1, 2),
      kind: 'sea',
    }));
    const river: MapLabel = { ...label('river', 1, 1, 7), kind: 'river' };
    const peak: MapLabel = { ...label('peak', 2, 1, 7), kind: 'peak' };
    const seen = labelsInView([...seas, river, peak], 0, 0, 0.3, 10);
    expect(seen).toHaveLength(10);
    expect(seen.map((l) => l.id)).toEqual(expect.arrayContaining(['river', 'peak']));
  });

  it('always takes countries and capitals before rivers and peaks', () => {
    const river = (i: number): MapLabel => ({ ...label(`r${i}`, 0, i * 0.1, 3), kind: 'river' });
    const capital: MapLabel = { ...label('capital', 1, 1, 0), kind: 'capital' };
    const seen = labelsInView(
      [...Array.from({ length: 20 }, (_, i) => river(i)), label('country', 2, 2, 7), capital],
      0,
      0,
      0.3,
      5,
    );
    expect(
      seen
        .map((l) => l.id)
        .slice(0, 2)
        .sort(),
    ).toEqual(['capital', 'country']);
    expect(seen).toHaveLength(5);
  });

  it('reaches further on a wide screen, and never past the horizon', () => {
    expect(screenRadiusDegrees(0.4, 2)).toBeGreaterThan(screenRadiusDegrees(0.4, 0.5));
    expect(screenRadiusDegrees(4, 1)).toBeCloseTo((Math.acos(1 / 5) * 180) / Math.PI);
  });

  it('looks only slightly south of an event when close up, and as before from far away', () => {
    expect(flyTiltDegrees(22, 0.2)).toBeLessThan(5);
    expect(flyTiltDegrees(22, 1.6)).toBe(22);
  });

  it('measures across the date line', () => {
    expect(angularDegrees(0, 179, 0, -179)).toBeCloseTo(2);
  });
});

describe('countrySeverity', () => {
  it('colours each country by its most severe event', () => {
    const map = countrySeverity([
      event('a', 'UA', 'low'),
      event('b', 'UA', 'high'),
      event('c', 'UA', 'moderate'),
      event('d', 'JP', 'low'),
      event('e', null, 'critical'),
    ]);
    expect(Object.fromEntries(map)).toEqual({ UA: 'high', JP: 'low' });
  });

  it("counts a country's events by severity", () => {
    expect(countryCounts([event('a', 'UA', 'low'), event('b', 'UA', 'high')], 'UA')).toEqual({
      low: 1,
      moderate: 0,
      high: 1,
      critical: 0,
    });
  });
});

const data: GeographyData = {
  countries: [
    {
      iso2: 'RU',
      name: 'Russia',
      continent: 'Europe',
      region: 'Eastern Europe',
      label: [44, 58],
      rank: 2,
      polygons: [],
    },
    {
      iso2: 'LU',
      name: 'Luxembourg',
      continent: 'Europe',
      region: 'Western Europe',
      label: [6, 49.7],
      rank: 6,
      polygons: [],
    },
  ],
  labels: {
    seas: [
      { name: 'INDIAN OCEAN', kind: 'ocean', rank: 0, at: [82, -33] },
      { name: 'Gulf of Aden', kind: 'gulf', rank: 3, at: [48, 12] },
    ],
    regions: [{ name: 'HIMALAYAS', kind: 'range', rank: 1, at: [85, 28] }],
    peaks: [
      { name: 'Mount Everest', elevation: 8848, rank: 1, at: [86.9, 27.98] },
      { name: 'Small Hill', elevation: 1200, rank: 9, at: [0, 0] },
    ],
    waters: [
      { name: 'Danube', kind: 'river', rank: 3, at: [20, 45] },
      { name: 'Lake Baikal', kind: 'lake', rank: 3, wikidata: 'Q5513', at: [108, 53.5] },
      { name: 'Small Creek', kind: 'river', rank: 7, at: [1, 1] },
    ],
    capitals: [
      { name: 'Capitalville', rank: 0, wikidata: 'Q1', at: [5, 50] },
      { name: 'Contested City', rank: 0, wikidata: 'Q2', at: [6, 51], disputed: true },
    ],
    states: [{ name: 'Teststate', rank: 1, wikidata: 'Q3', at: [-100, 40] }],
    stateCapitals: [{ name: 'Statetown', rank: 2, wikidata: 'Q4', at: [-99, 41] }],
  },
  lakes: [
    {
      name: 'Lake Baikal',
      wikidata: 'Q5513',
      polygons: [
        [
          [
            [104, 51],
            [110, 56],
            [109, 55],
            [104, 51],
          ],
        ],
      ],
    },
  ],
};

describe('labelsFor', () => {
  it('keeps the Geography map to countries, seas, oceans and capitals', () => {
    const kinds = new Set(labelsFor(0.3, data, 'geo').map((l) => l.kind));
    for (const kind of ['river', 'lake', 'peak', 'range']) expect(kinds).not.toContain(kind);
    expect(kinds).toContain('capital');
    expect(labelsFor(0.3, data, 'geo').map((l) => l.text)).not.toContain('Gulf of Aden');
  });

  it('gives the Atlas everything, with capitals', () => {
    const kinds = new Set(labelsFor(0.3, data, 'atlas').map((l) => l.kind));
    for (const kind of ['river', 'lake', 'peak', 'range', 'capital']) expect(kinds).toContain(kind);
  });

  it('shows US states closer in, and their capitals closer still', () => {
    const texts = (altitude: number) => labelsFor(altitude, data, 'geo').map((l) => l.text);
    expect(texts(1.2)).not.toContain('Teststate');
    expect(texts(0.8)).toContain('Teststate');
    expect(texts(0.8)).not.toContain('Statetown');
    expect(texts(0.3)).toContain('Statetown');
  });

  it('shows capitals only once zoomed in', () => {
    expect(labelsFor(2, data, 'geo').some((l) => l.kind === 'capital')).toBe(false);
    expect(labelsFor(1.2, data, 'geo').some((l) => l.kind === 'capital')).toBe(true);
  });

  it('shows a capital whose status is disputed as a plain city', () => {
    const label = labelsFor(0.3, data, 'geo').find((l) => l.text === 'Contested City');
    expect(label?.kind).toBe('city');
    expect(label?.type).toBe('City');
  });

  it('shows only the most important from far away', () => {
    expect(labelsFor(2.4, data).map((l) => l.text)).toEqual([
      'Russia',
      'Indian Ocean',
      'Himalayas',
      'Mount Everest 8,848 m',
    ]);
  });

  it('adds smaller places when zooming in', () => {
    const close = labelsFor(0.6, data).map((l) => l.text);
    expect(close).toContain('Luxembourg');
    expect(close).toContain('Gulf of Aden');
    expect(close).not.toContain('Small Hill 1,200 m');
  });

  it('shows no rivers or lakes from far away, the largest first when zooming in', () => {
    expect(labelsFor(2.4, data).some((l) => l.kind === 'river' || l.kind === 'lake')).toBe(false);
    const middle = labelsFor(1.5, data).map((l) => l.text);
    expect(middle).toContain('Danube');
    expect(middle).toContain('Lake Baikal');
    expect(middle).not.toContain('Small Creek');
    expect(labelsFor(0.3, data).map((l) => l.text)).toContain('Small Creek');
  });

  it("finds a lake shape's label (for its card)", () => {
    const label = lakeLabel(data.lakes[0], data);
    expect(label).toMatchObject({
      kind: 'lake',
      type: 'Lake',
      name: 'Lake Baikal',
      wikidata: 'Q5513',
      lat: 53.5,
    });
  });

  it('has five zoom levels', () => {
    expect([3, 1.5, 1.2, 0.9, 0.3].map(labelLevel)).toEqual([0, 1, 2, 3, 4]);
  });

  it('puts oceans first, then countries by rank, and peaks last', () => {
    const order = labelsFor(0.3, data)
      .sort((a, b) => labelPriority(a) - labelPriority(b))
      .map((l) => l.text);
    expect(order[0]).toBe('Indian Ocean');
    expect(order.indexOf('Russia')).toBeLessThan(order.indexOf('Luxembourg'));
    expect(order.at(-1)).toBe('Mount Everest 8,848 m');
  });
});

describe('place facts', () => {
  it("formats a country's facts in a fixed order", () => {
    const rows = factRows(
      { kind: 'country' },
      {
        capital: 'Capital City',
        population: 1_428_627_663,
        population_year: 2023,
        area_m2: 3_287_263_000_000,
        languages: ['Language A', 'Language B'],
        currency: ['Coin'],
      },
    );
    expect(rows).toEqual([
      ['Capital', 'Capital City'],
      ['Population', '1.43 billion (2023)'],
      ['Area', '3,287,263 km²'],
      ['Official languages', 'Language A, Language B'],
      ['Currency', 'Coin'],
    ]);
  });

  it('gives seas, ranges and peaks their own facts', () => {
    expect(factRows({ kind: 'sea' }, { max_depth_m: 4652.4, countries: ['A', 'B'] })).toEqual([
      ['Greatest depth', '4,652 m'],
      ['Bordering countries', 'A, B'],
    ]);
    expect(factRows({ kind: 'range' }, { length_m: 2_400_000, highest_point: 'Peak X' })).toEqual([
      ['Highest point', 'Peak X'],
      ['Length', '2,400 km'],
    ]);
    expect(factRows({ kind: 'peak', elevation: 8848 }, { prominence_m: 8848 })).toEqual([
      ['Elevation', '8,848 m'],
      ['Prominence', '8,848 m'],
    ]);
  });

  it('shows nothing it does not know', () => {
    expect(factRows({ kind: 'country' }, undefined)).toEqual([]);
    expect(factRows({ kind: 'desert' }, {})).toEqual([]);
  });

  it('writes populations readably', () => {
    expect([1_430_000_000, 67_400_000, 889_953].map(formatPopulation)).toEqual([
      '1.43 billion',
      '67.4 million',
      '889,953',
    ]);
  });
});
