import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import Sidebar from './Sidebar';

const expectedLinks = [
  ['Dashboard', '/dashboard'],
  ['Assistant', '/assistant'],
  ['Gmail', '/gmail'],
  ['Google Drive', '/drive'],
  ['Google Photos', '/photos'],
  ['Calendar', '/calendar'],
  ['Custom Answers', '/templates'],
  ['Maps', '/maps'],
  ['WhatsApp', '/whatsapp'],
  ['Settings', '/settings'],
  ['Configuration', '/configuration'],
];

describe('Sidebar', () => {
  it('renders the app title and footer', () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByRole('heading', { name: /chema's ai assistant/i })).toBeInTheDocument();
    expect(screen.getByText('Assistant Suite v1.0')).toBeInTheDocument();
  });

  it('renders every navigation link with the right target, in order', () => {
    renderWithProviders(<Sidebar />);
    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(links.map((l) => [l.textContent.trim(), l.getAttribute('href')])).toEqual(expectedLinks);
    links.forEach((l) => expect(l).not.toHaveAttribute('target'));
  });

  it('highlights only the active route', () => {
    renderWithProviders(<Sidebar />, { route: '/gmail' });
    const gmail = screen.getByRole('link', { name: 'Gmail' });
    expect(gmail).toHaveClass('bg-blue-600');
    expect(gmail).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveClass('bg-blue-600');
  });

  it('navigates when a link is clicked', async () => {
    const { user } = renderWithProviders(<Sidebar />, { route: '/dashboard', withLocation: true });
    await user.click(screen.getByRole('link', { name: 'Calendar' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/calendar');
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page');
  });
});
