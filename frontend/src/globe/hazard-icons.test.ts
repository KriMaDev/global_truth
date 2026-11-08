import { describe, expect, it } from 'vitest';
import { HAZARD_LABELS } from '../types';
import {
  ATLAS_COLUMNS,
  ATLAS_ROWS,
  GENERIC_CODE,
  HAZARD_ICONS,
  iconIndex,
  isDisaster,
} from './hazard-icons';

describe('disaster symbols', () => {
  it('has one symbol per disaster type, plus a general warning sign', () => {
    const codes = HAZARD_ICONS.map((icon) => icon.code);
    expect(codes).toEqual([...Object.keys(HAZARD_LABELS), GENERIC_CODE]);
    expect(new Set(HAZARD_ICONS.map((icon) => icon.shapes)).size).toBe(HAZARD_ICONS.length);
  });

  it('gives every symbol a main and an accent part', () => {
    for (const icon of HAZARD_ICONS) {
      const layers = new Set(icon.shapes.map((shape) => shape.layer));
      expect(layers, icon.code).toEqual(new Set(['main', 'accent']));
      for (const shape of icon.shapes)
        expect(Boolean(shape.d) !== Boolean(shape.circle), icon.code).toBe(true);
    }
  });

  it('fits every symbol in the atlas', () => {
    expect(ATLAS_COLUMNS * ATLAS_ROWS).toBeGreaterThanOrEqual(HAZARD_ICONS.length);
  });

  it('draws natural disasters as symbols and everything else as pillars', () => {
    expect(isDisaster({ categories: ['natural-disasters', 'politics'] })).toBe(true);
    expect(isDisaster({ categories: ['politics'] })).toBe(false);
    expect(iconIndex({ categories: ['natural-disasters'], hazard: 'EQ' })).toBe(0);
    expect(iconIndex({ categories: ['natural-disasters'], hazard: 'ST' })).toBe(
      HAZARD_ICONS.findIndex((icon) => icon.code === 'ST'),
    );
    // Unknown or missing type: the general warning sign.
    expect(iconIndex({ categories: ['natural-disasters'], hazard: null })).toBe(
      HAZARD_ICONS.length - 1,
    );
    expect(iconIndex({ categories: ['natural-disasters'], hazard: 'XX' })).toBe(
      HAZARD_ICONS.length - 1,
    );
    expect(iconIndex({ categories: ['war'], hazard: 'EQ' })).toBeNull();
  });
});
