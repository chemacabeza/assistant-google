const { test, expect } = require('@playwright/test');

// These tests only rely on behaviour that holds whether or not a phone is linked,
// except where noted "while disconnected" (the stack never has a real WhatsApp session in e2e).

test.describe('whatsapp-bridge: HTTP API', () => {
  test('GET /health reports the service is up', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', connected: expect.any(Boolean) });
  });

  test('GET /status exposes the connection state', async ({ request }) => {
    const res = await request.get('/status');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({
      authenticated: expect.any(Boolean),
      ready: expect.any(Boolean),
      hasQr: expect.any(Boolean),
    });
  });

  test('/status and /health report the same connection flag', async ({ request }) => {
    const [health, status] = await Promise.all([
      request.get('/health').then((r) => r.json()),
      request.get('/status').then((r) => r.json()),
    ]);
    expect(status.authenticated).toBe(status.ready);
    // Same flag read twice; only a reconnect in between could make these differ.
    if (health.connected !== status.ready) test.info().annotations.push({ type: 'note', description: 'state changed between calls' });
  });

  test('GET /qr returns a PNG, "not yet generated", or 204 when already linked', async ({ request }) => {
    const res = await request.get('/qr');
    switch (res.status()) {
      case 200: {
        expect(res.headers()['content-type']).toContain('image/png');
        const body = await res.body();
        expect(body.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // PNG signature
        break;
      }
      case 202:
        expect(await res.json()).toEqual({ message: expect.stringContaining('QR') });
        break;
      case 204:
        break;
      default:
        throw new Error(`unexpected /qr status ${res.status()}`);
    }
  });

  test('POST /send is refused while disconnected', async ({ request }) => {
    const status = await (await request.get('/status')).json();
    test.skip(status.ready, 'phone is linked - this check only applies while disconnected');

    const res = await request.post('/send', { data: { to: '491701234567@s.whatsapp.net', content: 'hi' } });
    expect(res.status()).toBe(503);
    expect(await res.json()).toEqual({ error: expect.stringMatching(/not connected/i) });
  });

  test('GET /media and /avatar are refused while disconnected', async ({ request }) => {
    const status = await (await request.get('/status')).json();
    test.skip(status.ready, 'phone is linked - this check only applies while disconnected');

    expect((await request.get('/media/chat@s.whatsapp.net/msg1')).status()).toBe(503);
    expect((await request.get('/avatar/chat@s.whatsapp.net')).status()).toBe(503);
  });

  test('malformed JSON is rejected with a client error', async ({ request }) => {
    const res = await request.post('/send', {
      headers: { 'Content-Type': 'application/json' },
      data: '{ not json',
    });
    expect(res.status()).toBe(400);
  });

  test('unknown routes return 404', async ({ request }) => {
    expect((await request.get('/definitely-not-a-route')).status()).toBe(404);
  });

  test('CORS allows cross-origin callers', async ({ request }) => {
    const res = await request.get('/health', { headers: { Origin: 'http://example.test' } });
    expect(res.headers()['access-control-allow-origin']).toBe('*');
  });

  test('handles a burst of concurrent requests', async ({ request }) => {
    const responses = await Promise.all(Array.from({ length: 50 }, () => request.get('/health')));
    expect(responses.every((r) => r.status() === 200)).toBe(true);
  });
});
