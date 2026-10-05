const { test, expect, DATA } = require('../../helpers/api-mocks');

const card = (page, title) => page.locator('div.rounded-xl.border-gray-200', { has: page.getByRole('heading', { name: title, exact: true }) });
const modal = (page) => page.locator('form', { has: page.getByPlaceholder('e.g., Follow up after meeting') });

/** Stateful in-memory templates backend, so the list reflects creates/updates/deletes. */
function templatesBackend(api, initial = DATA.TEMPLATES) {
  let items = JSON.parse(JSON.stringify(initial));
  let nextId = 500;
  api.on('GET', '/api/templates', () => ({ json: items }));
  api.on('POST', '/api/templates', ({ body }) => {
    const created = { ...body, id: nextId++, status: 'PENDING' };
    items = [created, ...items];
    return { json: created };
  });
  api.on('PUT', /^\/api\/templates\/(\d+)$/, ({ body, params }) => {
    items = items.map((t) => (t.id === Number(params[0]) ? { ...t, ...body } : t));
    return { json: items.find((t) => t.id === Number(params[0])) };
  });
  api.on('DELETE', /^\/api\/templates\/(\d+)$/, ({ params }) => {
    items = items.filter((t) => t.id !== Number(params[0]));
    return { status: 200, body: '' };
  });
  return { get items() { return items; } };
}

test.describe('ui: custom answers / scheduled emails', () => {
  test('lists templates with status, recipients and schedule', async ({ page }) => {
    await page.goto('/templates');

    const follow = card(page, 'Follow up');
    await expect(follow.getByText('Pending')).toBeVisible();
    await expect(follow.getByText(`From: ${DATA.USER.email}`)).toBeVisible();
    await expect(follow.getByText('To: alice@example.com')).toBeVisible();
    await expect(follow.getByText(/^Scheduled: /)).toBeVisible();
    await expect(follow.getByText('thanks for your time today.')).toBeVisible();

    await expect(card(page, 'Invoice sent').getByText('Sent', { exact: true })).toBeVisible();
    await expect(card(page, 'Bounced').getByText('Failed', { exact: true })).toBeVisible();
  });

  test('create: the form posts the template with its schedule and the list updates', async ({ page, api }) => {
    const backend = templatesBackend(api);
    await page.goto('/templates');
    await page.getByRole('button', { name: 'New Template' }).click();
    await expect(page.getByRole('heading', { name: 'New Template' })).toBeVisible();

    const form = modal(page);
    await expect(form.locator('select')).toHaveValue(DATA.ACCOUNTS[0].email);
    await form.locator('select').selectOption('work@example.com');
    await form.getByPlaceholder('e.g., Follow up after meeting').fill('Weekly report');
    await form.getByPlaceholder('recipient@example.com').fill('boss@example.com');
    await form.locator('input[type="date"]').fill('2099-03-04');
    await form.locator('input[type="time"]').fill('07:45');
    await form.locator('textarea').fill('Hello boss,\nhere is the report.');

    const post = api.waitForCall('POST', '/api/templates');
    await form.getByRole('button', { name: 'Save Template' }).click();
    const call = await post;

    expect(call.body).toMatchObject({
      id: null,
      title: 'Weekly report',
      content: 'Hello boss,\nhere is the report.',
      category: 'General',
      fromEmail: 'work@example.com',
      targetEmail: 'boss@example.com',
      sendAt: '2099-03-04T07:45:00',
    });
    await expect(page.getByRole('heading', { name: 'New Template' })).toHaveCount(0);
    await expect(card(page, 'Weekly report').getByText('To: boss@example.com')).toBeVisible();
    expect(backend.items).toHaveLength(DATA.TEMPLATES.length + 1);
  });

  test('edit: the form is pre-filled and saving sends a PUT for that id', async ({ page, api }) => {
    templatesBackend(api);
    await page.goto('/templates');
    await card(page, 'Follow up').getByRole('button', { name: 'Edit' }).click();

    const form = modal(page);
    await expect(page.getByRole('heading', { name: 'Edit Template' })).toBeVisible();
    await expect(form.getByPlaceholder('e.g., Follow up after meeting')).toHaveValue('Follow up');
    await expect(form.getByPlaceholder('recipient@example.com')).toHaveValue('alice@example.com');
    await expect(form.locator('input[type="date"]')).toHaveValue('2099-01-02');
    await expect(form.locator('input[type="time"]')).toHaveValue('08:30');

    await form.getByPlaceholder('e.g., Follow up after meeting').fill('Follow up (v2)');
    const put = api.waitForCall('PUT', '/api/templates/11');
    await form.getByRole('button', { name: 'Save Template' }).click();
    const call = await put;

    expect(call.body).toMatchObject({ id: 11, title: 'Follow up (v2)', sendAt: '2099-01-02T08:30:00', targetEmail: 'alice@example.com' });
    await expect(card(page, 'Follow up (v2)')).toBeVisible();
    await expect(card(page, 'Follow up')).toHaveCount(0);
  });

  test('delete asks for confirmation and removes the card', async ({ page, api, dialogs }) => {
    templatesBackend(api);
    await page.goto('/templates');

    dialogs.answer = false;
    await card(page, 'Bounced').getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toMatchObject({ type: 'confirm', message: 'Delete this template?' });
    expect(api.callsTo('DELETE', /^\/api\/templates\/\d+$/)).toHaveLength(0);

    dialogs.answer = true;
    const del = api.waitForCall('DELETE', '/api/templates/13');
    await card(page, 'Bounced').getByRole('button', { name: 'Delete' }).click();
    await del;
    await expect(card(page, 'Bounced')).toHaveCount(0);
    await expect(card(page, 'Follow up')).toBeVisible();
  });

  test('the recipient field suggests contacts', async ({ page, api }) => {
    await page.goto('/templates');
    await page.getByRole('button', { name: 'New Template' }).click();
    const target = modal(page).getByPlaceholder('recipient@example.com');
    await target.fill('bob');
    await expect(page.getByText('Bob Jones')).toBeVisible();
    await expect(page.getByText('Alice Smith')).toHaveCount(0);
    await page.getByText('Bob Jones').click();
    await expect(target).toHaveValue('bob@example.com');
    expect(api.callsTo('GET', '/api/contacts')).toHaveLength(1);
  });

  test('a contacts failure only disables suggestions', async ({ page, api }) => {
    api.fail('GET', '/api/contacts', 500);
    await page.goto('/templates');
    await page.getByRole('button', { name: 'New Template' }).click();
    await modal(page).getByPlaceholder('recipient@example.com').fill('a');
    await expect(page.getByText('Alice Smith')).toHaveCount(0);
    await expect(modal(page)).toBeVisible();
  });

  test('missing required fields block the save', async ({ page, api }) => {
    await page.goto('/templates');
    await page.getByRole('button', { name: 'New Template' }).click();
    await modal(page).getByPlaceholder('e.g., Follow up after meeting').fill('Incomplete');
    await modal(page).getByRole('button', { name: 'Save Template' }).click();
    await expect(page.getByRole('heading', { name: 'New Template' })).toBeVisible();
    expect(api.callsTo('POST', '/api/templates')).toHaveLength(0);
  });

  test('a failed save keeps the dialog open', async ({ page, api }) => {
    api.fail('POST', '/api/templates', 500);
    await page.goto('/templates');
    await page.getByRole('button', { name: 'New Template' }).click();
    const form = modal(page);
    await form.getByPlaceholder('e.g., Follow up after meeting').fill('Doomed');
    await form.getByPlaceholder('recipient@example.com').fill('x@example.com');
    await form.locator('input[type="date"]').fill('2099-01-01');
    await form.locator('input[type="time"]').fill('10:00');
    await form.locator('textarea').fill('body');
    const post = api.waitForCall('POST', '/api/templates');
    await form.getByRole('button', { name: 'Save Template' }).click();
    await post;
    await expect(form.getByRole('button', { name: 'Save Template' })).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'New Template' })).toBeVisible();
  });

  test('the close icon discards the dialog without saving', async ({ page, api }) => {
    await page.goto('/templates');
    await page.getByRole('button', { name: 'New Template' }).click();
    await page.getByRole('heading', { name: 'New Template' }).locator('xpath=..').getByRole('button').click();
    await expect(page.getByRole('heading', { name: 'New Template' })).toHaveCount(0);
    expect(api.callsTo('POST', '/api/templates')).toHaveLength(0);
  });

  test('no templates shows the empty state, whose button opens the form', async ({ page, api }) => {
    api.on('GET', '/api/templates', { json: [] });
    await page.goto('/templates');
    await expect(page.getByText('No templates yet')).toBeVisible();
    await page.getByRole('button', { name: 'Create your first template' }).click();
    await expect(page.getByRole('heading', { name: 'New Template' })).toBeVisible();
  });

  test('a templates outage ends in the empty state instead of a crash', async ({ page, api }) => {
    api.fail('GET', '/api/templates', 500);
    await page.goto('/templates');
    await expect(page.getByText('No templates yet')).toBeVisible({ timeout: 20_000 });
  });

  // BUG: with no linked accounts the "From" select shows the user's address, but the form state
  // stays empty, so the template is saved with fromEmail "" instead of the address shown.
  test.fixme('without linked accounts the template is sent from the signed-in address', async ({ page, api }) => {
    api.on('GET', '/api/accounts', { json: [] });
    await page.goto('/templates');
    await page.getByRole('button', { name: 'New Template' }).click();
    const form = modal(page);
    await form.getByPlaceholder('e.g., Follow up after meeting').fill('Solo');
    await form.getByPlaceholder('recipient@example.com').fill('x@example.com');
    await form.locator('input[type="date"]').fill('2099-01-01');
    await form.locator('input[type="time"]').fill('10:00');
    await form.locator('textarea').fill('body');
    const post = api.waitForCall('POST', '/api/templates');
    await form.getByRole('button', { name: 'Save Template' }).click();
    expect((await post).body.fromEmail).toBe(DATA.USER.email);
  });
});
