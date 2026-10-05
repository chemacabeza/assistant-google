const { test, expect, DATA } = require('../../helpers/api-mocks');

const decodeRaw = (raw) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

test.describe('ui: calendar', () => {
  test('lists upcoming events with time, location and calendar link', async ({ page, api }) => {
    await page.goto('/calendar');

    const sync = page.locator('div.border-l-4', { has: page.getByRole('heading', { name: 'Team sync' }) });
    await expect(sync).toBeVisible();
    await expect(sync.getByText('Room 42')).toBeVisible();
    await expect(sync.getByRole('link', { name: 'View in Calendar' })).toHaveAttribute('href', DATA.CALENDAR.items[0].htmlLink);

    const holiday = page.locator('div.border-l-4', { has: page.getByRole('heading', { name: 'Company holiday' }) });
    await expect(holiday.getByText('2026-12-24 (All day)')).toBeVisible();
    await expect(holiday.getByRole('link', { name: 'View in Calendar' })).toHaveCount(0);

    expect(api.callsTo('GET', '/api/calendar/events')[0].url.searchParams.get('maxResults')).toBe('10');
  });

  test('creating an event posts the payload in UTC and refreshes the list', async ({ page, api, dialogs }) => {
    let created = false;
    api.on('GET', '/api/calendar/events', () => ({
      json: created ? { items: [...DATA.CALENDAR.items, { id: 'new', summary: 'Planning', start: { dateTime: '2026-11-03T14:00:00Z' } }] } : DATA.CALENDAR,
    }));
    api.on('POST', '/api/calendar/events', ({ body }) => {
      created = true;
      return { json: { id: 'new', ...body } };
    });

    await page.goto('/calendar');
    await page.getByRole('button', { name: 'New Event' }).click();
    const form = page.locator('form');
    await expect(page.getByRole('heading', { name: 'Create New Event' })).toBeVisible();

    await form.locator('input[type="text"]').fill('Planning');
    await form.locator('textarea').fill('Roadmap for Q1');
    const dates = form.locator('input[type="date"]');
    const times = form.locator('input[type="time"]');
    await dates.nth(0).fill('2026-11-03');
    await times.nth(0).fill('14:00');
    await dates.nth(1).fill('2026-11-03');
    await times.nth(1).fill('15:30');

    const post = api.waitForCall('POST', '/api/calendar/events');
    await form.getByRole('button', { name: 'Create' }).click();
    const call = await post;

    expect(call.body).toEqual({
      summary: 'Planning',
      description: 'Roadmap for Q1',
      start: { dateTime: '2026-11-03T14:00:00Z' },
      end: { dateTime: '2026-11-03T15:30:00Z' },
    });
    await expect(page.getByRole('heading', { name: 'Create New Event' })).toHaveCount(0);
    await expect.poll(() => dialogs.map((d) => d.message)).toContain('Event created!');
    await expect(page.getByRole('heading', { name: 'Planning' })).toBeVisible();
  });

  test('the event form requires title, dates and times', async ({ page, api }) => {
    await page.goto('/calendar');
    await page.getByRole('button', { name: 'New Event' }).click();
    await page.locator('form input[type="text"]').fill('Only a title');
    await page.locator('form').getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: 'Create New Event' })).toBeVisible();
    expect(api.callsTo('POST', '/api/calendar/events')).toHaveLength(0);

    await page.locator('form').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Create New Event' })).toHaveCount(0);
  });

  test('a failed create keeps the dialog open', async ({ page, api, dialogs }) => {
    api.fail('POST', '/api/calendar/events', 500);
    await page.goto('/calendar');
    await page.getByRole('button', { name: 'New Event' }).click();
    const form = page.locator('form');
    await form.locator('input[type="text"]').fill('Doomed');
    await form.locator('input[type="date"]').nth(0).fill('2026-11-03');
    await form.locator('input[type="time"]').nth(0).fill('10:00');
    await form.locator('input[type="date"]').nth(1).fill('2026-11-03');
    await form.locator('input[type="time"]').nth(1).fill('11:00');
    const post = api.waitForCall('POST', '/api/calendar/events');
    await form.getByRole('button', { name: 'Create' }).click();
    await post;

    await expect(form.getByRole('button', { name: 'Create' })).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Create New Event' })).toBeVisible();
    expect(dialogs).toEqual([]);
  });

  test('"Send Invite" mails an iCalendar invitation to the chosen address', async ({ page, api, dialogs }) => {
    dialogs.answer = (d) => (d.type() === 'prompt' ? 'guest@example.com' : true);
    await page.goto('/calendar');
    const sync = page.locator('div.border-l-4', { has: page.getByRole('heading', { name: 'Team sync' }) });

    const send = api.waitForCall('POST', '/api/gmail/send');
    await sync.getByRole('button', { name: 'Send Invite' }).click();
    const call = await send;

    expect(Object.keys(call.body)).toEqual(['raw']);
    const mime = decodeRaw(call.body.raw);
    expect(mime).toContain('To: guest@example.com');
    expect(mime).toContain('Subject: Invitation: Team sync');
    expect(mime).toContain('BEGIN:VCALENDAR');
    expect(mime).toContain('DTSTART:20261102T093000Z');
    expect(mime).toContain('DTEND:20261102T100000Z');
    expect(mime).toContain('LOCATION:Room 42');
    expect(mime).toContain('ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:guest@example.com');
    expect(mime).toContain(`ORGANIZER;CN=${DATA.USER.name}:mailto:${DATA.USER.email}`);
    await expect.poll(() => dialogs.map((d) => d.message)).toContain('Calendar invite sent successfully!');
  });

  test('cancelling the invite prompt sends nothing', async ({ page, api, dialogs }) => {
    dialogs.answer = false;
    await page.goto('/calendar');
    await page.getByRole('button', { name: 'Send Invite' }).first().click();
    await expect.poll(() => dialogs.length).toBe(1);
    expect(api.callsTo('POST', '/api/gmail/send')).toHaveLength(0);
  });

  test('a failed invite is reported to the user', async ({ page, api, dialogs }) => {
    api.fail('POST', '/api/gmail/send', 500);
    dialogs.answer = (d) => (d.type() === 'prompt' ? 'guest@example.com' : true);
    await page.goto('/calendar');
    await page.getByRole('button', { name: 'Send Invite' }).first().click();
    await expect.poll(() => dialogs.map((d) => d.message).join('\n')).toContain('Failed to send invite');
  });

  // BUG: the invite prompt is pre-filled with a hard-coded personal address (Calendar.jsx), so
  // pressing Enter mails every invite to a stranger. It should start empty.
  test.fixme('the invite prompt does not suggest a hard-coded recipient', async ({ page, dialogs }) => {
    dialogs.answer = false;
    await page.goto('/calendar');
    await page.getByRole('button', { name: 'Send Invite' }).first().click();
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0].defaultValue).toBe('');
  });

  test('no events shows the empty state', async ({ page, api }) => {
    api.on('GET', '/api/calendar/events', { json: {} });
    await page.goto('/calendar');
    await expect(page.getByText('No upcoming events scheduled.')).toBeVisible();
  });

  test('a calendar outage ends in the empty state instead of a crash', async ({ page, api }) => {
    api.fail('GET', '/api/calendar/events', 500);
    await page.goto('/calendar');
    await expect(page.getByText('No upcoming events scheduled.')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'New Event' })).toBeEnabled();
  });
});
