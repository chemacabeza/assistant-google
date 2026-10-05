const { test, expect } = require('@playwright/test');
const { io } = require('socket.io-client');
const { urls } = require('../../helpers/env');

// Gaps in the bridge HTTP/Socket.IO coverage. As in api.spec.js, "while disconnected" checks are
// skipped if a phone happens to be linked.

const disconnected = async (request) => !(await (await request.get('/status')).json()).ready;

test.describe('whatsapp-bridge: HTTP API (extra)', () => {
  test('CORS preflight for POST /send is answered for any origin', async ({ request }) => {
    const res = await request.fetch('/send', {
      method: 'OPTIONS',
      headers: { Origin: 'http://example.test', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    expect(res.status()).toBe(204);
    expect(res.headers()['access-control-allow-origin']).toBe('*');
    expect(res.headers()['access-control-allow-methods']).toContain('POST');
  });

  test('GET /qr while no QR exists answers 202 with JSON, never an empty PNG', async ({ request }) => {
    const res = await request.get('/qr');
    test.skip(res.status() !== 202, `bridge is in another state (${res.status()})`);
    expect(res.headers()['content-type']).toContain('application/json');
    expect((await res.json()).message).toMatch(/not yet generated/i);
  });

  test('POST /send is refused while disconnected even without a body', async ({ request }) => {
    test.skip(!(await disconnected(request)), 'phone is linked');
    const res = await request.post('/send', { data: {} });
    expect(res.status()).toBe(503);
  });

  test('a URL-encoded chat id on /media and /avatar does not crash the bridge', async ({ request }) => {
    test.skip(!(await disconnected(request)), 'phone is linked');
    for (const path of ['/media/120363%40g.us/..%2F..%2Fetc%2Fpasswd', '/avatar/%2E%2E%2F%2E%2E%2Fetc%2Fpasswd']) {
      expect((await request.get(path)).status()).toBe(503);
    }
    expect((await request.get('/health')).status()).toBe(200);
  });

  test('wrong HTTP methods are 404s', async ({ request }) => {
    expect((await request.get('/send')).status()).toBe(404);
    expect((await request.get('/reset')).status()).toBe(404);
    expect((await request.get('/logout')).status()).toBe(404);
    expect((await request.post('/health')).status()).toBe(404);
  });

  test('responses are JSON with the right content type', async ({ request }) => {
    for (const path of ['/health', '/status']) {
      expect((await request.get(path)).headers()['content-type']).toContain('application/json');
    }
  });
});

test.describe('whatsapp-bridge: Socket.IO (extra)', () => {
  test('the HTTP long-polling transport works as a fallback', async () => {
    const socket = io(urls.bridge, { transports: ['polling'], reconnection: false, timeout: 8000 });
    try {
      const state = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no state over polling')), 8000);
        socket.once('state', (s) => { clearTimeout(timer); resolve(s); });
        socket.once('connect_error', (e) => { clearTimeout(timer); reject(e); });
      });
      expect(state).toMatchObject({ connected: expect.any(Boolean), hasQr: expect.any(Boolean) });
    } finally {
      socket.close();
    }
  });

  test('the socket accepts browser origins other than the frontend (CORS "*")', async ({ request }) => {
    const res = await request.get('/socket.io/?EIO=4&transport=polling', { headers: { Origin: 'http://elsewhere.test' } });
    expect(res.status()).toBe(200);
    expect(res.headers()['access-control-allow-origin']).toBeTruthy();
    expect(await res.text()).toMatch(/^0\{"sid":/);
  });

  test('a disconnected client is dropped cleanly and a new one can connect', async () => {
    const first = io(urls.bridge, { transports: ['websocket'], reconnection: false });
    await new Promise((resolve, reject) => { first.once('connect', resolve); first.once('connect_error', reject); });
    first.close();

    const second = io(urls.bridge, { transports: ['websocket'], reconnection: false });
    try {
      await new Promise((resolve, reject) => { second.once('state', resolve); second.once('connect_error', reject); });
    } finally {
      second.close();
    }
  });
});
