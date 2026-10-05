import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { loginAs, mockLocation, renderWithProviders } from '../test/utils';
import { userProfile } from '../test/fixtures';
import Topbar from './Topbar';

describe('Topbar', () => {
  it('shows only the title when no user is loaded', () => {
    renderWithProviders(<Topbar />);
    expect(screen.getByText('Assistant Dashboard')).toBeInTheDocument();
    expect(screen.queryByTitle('Logout')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Profile' })).not.toBeInTheDocument();
  });

  it('shows the user name and avatar', () => {
    loginAs();
    renderWithProviders(<Topbar />);
    expect(screen.getByText(userProfile.name)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Profile' })).toHaveAttribute('src', userProfile.picture);
  });

  it('omits the avatar when the user has no picture', () => {
    loginAs({ ...userProfile, picture: null });
    renderWithProviders(<Topbar />);
    expect(screen.getByText(userProfile.name)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Profile' })).not.toBeInTheDocument();
  });

  it('logs out via the backend and redirects once to /login', async () => {
    const { assign } = mockLocation();
    let logoutCalls = 0;
    server.use(http.post('/api/auth/logout', () => {
      logoutCalls += 1;
      return new HttpResponse(null, { status: 200 });
    }));
    loginAs();
    const { user } = renderWithProviders(<Topbar />);

    await user.click(screen.getByTitle('Logout'));

    await vi.waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith('/login'));
    expect(logoutCalls).toBe(1);
  });
});
