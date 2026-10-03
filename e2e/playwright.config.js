const { defineConfig, devices } = require('@playwright/test');
const { urls, AUTH_FILE } = require('./helpers/env');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Tests share one database and one bridge, so they run serially.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'backend', testDir: './tests/backend', use: { baseURL: urls.backend } },
    { name: 'bridge', testDir: './tests/bridge', use: { baseURL: urls.bridge } },
    {
      name: 'frontend',
      testDir: './tests/frontend',
      use: { ...devices['Desktop Chrome'], baseURL: urls.frontend },
    },
    {
      // Signs in once through the mock Google provider and saves the session to .auth/user.json.
      name: 'setup',
      testDir: './tests/setup',
      testMatch: /.*\.setup\.js/,
      use: { ...devices['Desktop Chrome'], baseURL: urls.frontend },
    },
    {
      // The OAuth2 login flow itself: every test starts anonymous and signs in on its own.
      name: 'auth-flow',
      testDir: './tests/auth-flow',
      use: { ...devices['Desktop Chrome'], baseURL: urls.frontend },
    },
    {
      // Real backend + database with a real logged-in session (reused from the setup project).
      name: 'authenticated',
      testDir: './tests/authenticated',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], baseURL: urls.frontend, storageState: AUTH_FILE },
    },
    {
      // Wipes bridge sessions and WhatsApp data, so it must run after everything else.
      name: 'destructive',
      testDir: './tests/destructive',
      dependencies: ['backend', 'bridge', 'frontend', 'auth-flow', 'authenticated'],
      use: { baseURL: urls.bridge },
    },
  ],
});
