const { test, expect, DATA } = require('../../helpers/api-mocks');

const KEYS = [
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'OPENAI_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY',
  'WHATSAPP_PHONE_NUMBER', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN',
];

/** The input for an .env key (the label holds a <code>KEY</code>, the input sits in the next row). */
const keyInput = (page, key) =>
  page.locator('div', { has: page.locator('label code', { hasText: new RegExp(`^${key}$`) }) }).last().locator('input');
const keyToggle = (page, key) =>
  page.locator('div', { has: page.locator('label code', { hasText: new RegExp(`^${key}$`) }) }).last().getByRole('button');
const save = (page) => page.getByRole('button', { name: /Save Configuration|Saving|Saved/ });
const linked = (page) => page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'Linked Email Accounts' }) });

test.describe('ui: configuration', () => {
  test('loads the .env keys from the backend as masked fields', async ({ page }) => {
    await page.goto('/configuration');
    await expect(page.getByRole('heading', { name: 'Configuration', exact: true })).toBeVisible();

    for (const key of KEYS) {
      await expect(keyInput(page, key)).toHaveValue(DATA.CONFIG_ENV[key] ?? '');
      await expect(keyInput(page, key)).toHaveAttribute('type', 'password');
    }
    await expect(page.getByRole('textbox').first()).toHaveValue('Personal AI Assistant');
  });

  test('"Show" reveals a secret and "Hide" masks it again', async ({ page }) => {
    await page.goto('/configuration');
    const input = keyInput(page, 'OPENAI_API_KEY');
    await keyToggle(page, 'OPENAI_API_KEY').click();
    await expect(input).toHaveAttribute('type', 'text');
    await expect(keyToggle(page, 'OPENAI_API_KEY')).toHaveText('Hide');
    await keyToggle(page, 'OPENAI_API_KEY').click();
    await expect(input).toHaveAttribute('type', 'password');
  });

  test('saving posts every key and confirms; UI settings persist in localStorage', async ({ page, api }) => {
    await page.goto('/configuration');
    await expect(keyInput(page, 'OPENAI_API_KEY')).toHaveValue('sk-test-123');

    await page.getByPlaceholder('Personal AI Assistant').fill('My Assistant');
    await keyInput(page, 'OPENAI_API_KEY').fill('sk-new-456');
    await keyInput(page, 'WHATSAPP_PHONE_NUMBER').fill('+491700000000');

    const post = api.waitForCall('POST', '/api/config/env');
    await save(page).click();
    const call = await post;

    expect(call.body).toEqual({
      GOOGLE_CLIENT_ID: DATA.CONFIG_ENV.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: DATA.CONFIG_ENV.GOOGLE_CLIENT_SECRET,
      OPENAI_API_KEY: 'sk-new-456',
      VITE_GOOGLE_MAPS_API_KEY: '',
      WHATSAPP_PHONE_NUMBER: '+491700000000',
      WHATSAPP_ACCESS_TOKEN: '',
      WHATSAPP_PHONE_NUMBER_ID: '',
      WHATSAPP_VERIFY_TOKEN: DATA.CONFIG_ENV.WHATSAPP_VERIFY_TOKEN,
    });
    await expect(page.getByText('Configuration saved. Restart containers to apply changes.')).toBeVisible();
    await expect(save(page)).toHaveText(/Saved/);

    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('assistant_ui_config')))).toEqual({
      appName: 'My Assistant',
      emailInvitees: true,
    });
    await page.reload();
    await expect(page.getByPlaceholder('Personal AI Assistant')).toHaveValue('My Assistant');
  });

  test('the invitee toggle is saved locally', async ({ page }) => {
    await page.goto('/configuration');
    const toggle = page.getByText('Email Calendar Invitees', { exact: true }).locator('xpath=../..').getByRole('button');
    await expect(toggle.locator('svg')).toHaveClass(/lucide-toggle-right/);
    await toggle.click();
    await expect(toggle.locator('svg')).toHaveClass(/lucide-toggle-left/);
    await save(page).click();
    await expect.poll(async () => JSON.parse(await page.evaluate(() => localStorage.getItem('assistant_ui_config')))?.emailInvitees).toBe(false);
  });

  test('a save the backend reports as failed shows its message', async ({ page, api }) => {
    api.on('POST', '/api/config/env', { json: { success: false, message: 'Failed to save: read-only file system' } });
    await page.goto('/configuration');
    await save(page).click();
    await expect(page.getByText('Failed to save: read-only file system')).toBeVisible();
    await expect(save(page)).toHaveText('Save Configuration');
  });

  test('a server error while saving is reported', async ({ page, api }) => {
    api.fail('POST', '/api/config/env', 500, { message: 'disk full' });
    await page.goto('/configuration');
    await save(page).click();
    await expect(page.getByText('Error saving configuration: disk full')).toBeVisible();
    await expect(save(page)).toBeEnabled();
  });

  test('a load failure leaves empty fields instead of crashing', async ({ page, api }) => {
    api.fail('GET', '/api/config/env', 500);
    await page.goto('/configuration');
    await expect(keyInput(page, 'OPENAI_API_KEY')).toHaveValue('');
    await expect(save(page)).toBeEnabled();
  });

  test('shows the loading state until the .env arrives', async ({ page, api }) => {
    api.on('GET', '/api/config/env', { json: DATA.CONFIG_ENV, delay: 1500 });
    await page.goto('/configuration');
    await expect(page.getByText('Loading configuration from .env...')).toBeVisible();
    await expect(keyInput(page, 'GOOGLE_CLIENT_ID')).toHaveValue(DATA.CONFIG_ENV.GOOGLE_CLIENT_ID);
  });

  test('external resource links open in a new tab', async ({ page }) => {
    await page.goto('/configuration');
    const gmail = page.getByRole('link', { name: /^Gmail API/ });
    await expect(gmail).toHaveAttribute('href', 'https://console.cloud.google.com/apis/library/gmail.googleapis.com');
    await expect(gmail).toHaveAttribute('target', '_blank');
    await expect(gmail).toHaveAttribute('rel', /noopener/);
  });

  test.describe('linked accounts', () => {
    test('lists the linked accounts', async ({ page }) => {
      await page.goto('/configuration');
      for (const acc of DATA.ACCOUNTS) {
        await expect(linked(page).getByText(acc.email, { exact: true })).toBeVisible();
        await expect(linked(page).getByText(acc.name, { exact: true })).toBeVisible();
      }
    });

    test('adding an account posts it and refreshes the list', async ({ page, api }) => {
      let accounts = [...DATA.ACCOUNTS];
      api.on('GET', '/api/accounts', () => ({ json: accounts }));
      api.on('POST', '/api/accounts', ({ body }) => {
        accounts = [...accounts, { id: 3, ...body }];
        return { json: accounts.at(-1) };
      });
      await page.goto('/configuration');

      await linked(page).getByPlaceholder('e.g., secondary@gmail.com').fill('  new@example.com ');
      await linked(page).getByPlaceholder('e.g., Work Email').fill('Side project');
      const post = api.waitForCall('POST', '/api/accounts');
      await linked(page).getByRole('button', { name: 'Add Account' }).click();
      expect((await post).body).toEqual({ email: 'new@example.com', name: 'Side project' });

      await expect(linked(page).getByText('new@example.com', { exact: true })).toBeVisible();
      await expect(linked(page).getByPlaceholder('e.g., secondary@gmail.com')).toHaveValue('');
    });

    test('a nameless account gets a default display name', async ({ page, api }) => {
      await page.goto('/configuration');
      await linked(page).getByPlaceholder('e.g., secondary@gmail.com').fill('plain@example.com');
      const post = api.waitForCall('POST', '/api/accounts');
      await linked(page).getByRole('button', { name: 'Add Account' }).click();
      expect((await post).body).toEqual({ email: 'plain@example.com', name: 'Custom Account' });
    });

    test('a duplicate is rejected with the backend message', async ({ page, api }) => {
      api.on('POST', '/api/accounts', { status: 400, contentType: 'text/plain', body: 'Account with this email already exists' });
      await page.goto('/configuration');
      await linked(page).getByPlaceholder('e.g., secondary@gmail.com').fill(DATA.ACCOUNTS[1].email);
      await linked(page).getByRole('button', { name: 'Add Account' }).click();
      await expect(linked(page).getByText('Account with this email already exists')).toBeVisible();
    });

    test('removing an account asks first, then deletes it', async ({ page, api, dialogs }) => {
      let accounts = [...DATA.ACCOUNTS];
      api.on('GET', '/api/accounts', () => ({ json: accounts }));
      api.on('DELETE', /^\/api\/accounts\/(\d+)$/, ({ params }) => {
        accounts = accounts.filter((a) => a.id !== Number(params[0]));
        return { status: 200, body: '' };
      });
      await page.goto('/configuration');
      const row = linked(page).locator('div.group', { hasText: 'work@example.com' });

      dialogs.answer = false;
      await row.hover();
      await row.getByTitle('Remove Account').click();
      await expect.poll(() => dialogs.length).toBe(1);
      expect(api.callsTo('DELETE', /^\/api\/accounts\/\d+$/)).toHaveLength(0);

      dialogs.answer = true;
      const del = api.waitForCall('DELETE', '/api/accounts/2');
      await row.hover();
      await row.getByTitle('Remove Account').click();
      await del;
      await expect(linked(page).getByText('work@example.com')).toHaveCount(0);
    });

    test('no accounts shows the empty state', async ({ page, api }) => {
      api.on('GET', '/api/accounts', { json: [] });
      await page.goto('/configuration');
      await expect(linked(page).getByText('No linked accounts found.')).toBeVisible();
    });
  });
});
