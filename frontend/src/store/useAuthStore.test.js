import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { userProfile } from '../test/fixtures';
import { mockLocation } from '../test/utils';
import { useAuthStore } from './useAuthStore';

describe('useAuthStore', () => {
  it('starts anonymous and loading', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(true);
  });

  it('checkAuth stores the profile when the session is valid', async () => {
    await useAuthStore.getState().checkAuth();
    const state = useAuthStore.getState();
    expect(state.user).toEqual(userProfile);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('checkAuth clears the user on 401', async () => {
    useAuthStore.setState({ user: userProfile, isAuthenticated: true });
    server.use(http.get('/api/auth/profile', () => new HttpResponse(null, { status: 401 })));

    await useAuthStore.getState().checkAuth();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('checkAuth treats a network error as logged out', async () => {
    server.use(http.get('/api/auth/profile', () => HttpResponse.error()));
    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, isLoading: false, user: null });
  });

  it('logout posts to the backend and does exactly one full-page redirect to /login', async () => {
    const { assign, hrefSet } = mockLocation();
    let logoutCalls = 0;
    server.use(http.post('/api/auth/logout', () => {
      logoutCalls += 1;
      return new HttpResponse(null, { status: 200 });
    }));
    useAuthStore.setState({ user: userProfile, isAuthenticated: true, isLoading: false });

    await useAuthStore.getState().logout();

    expect(logoutCalls).toBe(1);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/login');
    expect(hrefSet).not.toHaveBeenCalled();
    // Regression (6184ca3): the store must NOT be cleared before the reload, otherwise
    // ProtectedRoute fires a competing client-side redirect.
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user).toEqual(userProfile);
  });

  it('logout still redirects when the backend call fails', async () => {
    const { assign } = mockLocation();
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 500 })));

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();
    expect(assign).toHaveBeenCalledExactlyOnceWith('/login');
  });
});
