const { test, expect } = require('@playwright/test');

const PROTECTED_GET = [
  '/api/accounts',
  '/api/audit',
  '/api/calendar/events/abc',
  '/api/config/env',
  '/api/contacts/search?q=a',
  '/api/drive/files',
  '/api/gmail/messages',
  '/api/photos/session/abc',
  '/api/templates',
  '/api/whatsapp/chats',
  '/api/whatsapp/chats/abc@c.us/messages',
  '/api/whatsapp/messages/wa/abc',
  '/api/this-route-does-not-exist',
];

const PROTECTED_POST = [
  '/api/assistant/ask',
  '/api/config/env',
  '/api/photos/session',
  '/api/auth/logout',
];

test.describe('backend: authentication boundary', () => {
  test('profile endpoint answers 401 for anonymous users', async ({ request }) => {
    const res = await request.get('/api/auth/profile', { maxRedirects: 0 });
    expect(res.status()).toBe(401);
  });

  for (const path of PROTECTED_GET) {
    test(`GET ${path} requires authentication`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(401);
    });
  }
});

test.describe('backend: CSRF protection', () => {
  for (const path of PROTECTED_POST) {
    test(`POST ${path} without CSRF token is rejected with 403`, async ({ request }) => {
      const res = await request.post(path, { data: {}, maxRedirects: 0 });
      expect(res.status()).toBe(403);
    });
  }

  test('a CSRF cookie is issued and, when echoed back, the request reaches the auth check', async ({ request }) => {
    await request.get('/api/auth/profile');
    const { cookies } = await request.storageState();
    const xsrf = cookies.find((c) => c.name === 'XSRF-TOKEN');
    expect(xsrf, 'XSRF-TOKEN cookie should be set').toBeTruthy();

    const res = await request.post('/api/assistant/ask', {
      data: { question: 'hello' },
      headers: { 'X-XSRF-TOKEN': xsrf.value },
      maxRedirects: 0,
    });
    // CSRF passed; the request is now stopped because nobody is logged in.
    expect(res.status()).toBe(401);
  });

  test('a wrong CSRF token is rejected', async ({ request }) => {
    await request.get('/api/auth/profile');
    const res = await request.post('/api/assistant/ask', {
      data: { question: 'hello' },
      headers: { 'X-XSRF-TOKEN': 'not-the-real-token' },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(403);
  });
});
