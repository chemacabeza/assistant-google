const { test, expect } = require('@playwright/test');
const { USERS } = require('../../helpers/env');
const { stubGoogleBackedApis } = require('../../helpers/auth');
const { psql, rows, lit, runId } = require('../../helpers/db');

// Custom answers driven through the real UI against the real backend and database.
// Templates are scheduled far in the future so the dispatcher never tries to mail them.

const card = (page, title) => page.locator('div.rounded-xl.border-gray-200', { has: page.getByRole('heading', { name: title, exact: true }) });
const modal = (page) => page.locator('form', { has: page.getByPlaceholder('e.g., Follow up after meeting') });
const templateRow = (title) =>
  rows(`select t.id, t.title, t.content, t.category, t.from_email, t.target_email, t.send_at, t.status, u.email as owner
        from custom_answer_templates t join users u on u.id = t.user_id where t.title = ${lit(title)}`);

test.describe('authenticated UI: custom answers persist to the database', () => {
  const prefix = `e2e-${runId()}-tpl`;

  test.beforeEach(async ({ page }) => stubGoogleBackedApis(page)); // /api/contacts would call Google
  test.afterAll(() => psql(`delete from custom_answer_templates where title like ${lit(`${prefix}%`)}`));

  test('create, edit and delete a template through the UI', async ({ page, context }) => {
    const title = `${prefix}-crud`;
    await page.goto('/templates');
    await page.getByRole('button', { name: 'New Template' }).click();

    const form = modal(page);
    const from = await form.locator('select').inputValue();
    expect(from).toMatch(/@/);
    await form.getByPlaceholder('e.g., Follow up after meeting').fill(title);
    await form.getByPlaceholder('recipient@example.com').fill('recipient@example.test');
    await form.locator('input[type="date"]').fill('2099-05-06');
    await form.locator('input[type="time"]').fill('07:08');
    await form.locator('textarea').fill('Grüße,\nthis was saved through the UI 🚀');

    const post = page.waitForResponse((r) => r.url().endsWith('/api/templates') && r.request().method() === 'POST');
    await form.getByRole('button', { name: 'Save Template' }).click();
    const created = await post;
    expect(created.status()).toBe(200);

    // The SPA sent the CSRF token from the cookie, as Spring Security expects.
    const xsrf = (await context.cookies()).find((c) => c.name === 'XSRF-TOKEN');
    expect(created.request().headers()['x-xsrf-token']).toBe(xsrf.value);

    await expect(card(page, title).getByText('To: recipient@example.test')).toBeVisible();
    await expect(card(page, title).getByText('Pending')).toBeVisible();
    const [row] = templateRow(title);
    expect(row).toMatchObject({
      content: 'Grüße,\nthis was saved through the UI 🚀',
      category: 'General',
      from_email: from,
      target_email: 'recipient@example.test',
      send_at: '2099-05-06T07:08:00',
      status: 'PENDING',
      owner: USERS.primary.email,
    });

    // Reload: the card comes back from the database, not from client state.
    await page.reload();
    await card(page, title).getByRole('button', { name: 'Edit' }).click();
    await expect(form.getByPlaceholder('e.g., Follow up after meeting')).toHaveValue(title);
    await expect(form.locator('input[type="date"]')).toHaveValue('2099-05-06');
    await expect(form.locator('input[type="time"]')).toHaveValue('07:08');
    await form.getByPlaceholder('e.g., Follow up after meeting').fill(`${title}-renamed`);
    await form.locator('input[type="time"]').fill('19:30');
    const put = page.waitForResponse((r) => r.url().endsWith(`/api/templates/${row.id}`) && r.request().method() === 'PUT');
    await form.getByRole('button', { name: 'Save Template' }).click();
    expect((await put).status()).toBe(200);

    await expect(card(page, `${title}-renamed`)).toBeVisible();
    expect(rows(`select title, send_at from custom_answer_templates where id = ${row.id}`)).toEqual([
      { title: `${title}-renamed`, send_at: '2099-05-06T19:30:00' },
    ]);

    page.once('dialog', (d) => d.accept());
    const del = page.waitForResponse((r) => r.url().endsWith(`/api/templates/${row.id}`) && r.request().method() === 'DELETE');
    await card(page, `${title}-renamed`).getByRole('button', { name: 'Delete' }).click();
    expect((await del).status()).toBe(200);
    await expect(card(page, `${title}-renamed`)).toHaveCount(0);
    expect(rows(`select 1 as n from custom_answer_templates where id = ${row.id}`)).toHaveLength(0);
  });

  test('cancelling the delete confirmation keeps the template', async ({ page, request }) => {
    const title = `${prefix}-keep`;
    await page.goto('/templates');
    await page.getByRole('button', { name: 'New Template' }).click();
    const form = modal(page);
    await form.getByPlaceholder('e.g., Follow up after meeting').fill(title);
    await form.getByPlaceholder('recipient@example.com').fill('keep@example.test');
    await form.locator('input[type="date"]').fill('2099-01-01');
    await form.locator('input[type="time"]').fill('09:00');
    await form.locator('textarea').fill('keep me');
    await form.getByRole('button', { name: 'Save Template' }).click();
    await expect(card(page, title)).toBeVisible();

    page.once('dialog', (d) => d.dismiss());
    await card(page, title).getByRole('button', { name: 'Delete' }).click();
    await page.reload();
    await expect(card(page, title)).toBeVisible();
    expect(templateRow(title)).toHaveLength(1);

    const listed = await (await request.get('/api/templates')).json();
    expect(listed.map((t) => t.title)).toContain(title);
  });

  test('a template written directly to the database shows up with its status', async ({ page }) => {
    const mine = `${prefix}-db-mine`;
    psql(`insert into custom_answer_templates (user_id, title, content, category, status, send_at)
          select id, ${lit(mine)}, 'from the database', 'e2e', 'SENT', '2099-01-01T00:00:00' from users where email = ${lit(USERS.primary.email)}`);

    await page.goto('/templates');
    await expect(card(page, mine).getByText('Sent', { exact: true })).toBeVisible();
    await expect(card(page, mine).getByText('from the database')).toBeVisible();
  });
});
