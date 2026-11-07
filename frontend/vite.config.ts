import { defineConfig } from "vite";

// The frontend lives in frontend/; `npm run build` writes frontend/dist,
// which wrangler.jsonc publishes as static assets.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
});
