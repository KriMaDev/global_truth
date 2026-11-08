/**
 * The live site from outside, against the standards shared by krimadev.com, Star Teller and World
 * News Globe. Read-only. The same file in all three repositories (tests/baseline.config.json says
 * which site): change it here and copy it to the other two.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const { origin, sitemap } = JSON.parse(readFileSync('tests/baseline.config.json', 'utf8')) as {
  origin: string;
  sitemap: string;
};

const get = (url: string) =>
  fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });

describe(origin, () => {
  it.each([
    ['strict-transport-security', 'max-age=31536000'],
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
    ['referrer-policy', 'strict-origin-when-cross-origin'],
    ['permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'],
    ['cross-origin-opener-policy', 'same-origin'],
  ])('sends %s', async (name, value) => {
    expect((await get(`${origin}/`)).headers.get(name)).toBe(value);
  });

  it('refuses to be framed', async () => {
    const policy = (await get(`${origin}/`)).headers.get('content-security-policy');
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it('sends visitors on plain HTTP to HTTPS', async () => {
    const response = await get(origin.replace('https:', 'http:') + '/');
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(`${origin}/`);
  });

  it('keeps training crawlers out and names its sitemap', async () => {
    const robots = await (await get(`${origin}/robots.txt`)).text();
    expect(robots).toContain('User-agent: GPTBot');
    expect(robots).toContain(`Sitemap: ${origin}/${sitemap}`);
  });

  it.each(['/.well-known/security.txt', '/llms.txt'])('serves %s', async (path) => {
    expect((await get(`${origin}${path}`)).status).toBe(200);
  });

  it('serves its sitemap', async () => {
    expect((await get(`${origin}/${sitemap}`)).status).toBe(200);
  });

  it.each(['/.git/config', '/.env', '/package.json', '/wrangler.jsonc'])(
    'does not serve %s',
    async (path) => {
      expect((await get(`${origin}${path}`)).status).toBe(404);
    },
  );
});
