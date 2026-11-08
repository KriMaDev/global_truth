import { describe, expect, it } from 'vitest';
import { PressTracker } from './press';

describe('PressTracker', () => {
  it('calls a press that stays put a tap', () => {
    const press = new PressTracker(8);
    press.down(1, 100, 100);
    press.move(1, 103, 102);
    press.up(1);
    expect(press.wasTap).toBe(true);
  });

  it('adds up slow movement: tiny steps still make a drag', () => {
    const press = new PressTracker(8);
    press.down(1, 100, 100);
    for (let i = 1; i <= 20; i += 1) press.move(1, 100 + i * 0.5, 100);
    press.up(1);
    expect(press.wasTap).toBe(false);
  });

  it('never calls two fingers a tap', () => {
    const press = new PressTracker(8);
    press.down(1, 100, 100);
    press.down(2, 200, 200);
    press.up(1);
    press.up(2);
    expect(press.wasTap).toBe(false);
  });

  it('starts afresh with the next press', () => {
    const press = new PressTracker(8);
    press.down(1, 100, 100);
    press.move(1, 150, 100);
    press.up(1);
    press.down(2, 100, 100);
    press.up(2);
    expect(press.wasTap).toBe(true);
  });

  it('stops being a tap once something else has taken it', () => {
    const press = new PressTracker(8);
    press.down(1, 100, 100);
    press.up(1);
    press.cancelTap();
    expect(press.wasTap).toBe(false);
  });

  it('ignores the same press being reported twice', () => {
    const press = new PressTracker(8);
    press.down(1, 100, 100);
    press.down(1, 100, 100);
    press.up(1);
    expect(press.wasTap).toBe(true);
  });
});
