/**
 * Draws fewer pixels on devices that can't keep up. Over a run of frames, if the typical frame
 * is slow, the next lower sharpness is chosen, until the device keeps up or sharpness can't drop
 * further. It never goes back up in the same visit, so the picture doesn't keep changing.
 */

/** Frames longer than this (ms) mean under about 25 frames a second. */
const SLOW_FRAME_MS = 40;
const FRAMES_PER_CHECK = 60;
/** Longer gaps are not drawing speed: the tab was hidden, or an image was being handled. */
const IGNORE_OVER_MS = 500;
const LOWEST_RATIO = 1;
const STEP = 0.75;

export class ResolutionGuard {
  private frames: number[] = [];

  constructor(private ratio: number) {}

  /** Call once per frame with its length; returns a new pixel ratio when one is needed. */
  frame(milliseconds: number): number | null {
    if (milliseconds > IGNORE_OVER_MS) return null;
    this.frames.push(milliseconds);
    if (this.frames.length < FRAMES_PER_CHECK) return null;
    const sorted = [...this.frames].sort((a, b) => a - b);
    this.frames = [];
    if (sorted[sorted.length >> 1] <= SLOW_FRAME_MS || this.ratio <= LOWEST_RATIO) return null;
    this.ratio = Math.max(LOWEST_RATIO, this.ratio * STEP);
    return this.ratio;
  }
}
