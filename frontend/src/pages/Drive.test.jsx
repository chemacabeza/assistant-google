import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route } from 'react-router-dom';
import { server } from '../test/server';
import { loginAs, renderWithProviders } from '../test/utils';
import Drive from './Drive';

const FOLDER = 'application/vnd.google-apps.folder';

function mockDrive(byParent = {}) {
  const queries = [];
  server.use(http.get('/api/drive/files', ({ request }) => {
    const params = new URL(request.url).searchParams;
    queries.push({ q: params.get('q'), maxResults: params.get('maxResults') });
    const owner = /'([^']*)' in owners/.exec(params.get('q'))?.[1];
    const parent = /'([^']*)' in parents/.exec(params.get('q'))?.[1];
    // Like the real Drive API, "'' in owners" matches nothing.
    return HttpResponse.json({ files: (owner && byParent[parent]) || [] });
  }));
  return queries;
}

const rootFiles = [
  { id: 'f1', name: 'Projects', mimeType: FOLDER, modifiedTime: '2026-03-04T10:00:00Z', owners: [{ me: true }] },
  { id: 'f2', name: 'report.pdf', mimeType: 'application/pdf', size: '2097152', modifiedTime: '2026-01-15T10:00:00Z', owners: [{ displayName: 'Grace Hopper', photoLink: 'https://x/p.png' }] },
  { id: 'f3', name: 'notes.txt', mimeType: 'text/plain', owners: [{ displayName: 'Bob' }] },
];

function renderDrive() {
  return renderWithProviders(<Drive />, {
    route: '/drive',
    path: '/drive',
    extraRoutes: <Route path="/dashboard" element={<div>Dashboard page</div>} />,
  });
}

describe('Drive page', () => {
  beforeEach(() => loginAs());

  it('lists the root folder of the first linked account', async () => {
    const queries = mockDrive({ root: rootFiles });
    renderDrive();

    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('me')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();
    expect(screen.getByText('15 Jan 2026')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2); // missing size/date
    expect(screen.getByRole('combobox')).toHaveValue('primary@example.com');
    expect(queries.at(-1)).toEqual({
      q: "'primary@example.com' in owners and 'root' in parents and trashed=false",
      maxResults: '50',
    });
  });

  it('shows the empty state', async () => {
    mockDrive();
    renderDrive();
    expect(await screen.findByText('No files or folders found.')).toBeInTheDocument();
  });

  it('opens folders, shows breadcrumbs and navigates back', async () => {
    const queries = mockDrive({ root: rootFiles, f1: [{ id: 'c1', name: 'Roadmap.docx', mimeType: 'application/msword' }] });
    const { user } = renderDrive();

    await user.click(await screen.findByText('Projects'));
    expect(await screen.findByText('Roadmap.docx')).toBeInTheDocument();
    expect(queries.at(-1).q).toBe("'primary@example.com' in owners and 'f1' in parents and trashed=false");
    expect(screen.getByRole('button', { name: 'Projects' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'My Drive' }));
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /my drive/i })).toBeInTheDocument();
  });

  it('clicking a file does not navigate', async () => {
    mockDrive({ root: rootFiles });
    const { user } = renderDrive();
    await user.click(await screen.findByText('report.pdf'));
    expect(screen.getByRole('heading', { name: /my drive/i })).toBeInTheDocument();
  });

  it('adds the search term to the Drive query', async () => {
    const queries = mockDrive({ root: rootFiles });
    const { user } = renderDrive();
    await screen.findByText('report.pdf');
    await user.type(screen.getByPlaceholderText('Search in Drive'), 'rep');
    await waitFor(() => expect(queries.at(-1).q).toBe(
      "name contains 'rep' and 'primary@example.com' in owners and 'root' in parents and trashed=false",
    ));
  });

  it('switching account reloads the root folder for that owner', async () => {
    const queries = mockDrive({ root: rootFiles, f1: [] });
    const { user } = renderDrive();
    await user.click(await screen.findByText('Projects'));
    await screen.findByText('No files or folders found.');

    await user.selectOptions(screen.getByRole('combobox'), 'work@example.com');
    await waitFor(() => expect(queries.at(-1).q).toBe("'work@example.com' in owners and 'root' in parents and trashed=false"));
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
  });

  it('Exit links back to the dashboard', async () => {
    mockDrive();
    const { user } = renderDrive();
    await user.click(screen.getByRole('link', { name: 'Exit' }));
    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
  });

  // BUG: the search term is interpolated into the Drive query without escaping, so a name
  // containing a quote (e.g. "O'Brien") produces an invalid q and the Drive API returns 400.
  it.skip("BUG: escapes quotes in the search term", async () => {
    const queries = mockDrive({ root: rootFiles });
    const { user } = renderDrive();
    await screen.findByText('report.pdf');
    await user.type(screen.getByPlaceholderText('Search in Drive'), "O'Brien");
    await waitFor(() => expect(queries.at(-1).q).toContain("name contains 'O\\'Brien'"));
  });

  // BUG: with no linked accounts the dropdown shows the logged-in user's email, but
  // selectedEmail stays '' so the query is "'' in owners ..." and nothing is ever listed.
  // (The query also fires once with '' before the accounts load.)
  it.skip("BUG: falls back to the logged-in user's email when there are no linked accounts", async () => {
    server.use(http.get('/api/accounts', () => HttpResponse.json([])));
    const queries = mockDrive({ root: rootFiles });
    renderDrive();
    await screen.findByRole('option', { name: 'owner@example.com' });
    await waitFor(() => expect(queries.at(-1).q).toContain("'owner@example.com' in owners"));
    expect(queries.every((q) => !q.q.startsWith("'' in owners"))).toBe(true);
  });
});
