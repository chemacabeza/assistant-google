const { test, expect } = require('@playwright/test');
const { GOOGLE_CLIENT_ID, GOOGLE_AUTH_URL, OAUTH_REDIRECT_URI } = require('../../helpers/env');

const PROTECTED_PAGES = [
  '/',
  '/dashboard',
  '/assistant',
  '/gmail',
  '/drive',
  '/photos',
  '/calendar',
  '/templates',
  '/maps',
  '/whatsapp',
  '/settings',
  '/configuration',
  '/some/unknown/page',
];

test.describe('frontend: anonymous visitor', () => {
  test('login page renders the welcome screen', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByText('Connect your Google account')).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  for (const path of PROTECTED_PAGES) {
    test(`${path} redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    });
  }

  test('the app shell is not exposed to anonymous users', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Chema's AI Assistant")).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Gmail' })).toHaveCount(0);
  });

  test('"Continue with Google" starts the OAuth flow through the real backend', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /continue with google/i }).click();

    await expect(page.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
    const url = new URL(page.url());
    expect(url.origin + url.pathname).toBe(GOOGLE_AUTH_URL);
    expect(url.searchParams.get('client_id')).toBe(GOOGLE_CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(OAUTH_REDIRECT_URI);
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  test('a backend outage on the profile call keeps the user on the login screen', async ({ page }) => {
    await page.route('**/api/auth/profile', (route) => route.fulfill({ status: 503, body: 'down' }));

    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login$/);
  });

  test('page title and favicon are served', async ({ page, request }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/.+/);
    expect((await request.get('/favicon.png')).status()).toBe(200);
  });
});
