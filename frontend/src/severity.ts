/**
 * How each severity level looks on the globe. Colours are the Okabe-Ito palette from
 * docs/severity.md (a test keeps the docs, this file, style.css and the pipeline in step).
 * Size and pulse also grow with severity, so colour is never the only signal.
 */

import type { Severity } from './types';

export interface SeverityStyle {
  label: string;
  color: string;
  /** Relative size of the light: 1 for low. */
  size: number;
  /** Seconds per pulse, or null for no pulse. */
  pulseSeconds: number | null;
  /** Whether outward rings are drawn around the light. */
  rings: boolean;
}

export const SEVERITY_STYLES: Record<Severity, SeverityStyle> = {
  low: { label: 'Low', color: '#56B4E9', size: 1, pulseSeconds: null, rings: false },
  moderate: { label: 'Moderate', color: '#F0E442', size: 1.35, pulseSeconds: 2.4, rings: false },
  high: { label: 'High', color: '#E69F00', size: 1.75, pulseSeconds: 1.5, rings: true },
  critical: { label: 'Critical', color: '#D55E00', size: 2.2, pulseSeconds: 0.9, rings: true },
};

/** How much a pulse enlarges a light at its peak. */
export const PULSE_AMOUNT = 0.22;

/**
 * The size multiplier of a light at `seconds` into the animation: 1 when it does not pulse
 * (low severity, or reduced motion), otherwise swinging between 1 and 1 + PULSE_AMOUNT.
 */
export function pulseScale(severity: Severity, seconds: number, reducedMotion: boolean): number {
  const period = SEVERITY_STYLES[severity].pulseSeconds;
  if (period === null || reducedMotion) return 1;
  return 1 + PULSE_AMOUNT * (0.5 + 0.5 * Math.sin((2 * Math.PI * seconds) / period));
}
