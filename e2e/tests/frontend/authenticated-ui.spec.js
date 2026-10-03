const { test, expect } = require('@playwright/test');

// The backend cannot log in through Google in an automated run, so these tests give the
// real built frontend a stubbed API: they cover routing, layout and navigation once signed in.

const USER = { name: 'E2E User', email: 'e2e@example.com', picture: null };

const NAV = [
  ['Dashboard', '/dashboard'],
  ['Assistant', '/assistant'],
  ['Gmail', '/gmail'],
  ['Calendar', '/calendar'],
  ['Custom Answers', '/templates'],
  ['Maps', '/maps'],
  ['Settings', '/settings'],
  ['Configuration', '/configuration'],
];

async function signedIn(page) {
  await page.route('**/api/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/profile') return route.fulfill({ json: USER });
    if (pathname === '/api/auth/logout') return route.fulfill({ status: 200, json: {} });
    return route.fulfill({ json: [] });
  });
}

test.describe('frontend: signed-in user (stubbed API)', () => {
  test.beforeEach(async ({ page }) => signedIn(page));

  test('the root URL opens the dashboard inside the app layout', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Chema's AI Assistant")).toBeVisible();
    await expect(page.getByText('Assistant Dashboard')).toBeVisible();
    await expect(page.getByText('E2E User')).toBeVisible();
  });

  test('the sidebar lists every section', async ({ page }) => {
    await page.goto('/dashboard');
    const nav = page.locator('aside nav');
    for (const label of ['Dashboard', 'Assistant', 'Gmail', 'Google Drive', 'Google Photos', 'Calendar', 'Custom Answers', 'Maps', 'WhatsApp', 'Settings', 'Configuration']) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
  });

  for (const [label, path] of NAV) {
    test(`clicking "${label}" navigates to ${path} and highlights it`, async ({ page }) => {
      await page.goto('/dashboard');
      const link = page.locator('aside nav').getByRole('link', { name: label });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(link).toHaveClass(/bg-blue-600/);
      await expect(page.getByText("Chema's AI Assistant")).toBeVisible(); // layout survives the navigation
    });
  }

  test('direct deep links stay on the page when signed in', async ({ page }) => {
    await page.goto('/gmail');
    await expect(page).toHaveURL(/\/gmail$/);
    await expect(page.locator('aside')).toBeVisible();
  });

  test('logging out returns to the login page', async ({ page }) => {
    await page.goto('/dashboard');
    const logout = page.waitForRequest((r) => r.url().endsWith('/api/auth/logout') && r.method() === 'POST');
    await page.getByTitle('Logout').click();
    await logout;
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the dashboard asks the backend for calendar events and mail', async ({ page }) => {
    const calendar = page.waitForRequest((r) => r.url().includes('/api/calendar/events'));
    const mail = page.waitForRequest((r) => r.url().includes('/api/gmail/messages'));
    await page.goto('/dashboard');
    await Promise.all([calendar, mail]);
  });

  test('the dashboard survives empty API responses without script errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/dashboard');
    await expect(page.getByText('Assistant Dashboard')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
