import { describe, expect, it } from 'vitest';
import type { GlobeEvent } from '../types';
import { countLine, rowMeta, sourceSummary } from './news-panel';

const outlet = (name: string) => ({ name, url: 'https://example.com/story' });

const news: GlobeEvent = {
  id: 'n-1',
  title: 'A headline',
  snippet: '',
  place: 'Sofia, Bulgaria',
  lat: 42.7,
  lng: 23.3,
  severity: 'high',
  categories: ['politics'],
  kind: 'news',
  published: '2026-11-07T10:00:00Z',
  sources: [outlet('Example News'), outlet('Other Paper'), outlet('Third Wire')],
  coverage: 3,
};

describe('countLine', () => {
  it('names the place, widest first', () => {
    expect(countLine(142, ['Europe', 'Belgium'])).toBe('142 events · Europe › Belgium');
  });

  it('says one event and the whole world', () => {
    expect(countLine(1, [])).toBe('1 event · Whole world');
  });
});

describe('sourceSummary', () => {
  it('names the first outlet and counts the others', () => {
    expect(sourceSummary(news)).toBe('Example News +2 more');
  });

  it('names a single outlet alone', () => {
    expect(sourceSummary({ sources: [outlet('Example News')], coverage: 1 })).toBe('Example News');
  });

  it('counts different outlets when coverage is missing', () => {
    expect(sourceSummary({ sources: [outlet('A'), outlet('A'), outlet('B')] })).toBe('A +1 more');
  });

  it('is empty without sources (sample data)', () => {
    expect(sourceSummary({ sources: [] })).toBeNull();
  });
});

describe('rowMeta', () => {
  it('says severity in words, kind and source', () => {
    expect(rowMeta(news)).toBe('High · News report · Example News +2 more');
  });

  it('leads with the disaster type', () => {
    const quake: GlobeEvent = {
      ...news,
      kind: 'data-feed',
      hazard: 'EQ',
      sources: [outlet('USGS')],
      coverage: 1,
    };
    expect(rowMeta(quake)).toBe('Earthquake · High · Data feed · USGS');
  });
});
