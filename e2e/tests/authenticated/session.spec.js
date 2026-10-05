const { test, expect } = require('@playwright/test');
const { urls, USERS } = require('../../helpers/env');
const { csrfHeaders, loginThroughGoogle, stubGoogleBackedApis } = require('../../helpers/auth');

// Session and CSRF behaviour with real sessions. Tests that end a session use their own login so
// the shared session from the "setup" project stays valid for everyone else.

const EMPTY = { cookies: [], origins: [] };
const cookie = async (context, name) => (await context.cookies()).find((c) => c.name === name);

async function freshSession(browser) {
  const context = await browser.newContext({ storageState: EMPTY });
  const page = await context.newPage();
  await loginThroughGoogle(page, USERS.primary);
  return { context, page };
}

test.describe('authenticated: session lifecycle', () => {
  test('"Sign Out" on the Settings page kills the server session, other sessions survive', async ({ browser, request, playwright }) => {
    const { context, page } = await freshSession(browser);
    const session = await cookie(context, 'JSESSIONID');
    await stubGoogleBackedApis(page);

    await page.goto('/settings');
    const logout = page.waitForResponse((r) => r.url().endsWith('/api/auth/logout'));
    await page.getByRole('button', { name: 'Sign Out' }).click();
    expect((await logout).status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);

    // The cookie is cleared in the browser and dead on the server.
    expect((await cookie(context, 'JSESSIONID'))?.value).not.toBe(session.value);
    const replay = await playwright.request.newContext({ baseURL: urls.frontend, storageState: EMPTY, extraHTTPHeaders: { Cookie: `JSESSIONID=${session.value}` } });
    expect((await replay.get('/api/auth/profile')).status()).toBe(401);
    expect((await replay.get('/api/templates')).status()).toBe(401);
    await replay.dispose();

    // Going back into the app requires signing in again.
    await page.goto('/templates');
    await expect(page).toHaveURL(/\/login$/);
    await context.close();

    // The shared session of the same user was not affected.
    expect((await request.get('/api/auth/profile')).status()).toBe(200);
  });

  test('logout without the CSRF token is refused and the session stays alive', async ({ browser }) => {
    const { context } = await freshSession(browser);
    const res = await context.request.post('/api/auth/logout');
    expect(res.status()).toBe(403);
    expect((await context.request.get('/api/auth/profile')).status()).toBe(200);

    const ok = await context.request.post('/api/auth/logout', { headers: await csrfHeaders(context.request) });
    expect(ok.status()).toBe(200);
    expect((await context.request.get('/api/auth/profile')).status()).toBe(401);
    await context.close();
  });

  test('the session id changes at login (no session fixation)', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: urls.frontend, storageState: EMPTY });
    const start = await ctx.get('/oauth2/authorization/google', { maxRedirects: 0 });
    const before = (await ctx.storageState()).cookies.find((c) => c.name === 'JSESSIONID');
    expect(before, 'the authorization request is kept in a pre-login session').toBeTruthy();

    const choose = new URL(`${urls.googleMock}/o/oauth2/v2/auth/choose`);
    new URL(start.headers().location).searchParams.forEach((v, k) => choose.searchParams.set(k, v));
    choose.searchParams.set('email', USERS.primary.email);
    const callback = (await ctx.get(choose.toString(), { maxRedirects: 0 })).headers().location;
    expect((await ctx.get(callback, { maxRedirects: 0 })).status()).toBe(302);

    const after = (await ctx.storageState()).cookies.find((c) => c.name === 'JSESSIONID');
    expect(after.value).not.toBe(before.value);
    expect((await ctx.get('/api/auth/profile')).status()).toBe(200);

    const fixated = await playwright.request.newContext({ baseURL: urls.frontend, storageState: EMPTY, extraHTTPHeaders: { Cookie: `JSESSIONID=${before.value}` } });
    expect((await fixated.get('/api/auth/profile')).status()).toBe(401);
    await fixated.dispose();
    await ctx.dispose();
  });
});

test.describe('authenticated: CSRF and CORS', () => {
  test('a lost XSRF cookie is re-issued on the next request and writes work again', async ({ browser }) => {
    const { context, page } = await freshSession(browser);
    await context.clearCookies({ name: 'XSRF-TOKEN' });
    expect(await cookie(context, 'XSRF-TOKEN')).toBeUndefined();

    // Without a token the write is refused...
    expect((await context.request.post('/api/templates', { data: { title: 'x', content: 'x' } })).status()).toBe(403);
    // ...but any request hands out a fresh token, and the SPA can carry on.
    await stubGoogleBackedApis(page);
    await page.goto('/dashboard');
    await expect.poll(async () => (await cookie(context, 'XSRF-TOKEN'))?.value).toBeTruthy();
    const res = await context.request.post('/api/auth/logout', { headers: await csrfHeaders(context.request) });
    expect(res.status()).toBe(200);
    await context.close();
  });

  test('a token from another session is rejected', async ({ browser, request }) => {
    const { context } = await freshSession(browser);
    const foreign = await csrfHeaders(context.request);
    await context.close();

    const own = await csrfHeaders(request);
    test.skip(foreign['X-XSRF-TOKEN'] === own['X-XSRF-TOKEN'], 'tokens happen to coincide');
    const res = await request.post('/api/templates', { data: { title: 'x', content: 'x' }, headers: foreign });
    expect(res.status()).toBe(403);
  });

  test('CORS preflight is only granted to the configured frontend origin', async ({ playwright }) => {
    const backend = await playwright.request.newContext({ baseURL: urls.backend, storageState: EMPTY });
    const preflight = (origin) =>
      backend.fetch('/api/templates', {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-xsrf-token' },
      });

    const good = await preflight(urls.frontend);
    expect(good.status()).toBe(200);
    expect(good.headers()['access-control-allow-origin']).toBe(urls.frontend);
    expect(good.headers()['access-control-allow-credentials']).toBe('true');

    const evil = await preflight('http://evil.example');
    expect(evil.status()).toBe(403);
    expect(evil.headers()['access-control-allow-origin']).toBeUndefined();
    await backend.dispose();
  });

  test('cross-origin reads do not get CORS headers for a foreign origin', async ({ request }) => {
    const res = await request.get(`${urls.backend}/api/auth/profile`, { headers: { Origin: 'http://evil.example' } });
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  });
});
