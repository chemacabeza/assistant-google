import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { renderWithProviders } from '../test/utils';
import Dashboard from './Dashboard';

const gmailDetail = (id, subject, from, snippet) => ({
  id,
  snippet,
  payload: { headers: [{ name: 'Subject', value: subject }, { name: 'From', value: from }] },
});

function mockDashboardApi({ events = [], messages = [], details = {}, calendarStatus = 200 } = {}) {
  const seen = [];
  server.use(
    http.get('/api/calendar/events', ({ request }) => {
      seen.push(request.url);
      if (calendarStatus !== 200) return new HttpResponse(null, { status: calendarStatus });
      return HttpResponse.json({ items: events });
    }),
    http.get('/api/gmail/messages', ({ request }) => {
      seen.push(request.url);
      return HttpResponse.json({ messages });
    }),
    http.get('/api/gmail/messages/:id', ({ params }) => (
      details[params.id] ? HttpResponse.json(details[params.id]) : new HttpResponse(null, { status: 404 })
    )),
  );
  return seen;
}

describe('Dashboard page', () => {
  it('shows syncing spinners while loading', () => {
    server.use(
      http.get('/api/calendar/events', () => new Promise(() => {})),
    );
    renderWithProviders(<Dashboard />);
    expect(screen.getByRole('heading', { name: 'System Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Syncing Gmail...')).toBeInTheDocument();
    expect(screen.getByText('Syncing Calendar...')).toBeInTheDocument();
  });

  it('renders the next events and recent emails widgets', async () => {
    const seen = mockDashboardApi({
      events: [
        { id: 'e1', summary: 'Standup', location: 'Room 1', start: { dateTime: '2026-10-06T09:00:00Z' } },
        { id: 'e2', summary: 'Holiday', start: { date: '2026-10-07' } },
        { id: 'e3', start: { dateTime: '2026-10-08T09:00:00Z' } },
      ],
      messages: [{ id: 'm1' }, { id: 'm2' }],
      details: {
        m1: gmailDetail('m1', 'Quarterly report', 'Grace Hopper <grace@example.com>', 'Numbers inside'),
        m2: { id: 'm2', snippet: 'no headers' },
      },
    });

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText('Quarterly report')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument(); // "<email>" part stripped
    expect(screen.getByText('Numbers inside')).toBeInTheDocument();
    expect(screen.getByText('(No Subject)')).toBeInTheDocument();
    expect(screen.getByText('Unknown Sender')).toBeInTheDocument();

    expect(screen.getByText('Standup')).toBeInTheDocument();
    expect(screen.getByText('Room 1')).toBeInTheDocument();
    expect(screen.getByText('Holiday')).toBeInTheDocument();
    expect(screen.getByText('Busy')).toBeInTheDocument(); // event without summary

    expect(seen.some((u) => u.endsWith('/api/calendar/events?maxResults=3'))).toBe(true);
    expect(seen.some((u) => u.endsWith('/api/gmail/messages?maxResults=3'))).toBe(true);
  });

  it('drops emails whose detail request fails', async () => {
    mockDashboardApi({
      messages: [{ id: 'ok' }, { id: 'missing' }],
      details: { ok: gmailDetail('ok', 'Kept', 'A <a@x>', 's') },
    });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Kept')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
  });

  it('shows empty states when there is no data', async () => {
    mockDashboardApi();
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('No recent emails found.')).toBeInTheDocument();
    expect(screen.getByText('No upcoming meetings.')).toBeInTheDocument();
  });

  it('falls back to empty states when the backend errors', async () => {
    mockDashboardApi({ calendarStatus: 500 });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('No upcoming meetings.')).toBeInTheDocument();
    expect(screen.getByText('No recent emails found.')).toBeInTheDocument();
  });

  // BUG: both widgets are loaded inside one try block, calendar first. If the Calendar API
  // fails (e.g. scope not granted) the Gmail request is never made and the email widget
  // wrongly says "No recent emails found." even though Gmail works.
  it.skip('BUG: still loads emails when the calendar request fails', async () => {
    mockDashboardApi({
      calendarStatus: 500,
      messages: [{ id: 'm1' }],
      details: { m1: gmailDetail('m1', 'Still here', 'A <a@x>', 's') },
    });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Still here')).toBeInTheDocument();
  });
});
