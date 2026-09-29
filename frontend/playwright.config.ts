// Tier 3: Playwright + the preinstalled Chromium on SwiftShader (software
// WebGL2). Never run `playwright install` here: PLAYWRIGHT_BROWSERS_PATH is
// /opt/pw-browsers and downloads are disabled; the binary is used by path.
//   npx playwright test tests/gpu/door-swiftshader.spec.ts
import { defineConfig } from '@playwright/test';

const PORT = 5173;
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'tests/gpu',
  testMatch: /.*\.spec\.ts$/,
  outputDir: 'tests/gpu/out/results',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE,
    headless: true,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'swiftshader',
      use: {
        browserName: 'chromium',
        launchOptions: {
          executablePath: '/opt/pw-browsers/chromium',
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `${BASE}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
