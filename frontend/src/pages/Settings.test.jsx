import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route } from 'react-router-dom';
import { server } from '../test/server';
import { userProfile } from '../test/fixtures';
import { loginAs, mockLocation, renderWithProviders } from '../test/utils';
import { useAuthStore } from '../store/useAuthStore';
import Settings from './Settings';

const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

const logs = [
  { id: 1, actionType: 'CREATE_EVENT', details: 'Created "Standup"', timestamp: minutesAgo(5) },
  { id: 2, actionType: 'SEND_EMAIL', details: 'To bob@example.com', timestamp: minutesAgo(180) },
  { id: 3, actionType: 'DELETE_EVENT', details: null, timestamp: minutesAgo(60 * 24 * 3) },
  { id: 4, actionType: 'SYNC_CONTACTS', details: 'custom', timestamp: minutesAgo(0) },
];

function renderSettings() {
  return renderWithProviders(<Settings />, {
    route: '/settings',
    path: '/settings',
    extraRoutes: <Route path="/login" element={<div>Login page</div>} />,
    withLocation: true,
  });
}

describe('Settings page', () => {
  beforeEach(() => {
    server.use(http.get('/api/audit', () => HttpResponse.json(logs)));
  });

  it('shows loading states then the profile', async () => {
    renderSettings();
    expect(screen.getByText('Loading profile...')).toBeInTheDocument();
    expect(screen.getByText('Loading activity log...')).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: userProfile.name })).toBeInTheDocument();
    expect(screen.getByText(userProfile.email)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: userProfile.name })).toHaveAttribute('src', userProfile.picture);
    expect(screen.getByText('January 15, 2025')).toBeInTheDocument();
    expect(await screen.findByText('4 recorded')).toBeInTheDocument();
  });

  it('shows initials when there is no picture', async () => {
    server.use(http.get('/api/auth/profile', () => HttpResponse.json({ ...userProfile, picture: null })));
    renderSettings();
    expect(await screen.findByText('A')).toBeInTheDocument();
  });

  it('shows a warning when the profile cannot be loaded', async () => {
    server.use(http.get('/api/auth/profile', () => new HttpResponse(null, { status: 401 })));
    renderSettings();
    expect(await screen.findByText('Unable to load profile information.')).toBeInTheDocument();
  });

  it('renders the activity log with labels and relative times', async () => {
    renderSettings();
    expect(await screen.findByText('Created Event')).toBeInTheDocument();
    expect(screen.getByText('Sent Email')).toBeInTheDocument();
    expect(screen.getByText('Deleted Event')).toBeInTheDocument();
    expect(screen.getByText('SYNC CONTACTS')).toBeInTheDocument();
    expect(screen.getByText('Created "Standup"')).toBeInTheDocument();
    expect(screen.getByText('5m ago')).toBeInTheDocument();
    expect(screen.getByText('3h ago')).toBeInTheDocument();
    expect(screen.getByText('3d ago')).toBeInTheDocument();
    expect(screen.getByText('Just now')).toBeInTheDocument();
    expect(screen.getByText('4 entries')).toBeInTheDocument();
  });

  it('shows the empty activity state and refreshes on demand', async () => {
    let calls = 0;
    server.use(http.get('/api/audit', () => {
      calls += 1;
      return HttpResponse.json(calls === 1 ? [] : [logs[0]]);
    }));
    const { user } = renderSettings();
    expect(await screen.findByText('No activity recorded yet')).toBeInTheDocument();
    expect(screen.getByText('0 entries')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(await screen.findByText('Created Event')).toBeInTheDocument();
    expect(screen.getByText('1 entry')).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('treats an audit error as an empty log', async () => {
    server.use(http.get('/api/audit', () => new HttpResponse(null, { status: 500 })));
    renderSettings();
    expect(await screen.findByText('No activity recorded yet')).toBeInTheDocument();
  });

  it('signs out: calls the logout endpoint and leaves the page', async () => {
    mockLocation();
    let logoutCalls = 0;
    server.use(http.post('/api/auth/logout', () => {
      logoutCalls += 1;
      return new HttpResponse(null, { status: 200 });
    }));
    const { user } = renderSettings();
    const section = screen.getByRole('heading', { name: 'Sign Out' }).closest('div').parentElement;
    await user.click(within(section).getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(logoutCalls).toBe(1));
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  // BUG: Settings implements its own logout with a client-side navigate('/login') instead of
  // useAuthStore.logout(). The auth store keeps isAuthenticated=true and the user, and the
  // React Query cache / sockets survive, so the "logged out" app still holds the previous
  // user's data. It should reuse the store's logout, which does a single full reload
  // (window.location.assign('/login'), see commit 6184ca3).
  it.skip('BUG: signs out through the auth store (full reload to /login)', async () => {
    const { assign } = mockLocation();
    loginAs();
    const { user } = renderSettings();
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith('/login'));
    expect(useAuthStore.getState().isAuthenticated).toBe(true); // not cleared before reload
  });
});
