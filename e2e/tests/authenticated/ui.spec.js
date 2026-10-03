const { test, expect } = require('@playwright/test');
const { USERS } = require('../../helpers/env');
const { csrfHeaders, stubGoogleBackedApis } = require('../../helpers/auth');
const { psql, lit, runId } = require('../../helpers/db');

// Real session from the "setup" project; Google-backed endpoints are stubbed so no mock token ever
// reaches the real Google APIs.

const NAV = [
  ['Dashboard', '/dashboard'],
  ['Assistant', '/assistant'],
  ['Gmail', '/gmail'],
  ['Calendar', '/calendar'],
  ['Custom Answers', '/templates'],
  ['Settings', '/settings'],
  ['Configuration', '/configuration'],
];

test.describe('authenticated UI (real backend session)', () => {
  test.beforeEach(async ({ page }) => stubGoogleBackedApis(page));

  test('opening the app lands on the dashboard with the real profile', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('banner').getByText(USERS.primary.name, { exact: true })).toBeVisible();
    await expect(page.getByText("Chema's AI Assistant")).toBeVisible();
  });

  test('the session survives a reload and a direct deep link', async ({ page }) => {
    await page.goto('/templates');
    await expect(page).toHaveURL(/\/templates$/);
    await page.reload();
    await expect(page).toHaveURL(/\/templates$/);
    await expect(page.getByRole('banner').getByText(USERS.primary.name, { exact: true })).toBeVisible();
  });

  test('the login page is still reachable while signed in', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  });

  for (const [label, path] of NAV) {
    test(`sidebar "${label}" navigates to ${path}`, async ({ page }) => {
      await page.goto('/dashboard');
      const link = page.locator('aside nav').getByRole('link', { name: label });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(link).toHaveClass(/bg-blue-600/);
      await expect(page.getByRole('banner').getByText(USERS.primary.name, { exact: true })).toBeVisible();
    });
  }

  test('a template created through the API shows up on the Custom Answers page', async ({ page, request }) => {
    const title = `e2e-${runId()}-ui-template`;
    const created = await request.post('/api/templates', {
      data: { title, content: 'Visible in the UI', category: 'e2e' },
      headers: await csrfHeaders(request),
    });
    expect(created.status()).toBe(200);

    try {
      await page.goto('/templates');
      await expect(page.getByText(title)).toBeVisible();
    } finally {
      psql(`delete from custom_answer_templates where title = ${lit(title)}`);
    }
  });
});
