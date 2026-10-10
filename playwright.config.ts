import { defineConfig, devices } from '@playwright/test';

// Two servers: the Vite dev server so tests can import core modules straight
// from source, and a production build for everything players actually run.
const DEV = 'http://localhost:5174';
const PROD = 'http://localhost:4174/mentat/';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 60_000,
  use: { baseURL: PROD, trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'npx vite --port 5174 --strictPort',
      url: `${DEV}/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx vite build && npx vite preview --port 4174 --strictPort',
      url: PROD,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testMatch: /(golden|game|latency)\.spec\.ts/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /(golden|game)\.spec\.ts/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /(golden|game)\.spec\.ts/ },
    { name: 'android', use: { ...devices['Pixel 7'] }, testMatch: /(golden|keypad)\.spec\.ts/ },
    { name: 'iphone', use: { ...devices['iPhone 14'] }, testMatch: /(golden|keypad)\.spec\.ts/ },
  ],
});
