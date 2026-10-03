const { test, expect } = require('@playwright/test');
const { urls, USERS, GOOGLE_AUTH_URL } = require('../../helpers/env');
const { loginThroughGoogle, mockStats } = require('../../helpers/auth');
const { rows, lit } = require('../../helpers/db');

// The whole authorization-code flow, driven through the real UI against the mock Google provider:
// browser -> nginx -> Spring Security -> mock Google -> callback -> session -> dashboard.

test.describe('Google OAuth2 login flow', () => {
  test('"Continue with Google" opens the provider with the right client, scopes and callback', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /continue with google/i }).click();

    await expect(page).toHaveURL(new RegExp(`^${GOOGLE_AUTH_URL.replace(/[.]/g, '\\.')}`));
    const params = new URL(page.url()).searchParams;
    expect(params.get('client_id')).toBe('e2e-client-id');
    expect(params.get('response_type')).toBe('code');
    expect(params.get('redirect_uri')).toBe('http://127.0.0.1:15173/login/oauth2/code/google');
    expect(params.get('scope')).toContain('https://www.googleapis.com/auth/gmail.readonly');
    await expect(page.getByRole('link', { name: /e2e@example\.com/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /second@example\.com/ })).toBeVisible();
  });

  test('signing in lands on the dashboard as the chosen account', async ({ page }) => {
    await loginThroughGoogle(page, USERS.primary);

    const profile = await page.request.get('/api/auth/profile');
    expect(profile.status()).toBe(200);
    expect(await profile.json()).toMatchObject({ email: USERS.primary.email, name: USERS.primary.name });
  });

  test('the backend completes the code exchange with the provider server-to-server', async ({ page, request }) => {
    const before = await mockStats(request);

    await loginThroughGoogle(page, USERS.primary);

    const after = await mockStats(request);
    expect(after.authorizations).toBe(before.authorizations + 1);
    expect(after.tokenExchanges).toBe(before.tokenExchanges + 1);
    expect(after.userinfoCalls).toBeGreaterThan(before.userinfoCalls);
  });

  test('the session cookie is HttpOnly', async ({ page }) => {
    await loginThroughGoogle(page, USERS.primary);

    const session = (await page.context().cookies()).find((c) => c.name === 'JSESSIONID');
    expect(session, 'JSESSIONID cookie').toBeTruthy();
    expect(session.httpOnly).toBe(true);
  });

  test('the user is stored once, even after several sign-ins', async ({ browser }) => {
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext();
      await loginThroughGoogle(await context.newPage(), USERS.primary);
      await context.close();
    }

    const users = rows(`select email, name, picture from users where email = ${lit(USERS.primary.email)}`);
    expect(users).toEqual([{ email: USERS.primary.email, name: USERS.primary.name, picture: 'https://example.test/e2e.png' }]);
  });

  test('OAuth tokens are stored encrypted at rest', async ({ page, request }) => {
    await loginThroughGoogle(page, USERS.primary);
    const { lastAccessToken, lastRefreshToken } = await mockStats(request);

    const [token] = rows(`select t.access_token, t.refresh_token, t.scope
                          from oauth_tokens t join users u on u.id = t.user_id
                          where u.email = ${lit(USERS.primary.email)}`);

    expect(token.access_token).toBeTruthy();
    expect(token.access_token).not.toContain(lastAccessToken);
    expect(token.access_token).not.toContain('ya29');
    expect(token.refresh_token).toBeTruthy();
    expect(token.refresh_token).not.toContain(lastRefreshToken);
    expect(token.scope).toContain('gmail.readonly');
  });

  test('a second account gets its own identity', async ({ page }) => {
    await loginThroughGoogle(page, USERS.second);

    const profile = await (await page.request.get('/api/auth/profile')).json();
    expect(profile).toMatchObject({ email: USERS.second.email, name: USERS.second.name });
  });

  test('declining consent returns to the login page without a session', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /continue with google/i }).click();
    await page.getByRole('link', { name: 'Cancel' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    expect((await page.request.get('/api/auth/profile')).status()).toBe(401);
  });

  test('a callback with a forged state is rejected', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: urls.frontend });

    // Start a real flow, pick an account at the provider, then tamper with the state on the way back.
    const start = await ctx.get('/oauth2/authorization/google', { maxRedirects: 0 });
    const chooser = new URL(start.headers().location);
    const choose = new URL(`${urls.googleMock}/o/oauth2/v2/auth/choose`);
    chooser.searchParams.forEach((v, k) => choose.searchParams.set(k, v));
    choose.searchParams.set('email', USERS.primary.email);

    const granted = await ctx.get(choose.toString(), { maxRedirects: 0 });
    const callback = new URL(granted.headers().location);
    callback.searchParams.set('state', 'forged-state');

    const res = await ctx.get(callback.toString(), { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    // Absolute redirects built by Spring must keep the public host:port that nginx received.
    expect(res.headers().location).toBe(`${urls.frontend}/login?error`);
    expect((await ctx.get('/api/auth/profile')).status()).toBe(401);
    await ctx.dispose();
  });

  test('the same callback works with the genuine state and is single-use', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: urls.frontend });
    const start = await ctx.get('/oauth2/authorization/google', { maxRedirects: 0 });
    const choose = new URL(`${urls.googleMock}/o/oauth2/v2/auth/choose`);
    new URL(start.headers().location).searchParams.forEach((v, k) => choose.searchParams.set(k, v));
    choose.searchParams.set('email', USERS.primary.email);
    const callback = (await ctx.get(choose.toString(), { maxRedirects: 0 })).headers().location;

    const first = await ctx.get(callback, { maxRedirects: 0 });
    expect(first.status()).toBe(302);
    expect(first.headers().location).toMatch(/\/dashboard$/);
    expect((await ctx.get('/api/auth/profile')).status()).toBe(200);

    // Replaying the same callback (same code, same state) must not log anybody in again.
    const replayCtx = await playwright.request.newContext({ baseURL: urls.frontend });
    const replay = await replayCtx.get(callback, { maxRedirects: 0 });
    expect(replay.headers().location ?? '').toBe(`${urls.frontend}/login?error`);
    expect((await replayCtx.get('/api/auth/profile')).status()).toBe(401);

    await ctx.dispose();
    await replayCtx.dispose();
  });
});

test.describe('logout', () => {
  test('ends the session on the server, not just in the browser', async ({ page, playwright }) => {
    await loginThroughGoogle(page, USERS.primary);
    const session = (await page.context().cookies()).find((c) => c.name === 'JSESSIONID');

    await page.getByTitle('Logout').click();
    await expect(page).toHaveURL(/\/login$/);

    // Protected pages bounce back to login...
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);

    // ...and the old session id is dead even if someone kept it.
    const replay = await playwright.request.newContext({
      baseURL: urls.frontend,
      extraHTTPHeaders: { Cookie: `JSESSIONID=${session.value}` },
    });
    expect((await replay.get('/api/auth/profile')).status()).toBe(401);
    await replay.dispose();
  });
});
