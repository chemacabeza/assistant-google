import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { linkedAccounts } from '../test/fixtures';
import { loginAs, readJson, renderWithProviders } from '../test/utils';
import Gmail from './Gmail';

const detail = (id, subject, snippet, date = 'Mon, 05 Oct 2026 10:00:00 +0000') => ({
  id,
  snippet,
  payload: { headers: [{ name: 'Subject', value: subject }, { name: 'Date', value: date }] },
});

function mockGmail({ list = [], details = {}, templates = [] } = {}) {
  const listRequests = [];
  const sent = [];
  server.use(
    http.get('/api/gmail/messages', ({ request }) => {
      listRequests.push(new URL(request.url).searchParams);
      return HttpResponse.json({ messages: list });
    }),
    http.get('/api/gmail/messages/:id', ({ params }) => (
      details[params.id] ? HttpResponse.json(details[params.id]) : new HttpResponse(null, { status: 500 })
    )),
    http.get('/api/templates', () => HttpResponse.json(templates)),
    http.post('/api/gmail/send', async ({ request }) => {
      sent.push(await readJson(request));
      return HttpResponse.json({ id: 'sent-1', labelIds: ['SENT'] });
    }),
  );
  return { listRequests, sent };
}

describe('Gmail page', () => {
  beforeEach(() => loginAs());

  it('shows a spinner then the inbox with subjects and snippets', async () => {
    const { listRequests } = mockGmail({
      list: [{ id: 'abc1' }, { id: 'def2' }],
      details: { abc1: detail('abc1', 'Invoice', 'Your invoice &amp; receipt'), def2: { id: 'def2' } },
    });
    const { container } = renderWithProviders(<Gmail />);
    expect(container.querySelector('.animate-spin.rounded-full')).toBeInTheDocument();

    expect(await screen.findByText('Invoice')).toBeInTheDocument();
    expect(screen.getByText('Your invoice & receipt')).toBeInTheDocument(); // Gmail snippets are HTML-escaped
    expect(screen.getByText('(No Subject)')).toBeInTheDocument();
    expect(screen.getByText('No snippet available')).toBeInTheDocument();
    expect(screen.getByText('ab')).toBeInTheDocument(); // avatar initials from the id
    expect(listRequests[0].get('maxResults')).toBe('15');
    expect(listRequests[0].get('q')).toBe('');
  });

  it('keeps the stub when a message detail request fails', async () => {
    mockGmail({ list: [{ id: 'zz9', snippet: 'stub snippet' }] });
    renderWithProviders(<Gmail />);
    expect(await screen.findByText('stub snippet')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    mockGmail();
    renderWithProviders(<Gmail />);
    expect(await screen.findByText('No recent emails found matching your query.')).toBeInTheDocument();
  });

  it('shows the empty state when the list request fails (no dedicated error UI)', async () => {
    server.use(http.get('/api/gmail/messages', () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<Gmail />);
    expect(await screen.findByText('No recent emails found matching your query.')).toBeInTheDocument();
  });

  it('passes the search term to the backend', async () => {
    const { listRequests } = mockGmail();
    const { user } = renderWithProviders(<Gmail />);
    await screen.findByText(/no recent emails/i);
    await user.type(screen.getByPlaceholderText('Search emails...'), 'from:bob');
    await waitFor(() => expect(listRequests.at(-1).get('q')).toBe('from:bob'));
  });

  it('composes and sends an email with the structured payload', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { sent } = mockGmail({ templates: [{ id: 1, title: 'Thanks', content: 'Thank you!' }] });
    const { user } = renderWithProviders(<Gmail />);
    await screen.findByText(/no recent emails/i);

    await user.click(screen.getByRole('button', { name: /compose/i }));
    expect(screen.getByRole('heading', { name: 'New Message' })).toBeInTheDocument();

    const from = screen.getByRole('combobox');
    await waitFor(() => expect(from).toHaveValue(linkedAccounts[0].email));
    expect(within(from).getAllByRole('option').map((o) => o.value)).toEqual(linkedAccounts.map((a) => a.email));
    await user.selectOptions(from, linkedAccounts[1].email);

    await user.type(screen.getByPlaceholderText('Recipient'), 'bob@example.com');
    await user.type(screen.getByPlaceholderText('Subject'), 'Héllo 👋');
    await user.type(screen.getByPlaceholderText('Type your message here...'), 'Hi Bob');
    await user.click(await screen.findByRole('button', { name: 'Thanks' }));
    expect(screen.getByPlaceholderText('Type your message here...')).toHaveValue('Hi Bob\n\nThank you!');

    await user.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('Email sent successfully!'));
    expect(sent).toEqual([{
      from: 'work@example.com',
      to: 'bob@example.com',
      subject: 'Héllo 👋',
      body: 'Hi Bob\n\nThank you!',
    }]);
    expect(screen.queryByRole('heading', { name: 'New Message' })).not.toBeInTheDocument();
  });

  it('falls back to the logged-in user when there are no linked accounts and omits "from"', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    server.use(http.get('/api/accounts', () => HttpResponse.json([])));
    const { sent } = mockGmail();
    const { user } = renderWithProviders(<Gmail />);
    await screen.findByText(/no recent emails/i);
    await user.click(screen.getByRole('button', { name: /compose/i }));

    expect(screen.getByRole('option', { name: 'owner@example.com' })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Recipient'), 'bob@example.com');
    await user.type(screen.getByPlaceholderText('Subject'), 'S');
    await user.type(screen.getByPlaceholderText('Type your message here...'), 'B');
    await user.click(screen.getByRole('button', { name: /send/i }));

    // `from: undefined` is dropped from the JSON; the backend then sends from the session account.
    await waitFor(() => expect(sent).toEqual([{ to: 'bob@example.com', subject: 'S', body: 'B' }]));
  });

  it('can cancel the composer', async () => {
    mockGmail();
    const { user } = renderWithProviders(<Gmail />);
    await user.click(screen.getByRole('button', { name: /compose/i }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'New Message' })).not.toBeInTheDocument();
  });

  it('does not send when required fields are missing', async () => {
    const { sent } = mockGmail();
    const { user } = renderWithProviders(<Gmail />);
    await user.click(screen.getByRole('button', { name: /compose/i }));
    await user.click(screen.getByRole('button', { name: /send/i }));
    expect(sent).toEqual([]);
    expect(screen.getByRole('heading', { name: 'New Message' })).toBeInTheDocument();
  });
});
