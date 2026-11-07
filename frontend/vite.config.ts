import { defineConfig } from "vitest/config";

// The frontend lives in frontend/; `npm run build` writes frontend/dist,
// which wrangler.jsonc publishes as static assets.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    // Never inline files as data: URLs: the Content-Security-Policy only allows our own files.
    assetsInlineLimit: 0,
    // three.js is one large library; it is loaded after the page shell, so its size
    // does not delay the first paint.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
