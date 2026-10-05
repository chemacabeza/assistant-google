const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { csrfHeaders, stubGoogleBackedApis } = require('../../helpers/auth');
const { runId } = require('../../helpers/db');

// /api/config/env reads and rewrites the backend's .env. In the e2e stack that file is the
// throwaway e2e/fixtures/e2e.env (bind-mounted at /app/.env); every test restores it.

const ENV_FILE = path.join(__dirname, '..', '..', 'fixtures', 'e2e.env');
const KEYS = [
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'OPENAI_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY',
  'WHATSAPP_PHONE_NUMBER', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN',
];

const keyInput = (page, key) =>
  page.locator('div', { has: page.locator('label code', { hasText: new RegExp(`^${key}$`) }) }).last().locator('input');
const envLines = () => fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean);
// Writes in place (same inode) so the single-file bind mount keeps pointing at it.
const writeEnv = (content) => fs.writeFileSync(ENV_FILE, content);

test.describe('authenticated: configuration against the real .env', () => {
  let original;

  test.beforeAll(() => {
    original = fs.readFileSync(ENV_FILE, 'utf8');
  });
  test.afterEach(() => writeEnv(original));
  test.afterAll(() => writeEnv(original));

  test('the backend serves only the configurable keys from the file', async ({ request }) => {
    writeEnv('# comment\nOPENAI_API_KEY=sk-from-file\nPOSTGRES_PASSWORD=never-exposed\nSOMETHING_ELSE=x\n  GOOGLE_CLIENT_ID = spaced  \n');
    const res = await request.get('/api/config/env');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ OPENAI_API_KEY: 'sk-from-file', GOOGLE_CLIENT_ID: 'spaced' });
  });

  test('the page loads the values from the file and saves edits back to it', async ({ page, request }) => {
    await stubGoogleBackedApis(page);
    writeEnv('# managed by e2e\nWHATSAPP_PHONE_NUMBER=+49100\nUNRELATED=keep-me\n');
    const token = `verify-${runId()}`;

    await page.goto('/configuration');
    await expect(keyInput(page, 'WHATSAPP_PHONE_NUMBER')).toHaveValue('+49100');
    await expect(keyInput(page, 'OPENAI_API_KEY')).toHaveValue('');

    await keyInput(page, 'WHATSAPP_VERIFY_TOKEN').fill(token);
    await keyInput(page, 'WHATSAPP_PHONE_NUMBER').fill('+49200');
    const save = page.waitForResponse((r) => r.url().endsWith('/api/config/env') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save Configuration' }).click();
    expect(await (await save).json()).toEqual({ success: true, message: 'Configuration saved. Restart containers to apply changes.' });
    await expect(page.getByText('Configuration saved. Restart containers to apply changes.')).toBeVisible();

    // Existing lines are updated in place, unrelated lines and comments survive, the rest is appended.
    const lines = envLines();
    expect(lines.slice(0, 3)).toEqual(['# managed by e2e', 'WHATSAPP_PHONE_NUMBER=+49200', 'UNRELATED=keep-me']);
    expect(lines).toContain(`WHATSAPP_VERIFY_TOKEN=${token}`);
    for (const key of KEYS) expect(lines.filter((l) => l.startsWith(`${key}=`))).toHaveLength(1);

    expect(await (await request.get('/api/config/env')).json()).toMatchObject({ WHATSAPP_VERIFY_TOKEN: token, WHATSAPP_PHONE_NUMBER: '+49200' });
    await page.reload();
    await expect(keyInput(page, 'WHATSAPP_VERIFY_TOKEN')).toHaveValue(token);
  });

  test('keys outside the allow-list are never written', async ({ request }) => {
    writeEnv('');
    const res = await request.post('/api/config/env', {
      data: { OPENAI_API_KEY: 'sk-ok', POSTGRES_PASSWORD: 'pwned', SPRING_DATASOURCE_URL: 'jdbc:evil' },
      headers: await csrfHeaders(request),
    });
    expect((await res.json()).success).toBe(true);
    expect(envLines()).toEqual(['OPENAI_API_KEY=sk-ok']);
  });

  test('saving without the CSRF token is refused and leaves the file alone', async ({ request }) => {
    writeEnv('OPENAI_API_KEY=unchanged\n');
    const res = await request.post('/api/config/env', { data: { OPENAI_API_KEY: 'changed' } });
    expect(res.status()).toBe(403);
    expect(envLines()).toEqual(['OPENAI_API_KEY=unchanged']);
  });

  test('an anonymous caller can neither read nor write the configuration', async ({ playwright, baseURL }) => {
    writeEnv('OPENAI_API_KEY=secret\n');
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await anon.get('/api/config/env')).status()).toBe(401);
    await anon.get('/api/auth/profile'); // obtain an XSRF cookie, so the write fails on auth, not CSRF
    const res = await anon.post('/api/config/env', { data: { OPENAI_API_KEY: 'x' }, headers: await csrfHeaders(anon) });
    expect(res.status()).toBe(401);
    await anon.dispose();
    expect(envLines()).toEqual(['OPENAI_API_KEY=secret']);
  });

  // BUG: ConfigController writes values verbatim, so a value containing a newline injects
  // arbitrary extra lines (any variable, e.g. SPRING_DATASOURCE_URL) into the .env.
  test.fixme('a value with a newline cannot inject extra variables', async ({ request }) => {
    writeEnv('');
    await request.post('/api/config/env', {
      data: { OPENAI_API_KEY: 'sk-x\nSPRING_DATASOURCE_URL=jdbc:postgresql://attacker/db' },
      headers: await csrfHeaders(request),
    });
    expect(envLines().filter((l) => l.startsWith('SPRING_DATASOURCE_URL='))).toHaveLength(0);
  });
});
