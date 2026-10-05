import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { loginAs, renderWithProviders } from '../test/utils';
import { userProfile } from '../test/fixtures';
import Layout from './Layout';

describe('Layout', () => {
  it('renders sidebar, topbar and the matched child route', () => {
    loginAs();
    renderWithProviders(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<div>Child page</div>} />
        </Route>
      </Routes>,
      { route: '/dashboard' },
    );
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('Assistant Dashboard')).toBeInTheDocument();
    expect(screen.getByText(userProfile.name)).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Child page');
  });
});
