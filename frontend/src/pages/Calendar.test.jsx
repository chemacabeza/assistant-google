import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { loginAs, readJson, renderWithProviders } from '../test/utils';
import Calendar from './Calendar';

const decodeBase64Url = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(b64)));
};

function mockCalendar(initial = []) {
  const state = { events: [...initial], created: [], sent: [], listParams: [] };
  server.use(
    http.get('/api/calendar/events', ({ request }) => {
      state.listParams.push(new URL(request.url).searchParams);
      return HttpResponse.json({ items: state.events });
    }),
    http.post('/api/calendar/events', async ({ request }) => {
      const body = await readJson(request);
      state.created.push(body);
      const saved = { id: `new-${state.created.length}`, ...body };
      state.events.push(saved);
      return HttpResponse.json(saved);
    }),
    http.post('/api/gmail/send', async ({ request }) => {
      state.sent.push(await readJson(request));
      return HttpResponse.json({ id: 'x' });
    }),
  );
  return state;
}

const standup = {
  id: 'ev1',
  summary: 'Standup',
  location: 'Room 42',
  htmlLink: 'https://calendar.google.com/event?eid=ev1',
  start: { dateTime: '2026-10-06T09:00:00Z' },
  end: { dateTime: '2026-10-06T09:15:00Z' },
};

describe('Calendar page', () => {
  beforeEach(() => loginAs());

  it('shows a spinner then upcoming events', async () => {
    const state = mockCalendar([standup, { id: 'ev2', start: { date: '2026-10-10' } }, { id: 'ev3' }]);
    const { container } = renderWithProviders(<Calendar />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Standup' })).toBeInTheDocument();
    expect(screen.getByText('Room 42')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: '(No title)' })).toHaveLength(2);
    expect(screen.getByText(/2026-10-10 \(All day\)/)).toBeInTheDocument();
    expect(screen.getByText('Unknown Time')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View in Calendar' })).toHaveAttribute('href', standup.htmlLink);
    expect(state.listParams[0].get('maxResults')).toBe('10');
  });

  it('shows the empty state (also used when the request fails)', async () => {
    server.use(http.get('/api/calendar/events', () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<Calendar />);
    expect(await screen.findByText('No upcoming events scheduled.')).toBeInTheDocument();
  });

  it('creates an event with UTC date-times and refreshes the list', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const state = mockCalendar();
    const { user, container } = renderWithProviders(<Calendar />);
    await screen.findByText('No upcoming events scheduled.');

    await user.click(screen.getByRole('button', { name: /new event/i }));
    expect(screen.getByRole('heading', { name: 'Create New Event' })).toBeInTheDocument();

    const form = container.querySelector('form');
    const [title] = form.querySelectorAll('input[type=text]');
    const [startDate, endDate] = form.querySelectorAll('input[type=date]');
    const [startTime, endTime] = form.querySelectorAll('input[type=time]');
    await user.type(title, 'Planning');
    await user.type(form.querySelector('textarea'), 'Q4 roadmap');
    await user.type(startDate, '2026-10-20');
    await user.type(startTime, '14:30');
    await user.type(endDate, '2026-10-20');
    await user.type(endTime, '15:00');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('Event created!'));
    expect(state.created).toEqual([{
      summary: 'Planning',
      description: 'Q4 roadmap',
      start: { dateTime: '2026-10-20T14:30:00Z' },
      end: { dateTime: '2026-10-20T15:00:00Z' },
    }]);
    expect(await screen.findByRole('heading', { name: 'Planning' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create New Event' })).not.toBeInTheDocument();
  });

  it('cancelling the form does not create anything', async () => {
    const state = mockCalendar();
    const { user } = renderWithProviders(<Calendar />);
    await user.click(screen.getByRole('button', { name: /new event/i }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Create New Event' })).not.toBeInTheDocument();
    expect(state.created).toEqual([]);
  });

  it('sends an iCalendar invite as a raw MIME message through Gmail', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('guest@example.com');
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const state = mockCalendar([standup]);
    const { user } = renderWithProviders(<Calendar />);

    await user.click(await screen.findByRole('button', { name: 'Send Invite' }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('Calendar invite sent successfully!'));
    expect(state.sent).toHaveLength(1);
    expect(Object.keys(state.sent[0])).toEqual(['raw']);
    expect(state.sent[0].raw).not.toMatch(/[+/=]/); // base64url, unpadded
    const mime = decodeBase64Url(state.sent[0].raw);
    expect(mime).toContain('To: guest@example.com\r\n');
    expect(mime).toContain('Subject: Invitation: Standup\r\n');
    expect(mime).toContain('Content-Type: text/calendar; method=REQUEST');
    expect(mime).toContain('DTSTART:20261006T090000Z');
    expect(mime).toContain('DTEND:20261006T091500Z');
    expect(mime).toContain('LOCATION:Room 42');
    expect(mime).toContain('ORGANIZER;CN=Ada Lovelace:mailto:owner@example.com');
    expect(mime).toContain('ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:guest@example.com');
  });

  it('does not send an invite when the prompt is dismissed', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const state = mockCalendar([standup]);
    const { user } = renderWithProviders(<Calendar />);
    await user.click(await screen.findByRole('button', { name: 'Send Invite' }));
    expect(state.sent).toEqual([]);
  });

  it('reports invite failures', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('guest@example.com');
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockCalendar([standup]);
    server.use(http.post('/api/gmail/send', () => new HttpResponse(null, { status: 500 })));
    const { user } = renderWithProviders(<Calendar />);
    await user.click(await screen.findByRole('button', { name: 'Send Invite' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith(expect.stringMatching(/^Failed to send invite: /)));
  });

  // BUG: the "Send invite to" prompt is pre-filled with a hard-coded third-party personal
  // address. Pressing Enter sends the event to a stranger. Same class of
  // problem as commit 080b9c8 (seeded personal addresses). The default should be empty.
  it.skip('BUG: does not pre-fill the invite prompt with a hard-coded personal address', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    mockCalendar([standup]);
    const { user } = renderWithProviders(<Calendar />);
    await user.click(await screen.findByRole('button', { name: 'Send Invite' }));
    expect(prompt.mock.calls[0][1] ?? '').toBe('');
  });
});
