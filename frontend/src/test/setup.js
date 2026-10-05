import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';
import { useAuthStore } from '../store/useAuthStore';

// jsdom does not implement these.
Element.prototype.scrollIntoView = function scrollIntoView() {};

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  localStorage.clear();
  sessionStorage.clear();
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(() => {
  server.close();
});
