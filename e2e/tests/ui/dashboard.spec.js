const { test, expect, DATA } = require('../../helpers/api-mocks');

test.describe('ui: dashboard', () => {
  test('shows recent mail and upcoming events from the API', async ({ page, api }) => {
    await page.goto('/dashboard');

    const inbox = page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'Recent Inbox Activity' }) });
    // "Name <address>" senders are shown by name only.
    await expect(inbox.getByText('Alice Smith', { exact: true })).toBeVisible();
    await expect(inbox.getByText('Bob', { exact: true })).toBeVisible();
    await expect(inbox.getByText('Q3 report')).toBeVisible();
    await expect(inbox.getByText('Lunch tomorrow')).toBeVisible();
    await expect(inbox.getByText('Are we still on for lunch?')).toBeVisible();

    const schedule = page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'Upcoming Schedule' }) });
    await expect(schedule.getByText('Team sync')).toBeVisible();
    await expect(schedule.getByText('Room 42')).toBeVisible();
    await expect(schedule.getByText('Company holiday')).toBeVisible();

    expect(api.callsTo('GET', '/api/calendar/events')[0].url.searchParams.get('maxResults')).toBe('3');
    expect(api.callsTo('GET', '/api/gmail/messages')[0].url.searchParams.get('maxResults')).toBe('3');
    expect(api.callsTo('GET', /^\/api\/gmail\/messages\/.+$/).map((c) => c.path).sort()).toEqual([
      '/api/gmail/messages/m1',
      '/api/gmail/messages/m2',
    ]);
  });

  test('shows the loading state while syncing', async ({ page, api }) => {
    api.on('GET', '/api/calendar/events', { json: DATA.CALENDAR, delay: 1500 });
    await page.goto('/dashboard');
    await expect(page.getByText('Syncing Gmail...')).toBeVisible();
    await expect(page.getByText('Syncing Calendar...')).toBeVisible();
    await expect(page.getByText('Team sync')).toBeVisible();
  });

  test('empty inbox and calendar show friendly empty states', async ({ page, api }) => {
    api.on('GET', '/api/calendar/events', { json: { items: [] } });
    api.on('GET', '/api/gmail/messages', { json: { resultSizeEstimate: 0 } });
    await page.goto('/dashboard');
    await expect(page.getByText('No recent emails found.')).toBeVisible();
    await expect(page.getByText('No upcoming meetings.')).toBeVisible();
  });

  test('a message whose details fail to load is skipped, the rest still render', async ({ page, api }) => {
    api.fail('GET', '/api/gmail/messages/m2', 500);
    await page.goto('/dashboard');
    await expect(page.getByText('Q3 report')).toBeVisible();
    await expect(page.getByText('Lunch tomorrow')).toHaveCount(0);
  });

  test('an API outage does not crash the page', async ({ page, api }) => {
    api.fail('GET', '/api/calendar/events', 500);
    api.fail('GET', '/api/gmail/messages', 500);
    await page.goto('/dashboard');
    await expect(page.getByText('No recent emails found.')).toBeVisible();
    await expect(page.getByText('No upcoming meetings.')).toBeVisible();
    await expect(page.getByText('System Dashboard')).toBeVisible();
  });

  // BUG: Gmail API snippets are HTML-escaped ("don&#39;t", "&amp;"). The Gmail page decodes them,
  // but Dashboard.jsx renders the snippet as plain text, so users see the raw entities.
  test.fixme('HTML entities in mail snippets are decoded like on the Gmail page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Quarterly numbers attached & ready for review')).toBeVisible();
  });

  // BUG: Dashboard.jsx fetches calendar and mail inside one try block, so a calendar failure
  // aborts before the Gmail request is even sent and the inbox panel claims "No recent emails".
  test.fixme('a calendar outage still shows the inbox', async ({ page, api }) => {
    api.fail('GET', '/api/calendar/events', 500);
    await page.goto('/dashboard');
    await expect(page.getByText('Q3 report')).toBeVisible();
  });
});
