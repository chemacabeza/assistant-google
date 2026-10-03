const { test, expect } = require('@playwright/test');
const { urls } = require('../../helpers/env');
const { rows, lit, psql, runId } = require('../../helpers/db');

// These tests wipe data and restart the bridge, so they only run after every other project and
// only against the isolated e2e stack.

async function seedChat(backend, chatId) {
  await backend.post('/api/whatsapp/bridge/chat', { data: { chatId, name: 'To be wiped' } });
  await backend.post('/api/whatsapp/bridge/message', {
    data: { messageId: `${chatId}-m1`, chatId, senderId: chatId, body: 'bye', fromMe: false },
  });
  expect(rows(`select 1 as n from whatsapp_chats where chat_id = ${lit(chatId)}`)).toHaveLength(1);
  expect(rows(`select 1 as n from whatsapp_messages where chat_id = ${lit(chatId)}`)).toHaveLength(1);
}

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

test.describe('WhatsApp data purge', () => {
  test('backend clear-all removes every chat and message', async ({ playwright }) => {
    const backend = await playwright.request.newContext({ baseURL: urls.backend });
    const chatId = `e2e-${runId()}-clear@s.whatsapp.net`;
    await seedChat(backend, chatId);

    const res = await backend.post('/api/whatsapp/bridge/clear-all');
    expect(res.ok()).toBe(true);

    expect(rows('select 1 as n from whatsapp_chats')).toHaveLength(0);
    expect(rows('select 1 as n from whatsapp_messages')).toHaveLength(0);
    await backend.dispose();
  });

  test('bridge hard reset purges data, then the bridge restarts and serves again', async ({ request, playwright }) => {
    const backend = await playwright.request.newContext({ baseURL: urls.backend });
    const chatId = `e2e-${runId()}-reset@s.whatsapp.net`;
    await seedChat(backend, chatId);

    const res = await request.post('/reset');
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });

    expect(rows('select 1 as n from whatsapp_chats')).toHaveLength(0);

    await waitForBridge(request);
    expect((await (await request.get('/status')).json()).ready).toBe(false);

    await backend.dispose();
    psql(`delete from whatsapp_chats where chat_id = ${lit(chatId)}`);
  });
});
