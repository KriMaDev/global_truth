import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * The version shown in the footer: the build date and the commit it was built from, with
 * "+" when there were uncommitted changes (as in Star Teller). In GitHub Actions the commit
 * comes from GITHUB_SHA.
 */
function version(): { date: string; commit: string } {
  const date = new Date().toISOString().slice(0, 10);
  const git = (...args: string[]): string =>
    execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const sha = process.env.GITHUB_SHA ?? git("rev-parse", "HEAD");
    const dirty = process.env.GITHUB_SHA ? false : git("status", "--porcelain") !== "";
    return { date, commit: sha.slice(0, 7) + (dirty ? "+" : "") };
  } catch {
    return { date, commit: "unknown" };
  }
}

const { date, commit } = version();

// The frontend lives in frontend/; `npm run build` writes frontend/dist,
// which wrangler.jsonc publishes as static assets.
export default defineConfig({
  define: {
    __BUILD_DATE__: JSON.stringify(date),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
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
    include: ["src/**/*.test.ts", "../worker/**/*.test.js"],
    environment: "node",
  },
});
