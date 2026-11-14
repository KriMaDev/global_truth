/**
 * The standards shared by krimadev.com, Star Teller and World News Globe. This file is the same
 * in all three repositories (what differs is in tests/baseline.config.json): to raise a version or
 * change a rule, change it here and copy the file to the other two.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Baseline {
  origin: string;
  built: string;
  manifests: string[];
  sitemap: string;
  pages: Record<string, string>;
}

const config = JSON.parse(readFileSync('tests/baseline.config.json', 'utf8')) as Baseline;
const built = (file: string) => join(config.built, file);
const readBuilt = (file: string) => readFileSync(built(file), 'utf8');
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, never>;

/** One version of each shared tool. Every package.json that names one must use exactly this. */
const versions: Record<string, string> = {
  '@playwright/test': '1.64.1',
  '@types/node': '26.6.6',
  eslint: '10.13.0',
  prettier: '3.9.10',
  typescript: '6.0.3',
  'typescript-eslint': '8.72.1',
  vitest: '5.0.5',
  wrangler: '4.156.1',
};
const requiredEverywhere = ['eslint', 'prettier', 'typescript', 'vitest', 'wrangler'];

/** Crawlers that collect training data: kept out of all three sites. */
const trainingCrawlers = [
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'meta-externalagent',
  'FacebookBot',
  'Amazonbot',
  'cohere-training-data-crawler',
  'AI2Bot',
  'Diffbot',
  'Omgilibot',
  'omgili',
  'PanguBot',
  'Timpibot',
  'ImagesiftBot',
];
/** Search engines and AI search or answer crawlers: welcome on all three (GEO). */
const answerCrawlers = [
  'Googlebot',
  'Bingbot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Applebot',
  'DuckAssistBot',
];

const sharedHeaders: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function staticHeaders() {
  const lines = readBuilt('_headers')
    .split('\n')
    .map((line) => line.trim());
  const start = lines.indexOf('/*') + 1;
  const end = lines.findIndex((line, index) => index >= start && line === '');
  return Object.fromEntries(
    lines.slice(start, end === -1 ? undefined : end).map((line) => {
      const colon = line.indexOf(': ');
      return [line.slice(0, colon), line.slice(colon + 2)];
    }),
  );
}

function htmlFiles(folder = config.built): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

/** Scripts written into the page itself, as opposed to data blocks and files loaded by address. */
function inlineScripts(html: string) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes = '']) => !/\bsrc=/i.test(attributes))
    .filter(([, attributes = '']) => !/type=["']?application\/(ld\+)?json/i.test(attributes))
    .map(([, , body = '']) => body)
    .filter((body) => body !== '');
}

const scriptPolicy = (policy: string) =>
  policy
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('script-src')) ?? '';

const metaPolicy = (html: string) =>
  /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html)?.[1] ?? '';

describe('shared tool versions', () => {
  const manifests = config.manifests.map((file) => ({
    file,
    json: JSON.parse(readFileSync(file, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    },
  }));
  const declared = (name: string) =>
    manifests.flatMap(({ file, json }) => {
      const version = json.dependencies?.[name] ?? json.devDependencies?.[name];
      return version ? [{ file, version }] : [];
    });

  it.each(Object.keys(versions))('%s is the agreed version wherever it is used', (name) => {
    for (const { file, version } of declared(name)) expect(version, file).toBe(versions[name]);
  });

  it.each(requiredEverywhere)('%s is used in this project', (name) => {
    expect(declared(name).length).toBeGreaterThan(0);
  });

  it('runs on Node 24', () => {
    expect(readFileSync('.nvmrc', 'utf8').trim()).toBe('24');
    expect((readJson('package.json') as { engines?: { node?: string } }).engines?.node).toBe(
      '>=24',
    );
  });
});

describe('security headers and script policy', () => {
  it.each(Object.keys(sharedHeaders))('every page sends %s', (name) => {
    expect(staticHeaders()[name]).toBe(sharedHeaders[name]);
  });

  it('forbids framing, plugins and a changed base address', () => {
    const policy = staticHeaders()['Content-Security-Policy'] ?? '';
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain('object-src');
    expect(policy).toMatch(/base-uri '(self|none)'/);
  });

  it('every page limits its scripts, and every script written into a page is allowed by hash', () => {
    const header = staticHeaders()['Content-Security-Policy'] ?? '';
    for (const file of htmlFiles()) {
      const html = readFileSync(file, 'utf8');
      const policy = scriptPolicy(metaPolicy(html)) || scriptPolicy(header);
      expect(policy, file).not.toBe('');
      expect(policy, file).not.toContain("'unsafe-inline'");
      expect(policy, file).not.toContain("'unsafe-eval'");
      for (const body of inlineScripts(html)) {
        const hash = createHash('sha256').update(body, 'utf8').digest('base64');
        expect(policy, `${file}: inline script ${body.slice(0, 40)}`).toContain(`'sha256-${hash}'`);
      }
    }
  });

  it('puts the policy in front of the first script of a page', () => {
    for (const file of htmlFiles()) {
      const html = readFileSync(file, 'utf8');
      if (!metaPolicy(html)) continue;
      const policyAt = html.search(/<meta\s+http-equiv="Content-Security-Policy"/i);
      const scriptAt = html.search(/<script\b/i);
      if (scriptAt !== -1) expect(policyAt, file).toBeLessThan(scriptAt);
    }
  });
});

describe('search engines and AI crawlers', () => {
  const robots = () => readBuilt('robots.txt');
  const groups = () =>
    robots()
      .split(/\n\s*\n/)
      .map((group) => group.replace(/^#.*$/gm, ''));
  const refused = () =>
    groups()
      .filter((group) => /^Disallow: \/\s*$/m.test(group))
      .flatMap((group) => [...group.matchAll(/^User-agent: (.+)$/gm)].map(([, name = '']) => name));

  it.each(trainingCrawlers)('%s, which collects training data, is kept out', (name) => {
    expect(refused()).toContain(name);
  });

  it.each(answerCrawlers)('%s stays allowed', (name) => {
    expect(refused()).not.toContain(name);
  });

  it('everyone else may read the site', () => {
    expect(robots()).toMatch(/User-agent: \*\s+Allow: \//);
    expect(refused()).not.toContain('*');
  });

  it('names the sitemap', () => {
    expect(robots()).toContain(`Sitemap: ${config.origin}/${config.sitemap}`);
  });

  it('has a summary for language models', () => {
    expect(readBuilt('llms.txt').length).toBeGreaterThan(200);
  });

  it.runIf(existsSync(built(config.sitemap)))('has a sitemap of this site', () => {
    expect(readBuilt(config.sitemap)).toContain(`<loc>${config.origin}/`);
  });

  it.each(Object.entries(config.pages))('%s names itself as the real address', (file, path) => {
    expect(readBuilt(file)).toMatch(
      new RegExp(`<link[^>]+rel="canonical"[^>]+href="${config.origin}${path}"`),
    );
  });
});

describe('repository standards', () => {
  it('has a security.txt that has not expired, with a month to spare', () => {
    const text = readBuilt('.well-known/security.txt');
    const expires = Date.parse(/^Expires: (.+)$/m.exec(text)?.[1] ?? '');
    expect(expires).toBeGreaterThan(Date.now() + 30 * 86_400_000);
    expect(text).toContain('Contact: https://krimadev.com/contact/');
    expect(text).toContain(`Canonical: ${config.origin}/.well-known/security.txt`);
  });

  it.each(['SECURITY.md', 'LICENSE', '.editorconfig', '.prettierrc.json', '.gitattributes'])(
    'has %s',
    (file) => {
      expect(existsSync(file)).toBe(true);
    },
  );

  const workflows = readdirSync('.github/workflows').map((file) => ({
    file,
    text: readFileSync(join('.github/workflows', file), 'utf8'),
  }));

  it('pins every GitHub Action to an exact commit', () => {
    for (const { file, text } of workflows) {
      for (const [, action = ''] of text.matchAll(/uses:\s*(\S+)/g)) {
        expect(action, file).toMatch(/@[0-9a-f]{40}$/);
      }
    }
  });

  it('gives every workflow read-only access by default', () => {
    for (const { file, text } of workflows) {
      expect(text, file).toMatch(/^permissions:\n {2}contents: read$/m);
    }
  });

  it('never leaves GitHub credentials behind in a checkout', () => {
    for (const { file, text } of workflows) {
      const checkouts = text.match(
        /uses: actions\/checkout@\S+[^\n]*\n\s+with:[\s\S]*?(?=\n\s+- )/g,
      );
      const count = (text.match(/uses: actions\/checkout@/g) ?? []).length;
      expect(checkouts?.length ?? 0, file).toBe(count);
      for (const checkout of checkouts ?? []) {
        expect(checkout, file).toContain('persist-credentials: false');
      }
    }
  });

  it('waits two weeks before taking a new package version', () => {
    expect(readFileSync('.github/dependabot.yml', 'utf8')).toContain('default-days: 14');
  });
});
