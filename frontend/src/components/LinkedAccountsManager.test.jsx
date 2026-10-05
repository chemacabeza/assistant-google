import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { readJson, renderWithProviders } from '../test/utils';
import LinkedAccountsManager from './LinkedAccountsManager';

function useAccountsBackend(initial) {
  const state = { accounts: [...initial], posted: [], deleted: [] };
  let nextId = 100;
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(state.accounts)),
    http.post('/api/accounts', async ({ request }) => {
      const body = await readJson(request);
      state.posted.push(body);
      const saved = { id: nextId++, ...body };
      state.accounts.push(saved);
      return HttpResponse.json(saved);
    }),
    http.delete('/api/accounts/:id', ({ params }) => {
      state.deleted.push(params.id);
      state.accounts = state.accounts.filter((a) => String(a.id) !== params.id);
      return new HttpResponse(null, { status: 200 });
    }),
  );
  return state;
}

describe('LinkedAccountsManager', () => {
  it('shows a spinner then the configured accounts', async () => {
    useAccountsBackend([{ id: 1, email: 'a@example.com', name: 'Alpha' }]);
    const { container } = renderWithProviders(<LinkedAccountsManager />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(await screen.findByText('a@example.com')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    useAccountsBackend([]);
    renderWithProviders(<LinkedAccountsManager />);
    expect(await screen.findByText('No linked accounts found.')).toBeInTheDocument();
  });

  it('adds an account with trimmed values and refreshes the list', async () => {
    const backend = useAccountsBackend([]);
    const { user } = renderWithProviders(<LinkedAccountsManager />);
    await screen.findByText('No linked accounts found.');

    await user.type(screen.getByPlaceholderText('e.g., secondary@gmail.com'), '  new@example.com ');
    await user.type(screen.getByPlaceholderText('e.g., Work Email'), ' Side ');
    await user.click(screen.getByRole('button', { name: /add account/i }));

    expect(await screen.findByText('new@example.com')).toBeInTheDocument();
    expect(backend.posted).toEqual([{ email: 'new@example.com', name: 'Side' }]);
    expect(screen.getByPlaceholderText('e.g., secondary@gmail.com')).toHaveValue('');
    expect(screen.getByPlaceholderText('e.g., Work Email')).toHaveValue('');
  });

  it('defaults the display name to "Custom Account"', async () => {
    const backend = useAccountsBackend([]);
    const { user } = renderWithProviders(<LinkedAccountsManager />);
    await screen.findByText('No linked accounts found.');
    await user.type(screen.getByPlaceholderText('e.g., secondary@gmail.com'), 'x@example.com');
    await user.click(screen.getByRole('button', { name: /add account/i }));
    await waitFor(() => expect(backend.posted).toEqual([{ email: 'x@example.com', name: 'Custom Account' }]));
  });

  it('shows the backend error message when adding fails', async () => {
    useAccountsBackend([]);
    server.use(http.post('/api/accounts', () => HttpResponse.text('Account already exists', { status: 400 })));
    const { user } = renderWithProviders(<LinkedAccountsManager />);
    await screen.findByText('No linked accounts found.');
    await user.type(screen.getByPlaceholderText('e.g., secondary@gmail.com'), 'dup@example.com');
    await user.click(screen.getByRole('button', { name: /add account/i }));
    expect(await screen.findByText('Account already exists')).toBeInTheDocument();
    // Input is kept so the user can fix it.
    expect(screen.getByPlaceholderText('e.g., secondary@gmail.com')).toHaveValue('dup@example.com');
  });

  it('removes an account after confirmation', async () => {
    const backend = useAccountsBackend([
      { id: 1, email: 'a@example.com', name: 'Alpha' },
      { id: 2, email: 'b@example.com', name: 'Beta' },
    ]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = renderWithProviders(<LinkedAccountsManager />);
    await screen.findByText('b@example.com');

    const row = screen.getByText('b@example.com').closest('.group');
    await user.click(within(row).getByTitle('Remove Account'));

    expect(confirm).toHaveBeenCalledWith('Are you sure you want to remove this linked account?');
    await waitFor(() => expect(screen.queryByText('b@example.com')).not.toBeInTheDocument());
    expect(backend.deleted).toEqual(['2']);
    expect(screen.getByText('a@example.com')).toBeInTheDocument();
  });

  it('does nothing when removal is cancelled', async () => {
    const backend = useAccountsBackend([{ id: 1, email: 'a@example.com', name: 'Alpha' }]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = renderWithProviders(<LinkedAccountsManager />);
    await user.click(await screen.findByTitle('Remove Account'));
    expect(backend.deleted).toEqual([]);
    expect(screen.getByText('a@example.com')).toBeInTheDocument();
  });
});
