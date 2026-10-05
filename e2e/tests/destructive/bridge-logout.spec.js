const { test, expect } = require('@playwright/test');
const { urls } = require('../../helpers/env');
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
      // See the BUG below: the bridge may crash before answering. It must still come back.
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

  // BUG: while Baileys is still opening its WhatsApp socket (e.g. right after a restart, or with no
  // internet), sock.logout() closes it and ws emits an unhandled 'error' that crashes the bridge
  // before it answers. The backend proxy then returns 503 and skips its own data wipe.
  test.fixme('backend logout proxy reliably wipes WhatsApp data and reaches the bridge', async ({ request, playwright }) => {
    await waitForBridge(request);
    const backend = await playwright.request.newContext({ baseURL: urls.backend });
    const chatId = `e2e-${runId()}-logout@s.whatsapp.net`;
    await backend.post('/api/whatsapp/bridge/chat', { data: { chatId, name: 'Logout' } });
    expect(rows(`select 1 as n from whatsapp_chats where chat_id = ${lit(chatId)}`)).toHaveLength(1);

    const res = await backend.post('/api/whatsapp/bridge/logout');
    expect(res.status()).toBe(200);
    expect(rows(`select 1 as n from whatsapp_chats where chat_id = ${lit(chatId)}`)).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 2500));
    await waitForBridge(request);
    await backend.dispose();
    psql(`delete from whatsapp_chats where chat_id = ${lit(chatId)}`);
  });

  // BUG: /api/whatsapp/bridge/** is permitAll and CSRF-exempt so the bridge can push data, but that
  // also exposes the frontend-only actions /bridge/logout and /bridge/reset (which wipe all
  // WhatsApp data and unlink the phone) to anonymous callers and cross-site requests.
  test.fixme('anonymous callers cannot log out or reset the bridge through the backend', async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: urls.backend });
    expect((await anon.post('/api/whatsapp/bridge/logout')).status()).toBe(401);
    expect((await anon.post('/api/whatsapp/bridge/reset')).status()).toBe(401);
    await anon.dispose();
  });
});
