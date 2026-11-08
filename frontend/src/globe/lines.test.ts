import { describe, expect, it } from 'vitest';
import { parseLines } from './lines';

function encode(coast: number[][][], borders: number[][][]): ArrayBuffer {
  const points = [...coast, ...borders].reduce((n, line) => n + line.length, 0);
  const lines = coast.length + borders.length;
  const buffer = new ArrayBuffer(12 + lines * 2 + points * 4);
  const view = new DataView(buffer);
  'WNGL'.split('').forEach((ch, i) => view.setUint8(i, ch.charCodeAt(0)));
  view.setUint32(4, coast.length, true);
  view.setUint32(8, borders.length, true);
  let offset = 12;
  for (const line of [...coast, ...borders]) {
    view.setUint16(offset, line.length, true);
    offset += 2;
    for (const [lng, lat] of line) {
      view.setInt16(offset, Math.round(lng * 100), true);
      view.setInt16(offset + 2, Math.round(lat * 100), true);
      offset += 4;
    }
  }
  return buffer;
}

describe('parseLines', () => {
  it('reads coastlines and borders back', () => {
    const coast = [
      [
        [-9.5, 38.7],
        [-8.6, 41.15],
      ],
    ];
    const borders = [
      [
        [2.5, 51.1],
        [5.0, 50.8],
        [6.1, 50.1],
      ],
    ];
    expect(parseLines(encode(coast, borders))).toEqual({ coastlines: coast, borders });
  });

  it('rejects other files', () => {
    expect(() => parseLines(new ArrayBuffer(12))).toThrow('unknown format');
  });
});
