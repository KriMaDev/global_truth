import { describe, expect, it } from 'vitest';
import { ResolutionGuard } from './resolution';

function run(guard: ResolutionGuard, ms: number, frames = 60): number | null {
  let result: number | null = null;
  for (let i = 0; i < frames; i += 1) result = guard.frame(ms) ?? result;
  return result;
}

describe('ResolutionGuard', () => {
  it('leaves a device alone while it keeps up', () => {
    expect(run(new ResolutionGuard(2), 16)).toBeNull();
  });

  it('lowers the sharpness when frames are slow', () => {
    expect(run(new ResolutionGuard(2), 60)).toBe(1.5);
  });

  it('steps down, and stops at the lowest', () => {
    const guard = new ResolutionGuard(1.5);
    expect(run(guard, 60)).toBe(1.125);
    expect(run(guard, 60)).toBe(1);
    expect(run(guard, 60)).toBeNull();
  });

  it('ignores very long gaps, such as a hidden tab', () => {
    expect(run(new ResolutionGuard(2), 2000)).toBeNull();
  });
});
