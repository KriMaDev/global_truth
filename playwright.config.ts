import { defineConfig, devices } from '@playwright/test';

const onCi = Boolean(process.env.CI);
// Computers here use the installed Microsoft Edge, as in krimadev.com and Star Teller.
// CI has no graphics card, so the 3D globe runs on the processor there.
const browser = onCi
  ? { launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } }
  : { channel: 'msedge' };
const port = 4173;

export default defineConfig({
  testDir: 'tests/browser',
  outputDir: 'test-results',
  retries: onCi ? 1 : 0,
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
