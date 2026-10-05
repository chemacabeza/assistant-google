import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '../test/server';
import { renderWithProviders } from '../test/utils';
import { useAuthStore } from '../store/useAuthStore';
import ProtectedRoute from './ProtectedRoute';

function renderProtected() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<div>Login page</div>} />
      <Route element={<ProtectedRoute />}>
        <Route path="/secret" element={<div>Secret content</div>} />
      </Route>
    </Routes>,
    { route: '/secret', withLocation: true },
  );
}

describe('ProtectedRoute', () => {
  it('shows a spinner while the session is being checked', async () => {
    let release;
    server.use(http.get('/api/auth/profile', async () => {
      await new Promise((r) => { release = r; });
      return new HttpResponse(null, { status: 401 });
    }));
    const { container } = renderProtected();

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();

    await waitFor(() => expect(release).toBeTypeOf('function'));
    release();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  it('renders the child route when the profile call succeeds', async () => {
    renderProtected();
    expect(await screen.findByText('Secret content')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/secret');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('redirects anonymous users to /login', async () => {
    server.use(http.get('/api/auth/profile', () => new HttpResponse(null, { status: 401 })));
    renderProtected();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });

  it('re-validates the session on mount (calls the profile endpoint)', async () => {
    let calls = 0;
    server.use(http.get('/api/auth/profile', () => {
      calls += 1;
      return HttpResponse.json({ email: 'x@example.com', name: 'X' });
    }));
    renderProtected();
    await screen.findByText('Secret content');
    expect(calls).toBe(1);
  });
});
