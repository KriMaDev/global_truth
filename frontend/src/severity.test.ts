import { describe, expect, it } from 'vitest';
import severityDocs from '../../docs/severity.md?raw';
import { PULSE_AMOUNT, pulseScale, SEVERITY_STYLES } from './severity';
import { SEVERITIES } from './types';

describe('severity styles', () => {
  it('has a style for every level, and only those', () => {
    expect(Object.keys(SEVERITY_STYLES).sort()).toEqual([...SEVERITIES].sort());
  });

  // style.css is checked against the same palette by pipeline/tests/test_severity.py.
  it('uses the colours documented in docs/severity.md', () => {
    for (const level of SEVERITIES) {
      expect(severityDocs.toLowerCase()).toContain(SEVERITY_STYLES[level].color.toLowerCase());
    }
  });

  it('grows in size with severity, so colour is never the only signal', () => {
    const sizes = SEVERITIES.map((level) => SEVERITY_STYLES[level].size);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it('pulses faster with severity, matching the docs: none, slow, medium, fast', () => {
    const [low, ...others] = SEVERITIES.map((level) => SEVERITY_STYLES[level].pulseSeconds);
    expect(low).toBeNull();
    const speeds = others as number[];
    expect([...speeds].sort((a, b) => b - a)).toEqual(speeds);
    expect(new Set(speeds).size).toBe(3);
  });

  it('draws rings for high and critical only', () => {
    expect(SEVERITIES.filter((level) => SEVERITY_STYLES[level].rings)).toEqual([
      'high',
      'critical',
    ]);
  });
});

describe('pulseScale', () => {
  it('never pulses a low event', () => {
    for (let t = 0; t < 5; t += 0.25) expect(pulseScale('low', t, false)).toBe(1);
  });

  it('stays still with reduced motion', () => {
    for (const level of SEVERITIES) expect(pulseScale(level, 0.4, true)).toBe(1);
  });

  it('swings between 1 and 1 + PULSE_AMOUNT', () => {
    for (let t = 0; t < 3; t += 0.05) {
      const scale = pulseScale('critical', t, false);
      expect(scale).toBeGreaterThanOrEqual(1);
      expect(scale).toBeLessThanOrEqual(1 + PULSE_AMOUNT + 1e-9);
    }
  });
});
