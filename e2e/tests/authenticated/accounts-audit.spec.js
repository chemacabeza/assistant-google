const { test, expect } = require('@playwright/test');
const { USERS } = require('../../helpers/env');
const { csrfHeaders, loginThroughGoogle, stubGoogleBackedApis } = require('../../helpers/auth');
const { psql, rows, lit, runId } = require('../../helpers/db');

// Linked accounts and the audit log against the real backend + database.

const linked = (page) => page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'Linked Email Accounts' }) });

/** A second, independent browser session signed in as another user. */
async function otherUserSession(browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await loginThroughGoogle(await context.newPage(), USERS.second);
  return context;
}

test.describe('authenticated: linked accounts', () => {
  const run = runId();
  const email = (label) => `e2e-${run}-${label}@example.test`;

  test.beforeEach(async ({ page }) => stubGoogleBackedApis(page));
  test.afterAll(() => psql(`delete from linked_accounts where email like ${lit(`e2e-${run}-%`)}`));

  test('signing in links the Google account automatically', async ({ request }) => {
    const accounts = await (await request.get('/api/accounts')).json();
    expect(accounts).toContainEqual({ id: expect.any(Number), email: USERS.primary.email, name: USERS.primary.name });
    expect(rows(`select count(*)::int as n from linked_accounts where email = ${lit(USERS.primary.email)}`)).toEqual([{ n: 1 }]);
  });

  test('the Configuration page lists, adds and removes linked accounts', async ({ page }) => {
    const address = email('ui');
    await page.goto('/configuration');
    await expect(linked(page).getByText(USERS.primary.email, { exact: true })).toBeVisible();

    await linked(page).getByPlaceholder('e.g., secondary@gmail.com').fill(address);
    await linked(page).getByPlaceholder('e.g., Work Email').fill('E2E Side');
    const add = page.waitForResponse((r) => r.url().endsWith('/api/accounts') && r.request().method() === 'POST');
    await linked(page).getByRole('button', { name: 'Add Account' }).click();
    expect((await add).status()).toBe(200);

    await expect(linked(page).getByText(address, { exact: true })).toBeVisible();
    const [row] = rows(`select id, name from linked_accounts where email = ${lit(address)}`);
    expect(row.name).toBe('E2E Side');

    // A linked account becomes a "From" option elsewhere in the app.
    await page.goto('/templates');
    await page.getByRole('button', { name: 'New Template' }).click();
    await expect(page.locator('form select option', { hasText: address })).toHaveCount(1);

    await page.goto('/configuration');
    const item = linked(page).locator('div.group', { hasText: address });
    page.once('dialog', (d) => d.accept());
    await item.hover();
    const del = page.waitForResponse((r) => r.url().endsWith(`/api/accounts/${row.id}`) && r.request().method() === 'DELETE');
    await item.getByTitle('Remove Account').click();
    expect((await del).status()).toBe(200);
    await expect(linked(page).getByText(address, { exact: true })).toHaveCount(0);
    expect(rows(`select 1 as n from linked_accounts where id = ${row.id}`)).toHaveLength(0);
  });

  test('a duplicate address is rejected and shown in the UI', async ({ page }) => {
    await page.goto('/configuration');
    await linked(page).getByPlaceholder('e.g., secondary@gmail.com').fill(USERS.primary.email);
    const add = page.waitForResponse((r) => r.url().endsWith('/api/accounts') && r.request().method() === 'POST');
    await linked(page).getByRole('button', { name: 'Add Account' }).click();
    expect((await add).status()).toBe(400);
    await expect(linked(page).getByText('Account with this email already exists')).toBeVisible();
    expect(rows(`select count(*)::int as n from linked_accounts where email = ${lit(USERS.primary.email)}`)).toEqual([{ n: 1 }]);
  });

  test('adding an account needs the CSRF token', async ({ request }) => {
    const res = await request.post('/api/accounts', { data: { email: email('nocsrf'), name: 'x' } });
    expect(res.status()).toBe(403);
    expect(rows(`select 1 as n from linked_accounts where email = ${lit(email('nocsrf'))}`)).toHaveLength(0);
  });

  // BUG: linked accounts are global (LinkedAccountService.getAllAccounts / deleteAccount ignore the
  // signed-in user), so every user sees, and can delete, every other user's linked addresses.
  test.fixme("one user's linked accounts are invisible to another user", async ({ request, browser }) => {
    const address = email('private');
    const created = await request.post('/api/accounts', { data: { email: address, name: 'Private' }, headers: await csrfHeaders(request) });
    expect(created.status()).toBe(200);

    const other = await otherUserSession(browser);
    const seen = await (await other.request.get('/api/accounts')).json();
    await other.close();
    expect(seen.map((a) => a.email)).not.toContain(address);
  });
});

test.describe('authenticated: audit log', () => {
  const marker = `e2e-${runId()}-audit`;

  const insertLog = (userEmail, actionType, details, ageMinutes) =>
    psql(`insert into audit_logs (user_id, action_type, details, timestamp)
          select id, ${lit(actionType)}, ${lit(details)}, now() - interval '${ageMinutes} minutes' from users where email = ${lit(userEmail)}`);

  test.beforeEach(async ({ page }) => stubGoogleBackedApis(page));
  test.afterAll(() => psql(`delete from audit_logs where details like ${lit(`${marker}%`)}`));

  test('returns only the signed-in user\'s entries, newest first, as a minimal DTO', async ({ request, browser }) => {
    // Make sure the second user exists before writing an entry for them.
    const other = await otherUserSession(browser);
    insertLog(USERS.primary.email, 'CREATE_EVENT', `${marker}-older`, 120);
    insertLog(USERS.primary.email, 'SEND_EMAIL', `${marker}-newer`, 1);
    insertLog(USERS.second.email, 'DELETE_EVENT', `${marker}-someone-else`, 1);

    const res = await request.get('/api/audit');
    expect(res.status()).toBe(200);
    const mine = (await res.json()).filter((e) => e.details.startsWith(marker));
    expect(mine.map((e) => e.details)).toEqual([`${marker}-newer`, `${marker}-older`]);
    for (const entry of mine) {
      expect(Object.keys(entry).sort()).toEqual(['actionType', 'details', 'id', 'timestamp']);
      expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);
    }

    const theirs = (await (await other.request.get('/api/audit')).json()).filter((e) => e.details.startsWith(marker));
    await other.close();
    expect(theirs.map((e) => e.details)).toEqual([`${marker}-someone-else`]);
  });

  test('the Settings page shows the activity log and the action count', async ({ page, request }) => {
    insertLog(USERS.primary.email, 'SEND_EMAIL', `${marker}-settings-mail`, 3);
    insertLog(USERS.primary.email, 'PHOTOS_CREATE_SESSION', `${marker}-settings-photos`, 30);
    const total = (await (await request.get('/api/audit')).json()).length;

    await page.goto('/settings');
    const log = page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'Activity Log' }) });
    await expect(log.getByText(`${marker}-settings-mail`)).toBeVisible();
    await expect(log.getByText(`${marker}-settings-photos`)).toBeVisible();
    await expect(log.getByText('PHOTOS CREATE SESSION').first()).toBeVisible();
    await expect(log.getByText(`${total} ${total === 1 ? 'entry' : 'entries'}`)).toBeVisible();
    await expect(page.getByText(`${total} recorded`)).toBeVisible();
  });

  test('Settings shows the real profile from the database', async ({ page }) => {
    const [user] = rows(`select name, email, created_at from users where email = ${lit(USERS.primary.email)}`);
    await page.goto('/settings');
    const profile = page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'User Profile' }) });
    await expect(profile.getByRole('heading', { name: user.name })).toBeVisible();
    await expect(profile.getByText(user.email)).toBeVisible();
    const since = new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    await expect(profile.getByText(since)).toBeVisible();
  });

  test('the audit log is read-only over HTTP', async ({ request }) => {
    const headers = await csrfHeaders(request);
    for (const method of ['post', 'put', 'delete']) {
      const res = await request[method]('/api/audit', { data: { actionType: 'FORGED' }, headers });
      expect([404, 405]).toContain(res.status());
    }
    expect(rows(`select 1 as n from audit_logs where action_type = 'FORGED'`)).toHaveLength(0);
  });
});
