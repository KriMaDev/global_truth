/**
 * Tells a tap from a gesture. globe.gl only calls a press a drag if one single move step is over
 * a pixel, so a slow, careful pinch or drag ended as a "tap" and opened whatever lay beneath it.
 * Here a press counts as a tap only if no finger travelled far and only one finger was used.
 */
export class PressTracker {
  private readonly starts = new Map<number, [number, number]>();
  private moved = false;

  constructor(private readonly limitPx: number) {}

  down(id: number, x: number, y: number): void {
    if (this.starts.has(id)) return;
    this.moved = this.starts.size > 0;
    this.starts.set(id, [x, y]);
  }

  move(id: number, x: number, y: number): void {
    const start = this.starts.get(id);
    if (start && Math.hypot(x - start[0], y - start[1]) >= this.limitPx) this.moved = true;
  }

  up(id: number): void {
    this.starts.delete(id);
  }

  /** Whether the latest press was a tap; still answers just after the finger lifts. */
  get wasTap(): boolean {
    return !this.moved;
  }
}
