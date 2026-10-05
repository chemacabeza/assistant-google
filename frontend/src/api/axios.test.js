import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { mockLocation } from '../test/utils';
import { api } from './axios';

describe('api (axios instance)', () => {
  it('uses a relative base URL and sends cookies', () => {
    expect(api.defaults.baseURL).toBe('/');
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('resolves requests against the current origin', async () => {
    server.use(http.get('/api/ping', ({ request }) => HttpResponse.json({ url: request.url })));
    const res = await api.get('/api/ping');
    expect(res.data.url).toBe(`${window.location.origin}/api/ping`);
  });

  it('echoes the XSRF-TOKEN cookie in the X-XSRF-TOKEN header (Spring CookieCsrfTokenRepository)', async () => {
    document.cookie = 'XSRF-TOKEN=token-123; path=/';
    let header;
    server.use(http.post('/api/echo', ({ request }) => {
      header = request.headers.get('x-xsrf-token');
      return HttpResponse.json({});
    }));
    await api.post('/api/echo', { a: 1 });
    expect(header).toBe('token-123');
  });

  it('passes successful responses through untouched', async () => {
    server.use(http.get('/api/thing', () => HttpResponse.json({ ok: true })));
    const res = await api.get('/api/thing');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
  });

  it('rejects 401 responses with the original error and does not redirect by itself', async () => {
    const { assign, hrefSet } = mockLocation();
    server.use(http.get('/api/secret', () => new HttpResponse(null, { status: 401 })));

    const error = await api.get('/api/secret').catch((e) => e);
    expect(error.isAxiosError).toBe(true);
    expect(error.response.status).toBe(401);
    // Redirects are owned by ProtectedRoute / useAuthStore.logout, never by the interceptor,
    // so a 401 cannot trigger a second navigation racing the logout redirect.
    expect(assign).not.toHaveBeenCalled();
    expect(hrefSet).not.toHaveBeenCalled();
  });

  it('rejects other HTTP errors and network failures', async () => {
    server.use(
      http.get('/api/boom', () => HttpResponse.json({ message: 'nope' }, { status: 500 })),
      http.get('/api/offline', () => HttpResponse.error()),
    );
    const boom = await api.get('/api/boom').catch((e) => e);
    expect(boom.response.status).toBe(500);
    expect(boom.response.data).toEqual({ message: 'nope' });

    const offline = await api.get('/api/offline').catch((e) => e);
    expect(offline.response).toBeUndefined();
    expect(offline.message).toMatch(/network error/i);
  });
});
