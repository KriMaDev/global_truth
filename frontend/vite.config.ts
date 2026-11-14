import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * The version shown in the footer: the release number from package.json (CHANGELOG.md) and
 * the build date, with "+" after the number when there were uncommitted changes (as in Star
 * Teller). GitHub Actions builds a clean checkout, so it never has the "+". Each release has a
 * git tag (v1.9.0) on its commit.
 */
function version(): { date: string; release: string } {
  const date = new Date().toISOString().slice(0, 10);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  let dirty = false;
  if (!process.env.GITHUB_ACTIONS) {
    try {
      const status = execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      dirty = status.trim() !== '';
    } catch {
      // Not a git checkout: nothing to compare with.
    }
  }
  return { date, release: pkg.version + (dirty ? '+' : '') };
}

const { date, release } = version();

// The frontend lives in frontend/; `npm run build` writes frontend/dist,
// which wrangler.jsonc publishes as static assets.
export default defineConfig({
  resolve: {
    // Code that globe.gl's libraries import but this site never uses (src/globe/unused-modules.ts).
    alias: [
      { find: /^(three\/(webgpu|tsl)|h3-js)$/, replacement: `${root}src/globe/unused-modules.ts` },
    ],
  },
  define: {
    __BUILD_DATE__: JSON.stringify(date),
    __BUILD_VERSION__: JSON.stringify(release),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // Never inline files as data: URLs: the Content-Security-Policy only allows our own files.
    assetsInlineLimit: 0,
    // three.js is one large library; it is loaded after the page shell, so its size
    // does not delay the first paint.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: `${root}index.html`,
        legal: `${root}legal/index.html`,
        about: `${root}about/index.html`,
        sources: `${root}sources/index.html`,
      },
    },
  },
  test: {
    // The Worker's timer script (../worker) is tested here too.
    include: ['src/**/*.test.ts', '../worker/**/*.test.js'],
    environment: 'node',
  },
});
