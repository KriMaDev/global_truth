import { defineConfig, devices } from '@playwright/test';

const onCi = Boolean(process.env.CI);
// Computers here use the installed Microsoft Edge, as in krimadev.com and Star Teller.
// With CI=1 (private/scripts/ci-local.ps1) the tests copy GitHub's machines: Playwright's own
// Chromium, the 3D globe drawn on the processor, and a retry.
const browser = onCi
  ? { launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } }
  : { channel: 'msedge' };
const port = 4173;

export default defineConfig({
  testDir: 'tests/browser',
  outputDir: 'test-results',
  retries: onCi ? 1 : 0,
  // Without a graphics card, CI draws the globe at a few frames a second.
  timeout: onCi ? 60_000 : 30_000,
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...browser } },
    { name: 'phone', use: { ...devices['Pixel 7'], ...browser } },
  ],
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !onCi,
  },
});
