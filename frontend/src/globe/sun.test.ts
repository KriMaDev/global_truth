import { describe, expect, it } from 'vitest';
import { sunPosition } from './sun';

// Reference moments from the U.S. Naval Observatory / timeanddate.com for 2024.
describe('sunPosition', () => {
  it('puts the sun over the equator at the March equinox', () => {
    expect(Math.abs(sunPosition(new Date('2024-03-20T03:06:00Z')).lat)).toBeLessThan(0.05);
  });

  it('puts the sun over the Tropic of Cancer at the June solstice', () => {
    expect(sunPosition(new Date('2024-06-20T20:51:00Z')).lat).toBeCloseTo(23.44, 1);
  });

  it('puts the sun over the Tropic of Capricorn at the December solstice', () => {
    expect(sunPosition(new Date('2024-12-21T09:20:00Z')).lat).toBeCloseTo(-23.44, 1);
  });

  it('follows the equation of time: early in November the sun is west of Greenwich at noon', () => {
    // Sundials run about 16.4 minutes fast on 3 November: 16.4 / 4 = 4.1 degrees west.
    expect(sunPosition(new Date('2024-11-03T12:00:00Z')).lng).toBeCloseTo(-4.1, 0);
  });

  it('follows the equation of time: in mid-February the sun is east of Greenwich at noon', () => {
    // Sundials run about 14.2 minutes slow on 11 February: 3.55 degrees east.
    expect(sunPosition(new Date('2024-02-11T12:00:00Z')).lng).toBeCloseTo(3.55, 0);
  });

  it('moves 15 degrees west every hour', () => {
    const a = sunPosition(new Date('2024-05-01T06:00:00Z')).lng;
    const b = sunPosition(new Date('2024-05-01T07:00:00Z')).lng;
    expect(a - b).toBeCloseTo(15, 1);
  });

  it('keeps longitudes between -180 and 180', () => {
    for (let hour = 0; hour < 24; hour++) {
      const { lng } = sunPosition(new Date(Date.UTC(2026, 10, 7, hour)));
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThan(180);
    }
  });
});
