const { test, expect, DATA } = require('../../helpers/api-mocks');

const section = (page, name) => page.locator('div.rounded-xl', { has: page.getByRole('heading', { name }) });

test.describe('ui: settings', () => {
  test('shows the profile, member-since date and action count', async ({ page }) => {
    await page.goto('/settings');
    const profile = section(page, 'User Profile');
    await expect(profile.getByRole('heading', { name: DATA.USER.name })).toBeVisible();
    await expect(profile.getByText(DATA.USER.email)).toBeVisible();
    await expect(profile.getByText('January 15, 2026')).toBeVisible();
    await expect(profile.getByText(`${DATA.AUDIT.length} recorded`)).toBeVisible();
    // No picture: the initial is shown instead.
    await expect(profile.getByText('E', { exact: true })).toBeVisible();
  });

  test('the activity log labels known and unknown actions', async ({ page }) => {
    await page.goto('/settings');
    const log = section(page, 'Activity Log');
    await expect(log.getByText('3 entries')).toBeVisible();
    await expect(log.getByText('Sent Email')).toBeVisible();
    await expect(log.getByText('Created Event')).toBeVisible();
    await expect(log.getByText('DRIVE LIST FILES')).toBeVisible();
    await expect(log.getByText('Executed sendEmail')).toBeVisible();
    await expect(log.getByText('5m ago')).toBeVisible();
    await expect(log.getByText('3h ago')).toBeVisible();
  });

  test('refresh reloads the activity log', async ({ page, api }) => {
    let calls = 0;
    api.on('GET', '/api/audit', () => {
      calls += 1;
      return { json: calls === 1 ? [] : DATA.AUDIT.slice(0, 1) };
    });
    await page.goto('/settings');
    const log = section(page, 'Activity Log');
    await expect(log.getByText('No activity recorded yet')).toBeVisible();
    await expect(log.getByText('0 entries')).toBeVisible();

    await log.getByRole('button', { name: 'Refresh' }).click();
    await expect(log.getByText('1 entry', { exact: true })).toBeVisible();
    await expect(log.getByText('Sent Email')).toBeVisible();
  });

  test('a profile failure shows a warning, the rest of the page still works', async ({ page, api }) => {
    // The first profile call is the route guard; the second is the Settings page itself.
    api.on('GET', '/api/auth/profile', ({ count }) => (count === 1 ? { json: DATA.USER } : { status: 500, json: {} }));
    await page.goto('/settings');
    await expect(page.getByText('Unable to load profile information.')).toBeVisible();
    await expect(section(page, 'Activity Log').getByText('Sent Email')).toBeVisible();
  });

  test('an audit failure falls back to the empty log', async ({ page, api }) => {
    api.fail('GET', '/api/audit', 500);
    await page.goto('/settings');
    await expect(page.getByText('No activity recorded yet')).toBeVisible();
    await expect(page.getByText('0 recorded')).toBeVisible();
  });

  test('"Sign Out" logs out and goes to the login page', async ({ page, api }) => {
    api.on('POST', '/api/auth/logout', { status: 200, json: {}, delay: 500 });
    await page.goto('/settings');
    const logout = api.waitForCall('POST', '/api/auth/logout');
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page.getByRole('button', { name: 'Signing out...' })).toBeDisabled();
    await logout;
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  });

  test('"Sign Out" still leaves when the logout call fails', async ({ page, api }) => {
    api.fail('POST', '/api/auth/logout', 500);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
