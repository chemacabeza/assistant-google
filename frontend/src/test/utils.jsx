import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { userProfile } from './fixtures';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/** Renders the current pathname so tests can assert client-side navigation. */
export function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

/**
 * Renders `ui` inside QueryClientProvider (no retries) + MemoryRouter.
 * Pass `path` to mount `ui` on a route pattern; `extraRoutes` adds sibling routes
 * (e.g. a /login stub) so navigation can be asserted.
 */
export function renderWithProviders(
  ui,
  { route = '/', path, extraRoutes = null, queryClient = createTestQueryClient(), withLocation = false } = {},
) {
  const user = userEvent.setup();
  const content = path ? (
    <Routes>
      <Route path={path} element={ui} />
      {extraRoutes}
    </Routes>
  ) : ui;

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        {content}
        {withLocation && <LocationDisplay />}
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, user, queryClient };
}

/** Puts the auth store into the "logged in" state without hitting the network. */
export function loginAs(user = userProfile) {
  useAuthStore.setState({ user, isAuthenticated: true, isLoading: false });
}

/**
 * Replaces window.location with a spy-able object (jsdom's Location is unforgeable).
 * Restored automatically after each test via `unstubGlobals`.
 */
export function mockLocation() {
  const real = window.location;
  const hrefSet = vi.fn();
  let href = real.href;
  const location = {
    origin: real.origin,
    protocol: real.protocol,
    host: real.host,
    hostname: real.hostname,
    port: real.port,
    pathname: real.pathname,
    search: real.search,
    hash: real.hash,
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
    toString: () => href,
    get href() {
      return href;
    },
    set href(value) {
      hrefSet(value);
      href = value;
    },
  };
  vi.stubGlobal('location', location);
  return { location, assign: location.assign, replace: location.replace, reload: location.reload, hrefSet };
}

/** Collects requests seen by MSW so tests can assert on payloads. */
export async function readJson(request) {
  const text = await request.clone().text();
  return text ? JSON.parse(text) : null;
}
