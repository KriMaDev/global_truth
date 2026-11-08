import { Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';
import { mergeShapes, paintRanges } from './shapes';

const triangle = (shape: string, scale = 1) => ({
  shape,
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  index: [0, 1, 2],
  matrix: new Matrix4().makeScale(scale, scale, scale),
});

describe('mergeShapes', () => {
  it('joins shapes, moving each vertex and renumbering the triangles', () => {
    const merged = mergeShapes([triangle('a'), triangle('b', 2)]);
    expect([...merged.positions.slice(9, 12)]).toEqual([0, 0, 0]);
    expect([...merged.positions.slice(12, 15)]).toEqual([2, 0, 0]);
    expect([...merged.index]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(merged.ranges).toEqual([
      { shape: 'a', start: 0, count: 3 },
      { shape: 'b', start: 3, count: 3 },
    ]);
  });

  it('numbers the vertices itself when a shape has no triangle list', () => {
    const merged = mergeShapes([{ ...triangle('a'), index: null }]);
    expect([...merged.index]).toEqual([0, 1, 2]);
  });
});

describe('paintRanges', () => {
  it('gives every vertex its own shape colour and leaves others alone', () => {
    const colors = new Float32Array(6 * 4);
    const { ranges } = mergeShapes([triangle('a'), triangle('b')]);
    paintRanges(colors, ranges, (shape) => (shape === 'a' ? [1, 0, 0, 0.5] : [0, 1, 0, 0.25]));
    expect([...colors.slice(0, 4)]).toEqual([1, 0, 0, 0.5]);
    expect([...colors.slice(12, 16)]).toEqual([0, 1, 0, 0.25]);
  });
});
