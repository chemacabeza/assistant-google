const { test, expect } = require('@playwright/test');
const { GOOGLE_AUTH_URL } = require('../../helpers/env');

test.describe('frontend: nginx static serving', () => {
  let assetPath;

  test.beforeAll(async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({ baseURL });
    const html = await (await ctx.get('/')).text();
    assetPath = html.match(/\/assets\/[^"']+\.js/)?.[0];
    await ctx.dispose();
  });

  test('index.html is served and never cached', async ({ request }) => {
    const res = await request.get('/index.html');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
    expect(res.headers()['cache-control']).toBe('no-store');
  });

  test('hashed assets are cached for a year as immutable', async ({ request }) => {
    expect(assetPath, 'index.html should reference a hashed JS bundle').toBeTruthy();
    const res = await request.get(assetPath);
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toContain('immutable');
    expect(res.headers()['cache-control']).toContain('max-age=31536000');
  });

  test('JavaScript is gzip-compressed', async ({ request }) => {
    const res = await request.get(assetPath, { headers: { 'Accept-Encoding': 'gzip' } });
    expect(res.headers()['content-encoding']).toBe('gzip');
  });

  test('missing assets are a real 404, not the SPA shell', async ({ request }) => {
    const res = await request.get('/assets/does-not-exist.js');
    expect(res.status()).toBe(404);
  });

  test('client-side routes fall back to index.html', async ({ request }) => {
    const res = await request.get('/dashboard');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
    expect(await res.text()).toContain('<div id="root">');
  });

  test('security headers are present and the nginx version is hidden', async ({ request }) => {
    const h = (await request.get('/')).headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('SAMEORIGIN');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h.server).toBe('nginx');
  });

  test('security headers are also set on hashed assets', async ({ request }) => {
    const res = await request.get(assetPath);
    const h = res.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('SAMEORIGIN');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });
});

test.describe('frontend: reverse proxy to the backend', () => {
  test('/api is proxied (anonymous profile call reaches Spring Security)', async ({ request }) => {
    const res = await request.get('/api/auth/profile');
    expect(res.status()).toBe(401);
    expect(res.headers()['set-cookie'] ?? '').toContain('XSRF-TOKEN');
  });

  test('/oauth2 is proxied and redirects to Google', async ({ request }) => {
    const res = await request.get('/oauth2/authorization/google', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toContain(GOOGLE_AUTH_URL);
  });

  test('/login/oauth2 callback is proxied (a forged callback is not a 404 or 5xx)', async ({ request }) => {
    const res = await request.get('/login/oauth2/code/google?code=x&state=y', { maxRedirects: 0 });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
  });

  test('the proxy preserves CSRF behaviour for writes', async ({ request }) => {
    const res = await request.post('/api/assistant/ask', { data: { question: 'hi' } });
    expect(res.status()).toBe(403);
  });
});
