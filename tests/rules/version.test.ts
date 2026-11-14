/**
 * The release number: `version` in package.json is the newest entry of CHANGELOG.md, and the
 * changelog lists every release once, newest first ("## 1.9.0 · 2026-11-14").
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version?: string };
const headings = [...readFileSync('CHANGELOG.md', 'utf8').matchAll(/^## (.+)$/gm)].map(
  ([, text]) => text,
);
const releases = headings.map((text) => {
  const match = /^(\d+)\.(\d+)\.(\d+) · (\d{4}-\d{2}-\d{2})( · .+)?$/.exec(text);
  return { text, parts: match ? match.slice(1, 4).map(Number) : null, date: match?.[4] ?? '' };
});
const compare = (a: number[], b: number[]) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;

describe('the release number', () => {
  it('is MAJOR.MINOR.PATCH in package.json', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is the newest release in CHANGELOG.md', () => {
    expect(headings[0]?.split(' · ')[0]).toBe(version);
  });

  it.each(releases)('"$text" is a version and a date', ({ parts }) => {
    expect(parts).not.toBeNull();
  });

  it('only goes up, and never goes back in time', () => {
    for (let i = 1; i < releases.length; i++) {
      const [newer, older] = [releases[i - 1]!, releases[i]!];
      expect(
        compare(newer.parts!, older.parts!),
        `${newer.text} after ${older.text}`,
      ).toBeGreaterThan(0);
      expect(newer.date >= older.date, `${newer.text} after ${older.text}`).toBe(true);
    }
  });
});
