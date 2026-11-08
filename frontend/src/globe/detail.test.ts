import { describe, expect, it } from 'vitest';
import {
  MAX_LEVEL,
  MIN_LEVEL,
  coverWindow,
  uvWithin,
  levelFor,
  screenKmPerPixel,
  tileDegrees,
  tileKmPerPixel,
  tileUrl,
  tileWindow,
  viewHalfHeight,
  windowBounds,
} from './detail';

describe('GIBS tile grid', () => {
  it('halves the tile size at each level, 0.49 km per pixel at level 7', () => {
    expect([4, 5, 6, 7].map(tileDegrees)).toEqual([18, 9, 4.5, 2.25]);
    expect(tileKmPerPixel(7)).toBeCloseTo(0.49, 2);
  });

  it('picks the coarsest level still as sharp as the screen', () => {
    expect(levelFor(10)).toBe(MIN_LEVEL);
    expect(levelFor(1.5)).toBe(6);
    expect(levelFor(0.1)).toBe(MAX_LEVEL);
  });

  it('sees about 900 km across at altitude 0.15', () => {
    expect(screenKmPerPixel(0.15, 50, 900) * 900).toBeCloseTo(891, -1);
    expect(viewHalfHeight(0.15, 50)).toBeCloseTo(4.0, 1);
  });
});

describe('tileWindow', () => {
  it('covers the view around a point, snapped to tiles', () => {
    const w = tileWindow(48.85, 2.35, 4, 1.6, 7, 6)!;
    const b = windowBounds(w);
    expect(b.north).toBeGreaterThan(48.85);
    expect(b.south).toBeLessThan(48.85);
    expect(b.west).toBeLessThan(2.35);
    expect(b.east).toBeGreaterThan(2.35);
    expect(w.row1 - w.row0 + 1).toBeLessThanOrEqual(6);
    expect(w.col1 - w.col0 + 1).toBeLessThanOrEqual(6);
  });

  it('drops a level when the view needs too many tiles', () => {
    const w = tileWindow(0, 0, 4, 1.6, 7, 4)!;
    expect(w.level).toBeLessThan(7);
    expect(w.col1 - w.col0 + 1).toBeLessThanOrEqual(4);
  });

  it("leaves very wide views to the globe's own images", () => {
    expect(tileWindow(20, 0, 30, 1.6, 4, 6)).toBeNull();
  });

  it('stays inside the poles', () => {
    const w = tileWindow(89, 0, 0.5, 1, 4, 6)!;
    expect(w.row0).toBe(0);
    expect(windowBounds(w).north).toBe(90);
  });

  it('runs past the date line, and wraps the tile addresses', () => {
    const w = tileWindow(0, 179, 3, 1, 7, 6)!;
    expect(windowBounds(w).east).toBeGreaterThan(180);
    expect(tileUrl('day', 7, 40, 160)).toBe(tileUrl('day', 7, 40, 0));
    expect(tileUrl('day', 7, 40, -1)).toMatch(/\/7\/40\/159\.jpeg$/);
  });

  it('addresses GIBS tiles', () => {
    expect(tileUrl('night', 6, 20, 70)).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_Black_Marble/default/default/500m/6/20/70.png',
    );
  });
});

describe('the coarser night image', () => {
  it('covers the day window with level-6 tiles', () => {
    const day = tileWindow(28.6, 77.2, 4, 1.6, 7, 6)!;
    const area = windowBounds(day);
    const night = windowBounds(coverWindow(area, 6));
    expect(night.west).toBeLessThanOrEqual(area.west);
    expect(night.east).toBeGreaterThanOrEqual(area.east);
    expect(night.south).toBeLessThanOrEqual(area.south);
    expect(night.north).toBeGreaterThanOrEqual(area.north);
  });

  it('places the patch inside it', () => {
    const box = uvWithin(
      { west: 2, east: 4, south: 10, north: 12 },
      { west: 0, east: 8, south: 8, north: 16 },
    );
    expect(box).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
});
