const { test, expect } = require('@playwright/test');
const { GOOGLE_CLIENT_ID, GOOGLE_AUTH_URL, OAUTH_REDIRECT_URI } = require('../../helpers/env');

test.describe('backend: Google OAuth2 login', () => {
  test('/api/auth/google/start redirects into the OAuth2 flow', async ({ request }) => {
    const res = await request.get('/api/auth/google/start', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toContain('/oauth2/authorization/google');
  });

  test('authorization endpoint redirects to Google with the configured client and scopes', async ({ request }) => {
    const res = await request.get('/oauth2/authorization/google', { maxRedirects: 0 });
    expect(res.status()).toBe(302);

    const location = new URL(res.headers().location);
    expect(location.origin + location.pathname).toBe(GOOGLE_AUTH_URL);

    const p = location.searchParams;
    expect(p.get('response_type')).toBe('code');
    expect(p.get('client_id')).toBe(GOOGLE_CLIENT_ID);
    expect(p.get('redirect_uri')).toBe(OAUTH_REDIRECT_URI);
    expect(p.get('state')).toBeTruthy();
    expect(p.get('nonce')).toBeTruthy();

    const scopes = (p.get('scope') || '').split(' ');
    for (const scope of [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/photoslibrary.readonly',
    ]) {
      expect(scopes, `scope ${scope}`).toContain(scope);
    }
  });

  test('every login attempt gets a fresh state value', async ({ playwright }) => {
    const a = await playwright.request.newContext();
    const b = await playwright.request.newContext();
    const url = `${test.info().project.use.baseURL}/oauth2/authorization/google`;
    const [ra, rb] = await Promise.all([a.get(url, { maxRedirects: 0 }), b.get(url, { maxRedirects: 0 })]);
    const stateA = new URL(ra.headers().location).searchParams.get('state');
    const stateB = new URL(rb.headers().location).searchParams.get('state');
    expect(stateA).not.toBe(stateB);
    await a.dispose();
    await b.dispose();
  });

  test('a forged callback does not create a session', async ({ request }) => {
    const res = await request.get('/login/oauth2/code/google?code=forged&state=forged', { maxRedirects: 0 });
    expect(res.status()).toBeLessThan(500);
    expect(res.status()).not.toBe(200);

    const profile = await request.get('/api/auth/profile', { maxRedirects: 0 });
    expect(profile.status()).toBe(401);
  });
});
