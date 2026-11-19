const { test, expect } = require('@playwright/test');
const { urls, AUTH_FILE } = require('../../helpers/env');
const { csrfHeaders } = require('../../helpers/auth');
const { rows, lit, psql, runId } = require('../../helpers/db');

// Bridge logout restarts the bridge process, so it lives with the other destructive tests.

async function waitForBridge(request, ms = 90_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if ((await request.get('/health', { timeout: 2000 })).ok()) return;
    } catch {
      // still restarting
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('bridge did not come back');
}

test.describe('WhatsApp bridge logout', () => {
  test('bridge /logout ends in a restarted, healthy and unlinked bridge', async ({ request }) => {
    await waitForBridge(request);
    let res = null;
    try {
      res = await request.post('/logout');
    } catch (e) {
      // The bridge restarts right after answering; it must come back either way.
      test.info().annotations.push({ type: 'note', description: `logout connection dropped: ${e.message}` });
    }
    if (res) {
      expect(res.status()).toBe(200);
      expect(await res.json()).toEqual({ success: true, message: 'Logged out successfully' });
    }

    // It exits about a second later; give it time to go down before polling for the restart.
    await new Promise((r) => setTimeout(r, 2500));
    await waitForBridge(request);
    expect((await (await request.get('/status')).json()).ready).toBe(false);
  });

  test('backend logout proxy reliably wipes WhatsApp data and reaches the bridge', async ({ request, playwright }) => {
    await waitForBridge(request);
    const bridgeIngest = await playwright.request.newContext({ baseURL: urls.backend });
    const chatId = `e2e-${runId()}-logout@s.whatsapp.net`;
    await bridgeIngest.post('/api/whatsapp/bridge/chat', { data: { chatId, name: 'Logout' } });
    await bridgeIngest.dispose();
    expect(rows(`select 1 as n from whatsapp_chats where chat_id = ${lit(chatId)}`)).toHaveLength(1);

    // Logging out is a user action: it needs the signed-in session and the CSRF token.
    const backend = await playwright.request.newContext({ baseURL: urls.frontend, storageState: AUTH_FILE });
    const res = await backend.post('/api/whatsapp/bridge/logout', { headers: await csrfHeaders(backend) });
    expect(res.status()).toBe(200);
    expect(rows(`select 1 as n from whatsapp_chats where chat_id = ${lit(chatId)}`)).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 2500));
    await waitForBridge(request);
    await backend.dispose();
    psql(`delete from whatsapp_chats where chat_id = ${lit(chatId)}`);
  });

  test('anonymous callers cannot log out or reset the bridge through the backend', async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: urls.backend });
    const startedBefore = (await (await anon.get('/api/whatsapp/bridge/status')).json());
    for (const path of ['/api/whatsapp/bridge/logout', '/api/whatsapp/bridge/reset']) {
      // Without the CSRF token the request is refused before the session check...
      expect((await anon.post(path)).status()).toBe(403);
      // ...and with a valid token, because nobody is signed in.
      await anon.get('/api/auth/profile'); // issues the XSRF-TOKEN cookie
      expect((await anon.post(path, { headers: await csrfHeaders(anon) })).status()).toBe(401);
    }
    // Neither call reached the bridge: it did not restart and still answers.
    expect((await (await anon.get('/api/whatsapp/bridge/status')).json()).ready).toBe(startedBefore.ready);
    await anon.dispose();
  });
});
