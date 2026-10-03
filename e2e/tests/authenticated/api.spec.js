const { test, expect } = require('@playwright/test');
const { urls, USERS } = require('../../helpers/env');
const { csrfHeaders, loginThroughGoogle } = require('../../helpers/auth');
const { psql, rows, lit, deleteWhatsAppData, runId } = require('../../helpers/db');

// Runs with the session saved by the "setup" project (signed in as the primary user).

test.describe('authenticated API (real backend + database)', () => {
  const run = runId();
  const prefix = `e2e-${run}`;
  const chatIds = [];

  test.afterAll(() => {
    psql(`delete from custom_answer_templates where title like ${lit(`${prefix}%`)}`);
    deleteWhatsAppData(chatIds);
  });

  test('profile returns the signed-in user', async ({ request }) => {
    const res = await request.get('/api/auth/profile');
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ email: USERS.primary.email, name: USERS.primary.name });
  });

  for (const path of ['/api/templates', '/api/accounts', '/api/audit', '/api/whatsapp/chats', '/api/config/env']) {
    test(`GET ${path} is now allowed`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('application/json');
    });
  }

  test.describe('custom answer templates', () => {
    const newTemplate = (suffix) => ({ title: `${prefix}-${suffix}`, content: 'Hello {name}', category: 'e2e' });

    test('create, list, update and delete', async ({ request }) => {
      const headers = await csrfHeaders(request);

      const created = await request.post('/api/templates', { data: newTemplate('crud'), headers });
      expect(created.status()).toBe(200);
      const template = await created.json();
      expect(template).toMatchObject({ title: `${prefix}-crud`, content: 'Hello {name}', status: 'PENDING' });
      expect(template.id).toBeGreaterThan(0);

      const listed = await (await request.get('/api/templates')).json();
      expect(listed.map((t) => t.id)).toContain(template.id);

      const updated = await request.put(`/api/templates/${template.id}`, {
        data: { ...newTemplate('crud'), title: `${prefix}-crud-renamed`, content: 'Changed' },
        headers,
      });
      expect(updated.status()).toBe(200);
      expect(rows(`select title, content from custom_answer_templates where id = ${template.id}`)).toEqual([
        { title: `${prefix}-crud-renamed`, content: 'Changed' },
      ]);

      expect((await request.delete(`/api/templates/${template.id}`, { headers })).status()).toBe(200);
      expect(rows(`select 1 as n from custom_answer_templates where id = ${template.id}`)).toHaveLength(0);
    });

    test('a signed-in user still needs the CSRF token to write', async ({ request }) => {
      const res = await request.post('/api/templates', { data: newTemplate('csrf') });
      expect(res.status()).toBe(403);
      expect(rows(`select 1 as n from custom_answer_templates where title = ${lit(`${prefix}-csrf`)}`)).toHaveLength(0);
    });

    test("one user cannot read, change or delete another user's templates", async ({ request, browser }) => {
      const headers = await csrfHeaders(request);
      const mine = await (await request.post('/api/templates', { data: newTemplate('private'), headers })).json();

      // A second, genuinely separate session. Without the empty storageState the new context would
      // inherit the primary user's cookies and the login would take over that same server session.
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();
      await loginThroughGoogle(page, USERS.second);
      const other = context.request;
      const otherHeaders = await csrfHeaders(other);

      const visible = await (await other.get('/api/templates')).json();
      expect(visible.map((t) => t.id)).not.toContain(mine.id);

      const put = await other.put(`/api/templates/${mine.id}`, {
        data: { ...newTemplate('private'), title: `${prefix}-hijacked` },
        headers: otherHeaders,
      });
      expect(put.ok()).toBe(false);
      const del = await other.delete(`/api/templates/${mine.id}`, { headers: otherHeaders });
      expect(del.ok()).toBe(false);
      await context.close();

      expect(rows(`select title from custom_answer_templates where id = ${mine.id}`)).toEqual([{ title: `${prefix}-private` }]);
    });
  });

  test.describe('WhatsApp data behind the login', () => {
    test('a message ingested by the bridge can be read back by the signed-in user', async ({ request, playwright }) => {
      const chatId = `${prefix}-read@s.whatsapp.net`;
      chatIds.push(chatId);
      const waId = `${prefix}-wa-1`;

      // The bridge endpoints are unauthenticated by design; the read side is not.
      const bridge = await playwright.request.newContext({ baseURL: urls.backend });
      await bridge.post('/api/whatsapp/bridge/chat', { data: { chatId, name: 'Reader' } });
      await bridge.post('/api/whatsapp/bridge/message', {
        data: { messageId: waId, chatId, senderId: chatId, body: 'read me', fromMe: false },
      });
      await bridge.dispose();

      const res = await request.get(`/api/whatsapp/messages/wa/${waId}`);
      expect(res.status()).toBe(200);
      expect(await res.json()).toMatchObject({ chatId, content: 'read me', direction: 'INCOMING' });

      // newContext() inherits the project's storageState, so anonymous means "explicitly empty".
      const anonymous = await playwright.request.newContext({
        baseURL: urls.frontend,
        storageState: { cookies: [], origins: [] },
      });
      expect((await anonymous.get(`/api/whatsapp/messages/wa/${waId}`)).status()).toBe(401);
      await anonymous.dispose();
    });

    test('an unknown message id is a 404 for a signed-in user', async ({ request }) => {
      expect((await request.get(`/api/whatsapp/messages/wa/${prefix}-missing`)).status()).toBe(404);
    });
  });
});
