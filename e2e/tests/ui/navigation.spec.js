const { test, expect, DATA, FRONTEND_ORIGIN } = require('../../helpers/api-mocks');

// App shell: sidebar, topbar, routing, full-screen pages, unknown routes and logout.

const LAYOUT_PAGES = [
  ['Dashboard', '/dashboard', 'System Dashboard'],
  ['Assistant', '/assistant', 'How can I help you today?'],
  ['Gmail', '/gmail', 'Gmail Integration'],
  ['Calendar', '/calendar', 'Google Calendar'],
  ['Custom Answers', '/templates', 'Scheduled Emails'],
  ['Maps', '/maps', 'Geographic Explorer'],
  ['Settings', '/settings', 'Settings'],
  ['Configuration', '/configuration', 'Configuration'],
];

test.describe('ui: navigation and app shell', () => {
  test('topbar shows the signed-in user and their picture', async ({ page, api }) => {
    api.on('GET', '/api/auth/profile', { json: { ...DATA.USER, picture: '/favicon.png' } });
    await page.goto('/dashboard');

    const banner = page.getByRole('banner');
    await expect(banner.getByText(DATA.USER.name, { exact: true })).toBeVisible();
    await expect(banner.getByRole('img', { name: 'Profile' })).toHaveAttribute('src', '/favicon.png');
    await expect(banner.getByTitle('Logout')).toBeVisible();
  });

  for (const [label, path, heading] of LAYOUT_PAGES) {
    test(`sidebar "${label}" renders ${path} inside the layout`, async ({ page, api }) => {
      await page.goto('/dashboard');
      await page.locator('aside nav').getByRole('link', { name: label }).click();

      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator('main').getByRole('heading', { name: heading, exact: false }).first()).toBeVisible();
      await expect(page.getByRole('banner')).toBeVisible();
      expect(api.unhandled).toEqual([]);
    });
  }

  test('Google Drive opens full screen and "Exit" returns to the dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.locator('aside nav').getByRole('link', { name: 'Google Drive' }).click();

    await expect(page).toHaveURL(/\/drive$/);
    await expect(page.getByRole('banner').filter({ hasText: DATA.USER.name })).toHaveCount(0); // no app topbar
    await expect(page.getByPlaceholder('Search in Drive')).toBeVisible();

    await page.getByRole('link', { name: 'Exit' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('System Dashboard')).toBeVisible();
  });

  test('Google Photos opens full screen and "Exit" returns to the dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.locator('aside nav').getByRole('link', { name: 'Google Photos' }).click();

    await expect(page).toHaveURL(/\/photos$/);
    await expect(page.getByRole('heading', { name: 'Select Photos to View' })).toBeVisible();

    await page.getByRole('link', { name: 'Exit' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('WhatsApp opens full screen and the avatar button returns to the dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.locator('aside nav').getByRole('link', { name: 'WhatsApp' }).click();

    await expect(page).toHaveURL(/\/whatsapp$/);
    await expect(page.getByText('WhatsApp', { exact: true })).toBeVisible();
    await expect(page.locator('aside')).toHaveCount(0);

    await page.getByTitle('Back to Dashboard').click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('browser back and forward move between pages', async ({ page }) => {
    await page.goto('/dashboard');
    const nav = page.locator('aside nav');
    await nav.getByRole('link', { name: 'Gmail' }).click();
    await expect(page).toHaveURL(/\/gmail$/);
    await nav.getByRole('link', { name: 'Calendar' }).click();
    await expect(page).toHaveURL(/\/calendar$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/gmail$/);
    await expect(nav.getByRole('link', { name: 'Gmail' })).toHaveClass(/bg-blue-600/);
    await page.goForward();
    await expect(page).toHaveURL(/\/calendar$/);
    await expect(page.getByText('Google Calendar')).toBeVisible();
  });

  for (const path of ['/does-not-exist', '/gmail/extra/segments', '/admin']) {
    test(`unknown route ${path} falls back to the dashboard when signed in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByText('System Dashboard')).toBeVisible();
    });
  }

  test('the profile is checked once per protected page load and the spinner gives way to content', async ({ page, api }) => {
    api.on('GET', '/api/auth/profile', { json: DATA.USER, delay: 500 });
    await page.goto('/templates');
    await expect(page.locator('.animate-spin').first()).toBeVisible();
    await expect(page.getByText('Scheduled Emails')).toBeVisible();
    expect(api.callsTo('GET', '/api/auth/profile').length).toBeGreaterThanOrEqual(1);
  });

  test('an expired session (profile 401) sends the user to the login page', async ({ page, api }) => {
    api.fail('GET', '/api/auth/profile', 401, {});
    await page.goto('/calendar');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  });

  test('logging out from the topbar posts the logout with the CSRF header and lands on /login', async ({ page, api, context }) => {
    await context.addCookies([{ name: 'XSRF-TOKEN', value: 'csrf-ui-token', url: FRONTEND_ORIGIN }]);
    await page.goto('/dashboard');
    await expect(page.getByTitle('Logout')).toBeVisible();
    api.on('GET', '/api/auth/profile', { status: 401, json: {} }); // the session is gone afterwards

    const logout = api.waitForCall('POST', '/api/auth/logout');
    await page.getByTitle('Logout').click();
    const call = await logout;

    expect(call.headers['x-xsrf-token']).toBe('csrf-ui-token');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  });

  test('logout still reaches the login page when the backend call fails', async ({ page, api }) => {
    api.fail('POST', '/api/auth/logout', 500);
    await page.goto('/dashboard');
    await expect(page.getByTitle('Logout')).toBeVisible();
    api.on('GET', '/api/auth/profile', { status: 401, json: {} });

    await page.getByTitle('Logout').click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
