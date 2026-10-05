import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from './test/server';
import { userProfile } from './test/fixtures';
import App from './App';

// App owns its BrowserRouter + QueryClient, so drive it through the jsdom URL.
function renderAt(path) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

describe('App routing', () => {
  afterEach(() => window.history.pushState({}, '', '/'));

  it('sends anonymous users to the login page', async () => {
    server.use(http.get('/api/auth/profile', () => new HttpResponse(null, { status: 401 })));
    renderAt('/gmail');
    expect(await screen.findByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('redirects / to the dashboard inside the layout for logged-in users', async () => {
    server.use(
      http.get('/api/calendar/events', () => HttpResponse.json({ items: [] })),
      http.get('/api/gmail/messages', () => HttpResponse.json({ messages: [] })),
    );
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'System Dashboard' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText(userProfile.name)).toBeInTheDocument();
    expect(await screen.findByText('No upcoming meetings.')).toBeInTheDocument();
  });

  it('redirects unknown routes to the dashboard', async () => {
    server.use(
      http.get('/api/calendar/events', () => HttpResponse.json({ items: [] })),
      http.get('/api/gmail/messages', () => HttpResponse.json({ messages: [] })),
    );
    renderAt('/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'System Dashboard' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
    expect(await screen.findByText('No upcoming meetings.')).toBeInTheDocument();
  });
});
