const { test, expect } = require('@playwright/test');
const { urls } = require('../../helpers/env');
const { csrfHeaders } = require('../../helpers/auth');
const { deleteWhatsAppData, runId } = require('../../helpers/db');

// WhatsApp endpoints used by the SPA, against the real backend and an unlinked bridge.

const PNG_SIGNATURE = '89504e470d0a1a0a';

test.describe('authenticated: WhatsApp with an unlinked bridge', () => {
  const run = runId();
  const chatIds = [];
  test.afterAll(() => deleteWhatsAppData(chatIds));

  test('sending is refused with 503 while the bridge is not connected', async ({ request }) => {
    const res = await request.post('/api/whatsapp/send', {
      data: { to: '491700000000@s.whatsapp.net', content: 'hello' },
      headers: await csrfHeaders(request),
    });
    expect(res.status()).toBe(503);
    expect(await res.json()).toMatchObject({ success: false });
  });

  test('sending validates its payload and needs the CSRF token', async ({ request }) => {
    expect((await request.post('/api/whatsapp/send', { data: { to: 'x' }, headers: await csrfHeaders(request) })).status()).toBe(400);
    expect((await request.post('/api/whatsapp/send', { data: { to: 'x', content: 'y' } })).status()).toBe(403);
  });

  test('stored chats are hidden while the bridge is not ready', async ({ request, playwright }) => {
    const chatId = `e2e-${run}-hidden@s.whatsapp.net`;
    chatIds.push(chatId);
    const bridge = await playwright.request.newContext({ baseURL: urls.backend });
    await bridge.post('/api/whatsapp/bridge/chat', { data: { chatId, name: 'Hidden' } });
    await bridge.post('/api/whatsapp/bridge/message', { data: { messageId: `${chatId}-1`, chatId, senderId: chatId, body: 'hi' } });
    await bridge.dispose();

    expect(await (await request.get('/api/whatsapp/chats')).json()).toEqual([]);
    expect(await (await request.get(`/api/whatsapp/chats/${encodeURIComponent(chatId)}/messages`)).json()).toEqual([]);
  });

  test('the status proxy matches the bridge', async ({ request, playwright }) => {
    const bridge = await playwright.request.newContext({ baseURL: urls.bridge });
    const direct = await (await bridge.get('/status')).json();
    await bridge.dispose();
    const proxied = await (await request.get('/api/whatsapp/bridge/status')).json();
    expect(proxied).toMatchObject({ authenticated: direct.authenticated, ready: direct.ready });
  });

  test('when the bridge has a QR code, the backend proxies the same PNG', async ({ request, playwright }) => {
    const bridge = await playwright.request.newContext({ baseURL: urls.bridge });
    const direct = await bridge.get('/qr');
    const directBody = await direct.body();
    await bridge.dispose();
    test.skip(direct.status() !== 200, `bridge has no QR right now (status ${direct.status()})`);

    const res = await request.get('/api/whatsapp/bridge/qr');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
    expect((await res.body()).subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
    expect(directBody.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
  });

  // BUG: while the bridge has no QR yet it answers 202 + JSON; WhatsAppBridgeController.getBridgeQr
  // treats any 2xx as success and serves that JSON as a 200 "image/png".
  test.fixme('the QR proxy never labels a non-PNG body as image/png', async ({ request }) => {
    const res = await request.get('/api/whatsapp/bridge/qr');
    if (res.status() === 200) {
      expect((await res.body()).subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
    }
  });
});
