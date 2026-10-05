import { screen } from '@testing-library/react';
import { mockLocation, renderWithProviders } from '../test/utils';
import Login from './Login';

describe('Login page', () => {
  it('renders the welcome copy', () => {
    renderWithProviders(<Login />);
    expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
    expect(screen.getByText(/connect your google account/i)).toBeInTheDocument();
  });

  it('sends the browser to the Spring Security Google OAuth2 entry point', async () => {
    const { hrefSet } = mockLocation();
    const { user } = renderWithProviders(<Login />);
    await user.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(hrefSet).toHaveBeenCalledExactlyOnceWith('/oauth2/authorization/google');
  });
});
