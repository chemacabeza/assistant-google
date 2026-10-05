const { test, expect, DATA } = require('../../helpers/api-mocks');

// Note: the Gmail page has no message detail view; rows only show subject, date and snippet.

test.describe('ui: gmail', () => {
  test('lists the inbox with subjects, dates and decoded snippets', async ({ page, api }) => {
    await page.goto('/gmail');

    await expect(page.getByText('Q3 report')).toBeVisible();
    await expect(page.getByText('Lunch tomorrow')).toBeVisible();
    // Gmail returns HTML-escaped snippets; the page decodes the entities.
    await expect(page.getByText('Quarterly numbers attached & ready for review')).toBeVisible();

    const list = api.callsTo('GET', '/api/gmail/messages')[0];
    expect(list.url.searchParams.get('maxResults')).toBe('15');
    expect(list.url.searchParams.get('q')).toBe('');
    expect(api.callsTo('GET', /^\/api\/gmail\/messages\/.+$/)).toHaveLength(2);
  });

  test('a message whose details fail still shows up as a row', async ({ page, api }) => {
    api.fail('GET', '/api/gmail/messages/m2', 500);
    await page.goto('/gmail');
    await expect(page.getByText('Q3 report')).toBeVisible();
    await expect(page.getByText('(No Subject)')).toBeVisible();
    await expect(page.getByText('No snippet available')).toBeVisible();
  });

  test('searching sends the query to the backend', async ({ page, api }) => {
    api.on('GET', '/api/gmail/messages', ({ url }) => ({
      json: url.searchParams.get('q') === 'lunch' ? DATA.gmailList(['m2']) : DATA.gmailList(),
    }));
    await page.goto('/gmail');
    await expect(page.getByText('Q3 report')).toBeVisible();

    await page.getByPlaceholder('Search emails...').fill('lunch');
    await expect(page.getByText('Q3 report')).toHaveCount(0);
    await expect(page.getByText('Lunch tomorrow')).toBeVisible();
    expect(api.callsTo('GET', '/api/gmail/messages').some((c) => c.url.searchParams.get('q') === 'lunch')).toBe(true);
  });

  test('an empty inbox shows the empty state', async ({ page, api }) => {
    api.on('GET', '/api/gmail/messages', { json: { resultSizeEstimate: 0 } });
    await page.goto('/gmail');
    await expect(page.getByText('No recent emails found matching your query.')).toBeVisible();
  });

  test('an inbox outage ends in the empty state instead of a crash', async ({ page, api }) => {
    api.fail('GET', '/api/gmail/messages', 500);
    await page.goto('/gmail');
    // react-query retries three times with back-off before giving up.
    await expect(page.getByText('No recent emails found matching your query.')).toBeVisible({ timeout: 20_000 });
  });

  test('refresh reloads the inbox', async ({ page, api }) => {
    await page.goto('/gmail');
    await expect(page.getByText('Q3 report')).toBeVisible();
    const before = api.callsTo('GET', '/api/gmail/messages').length;
    const reload = api.waitForCall('GET', '/api/gmail/messages');
    await page.locator('button:has(svg.lucide-refresh-cw)').click();
    await reload;
    expect(api.callsTo('GET', '/api/gmail/messages').length).toBe(before + 1);
  });

  test.describe('compose', () => {
    const composer = (page) => page.locator('form', { has: page.getByPlaceholder('Recipient') });

    test('compose and send posts the structured message and closes the composer', async ({ page, api, dialogs }) => {
      await page.goto('/gmail');
      await page.getByRole('button', { name: 'Compose' }).click();
      await expect(page.getByRole('heading', { name: 'New Message' })).toBeVisible();

      const form = composer(page);
      // "From" lists the linked accounts and defaults to the first one.
      await expect(form.locator('select')).toHaveValue(DATA.ACCOUNTS[0].email);
      await form.locator('select').selectOption('work@example.com');
      await form.getByPlaceholder('Recipient').fill('carol@example.com');
      await form.getByPlaceholder('Subject').fill('Grüße — ünïcödé 🚀');
      await form.getByPlaceholder('Type your message here...').fill('Line one\nLine two');

      const send = api.waitForCall('POST', '/api/gmail/send');
      await form.getByRole('button', { name: 'Send' }).click();
      const call = await send;

      expect(call.body).toEqual({
        from: 'work@example.com',
        to: 'carol@example.com',
        subject: 'Grüße — ünïcödé 🚀',
        body: 'Line one\nLine two',
      });
      await expect(page.getByRole('heading', { name: 'New Message' })).toHaveCount(0);
      await expect.poll(() => dialogs.map((d) => d.message)).toContain('Email sent successfully!');

      // The draft is cleared for the next message.
      await page.getByRole('button', { name: 'Compose' }).click();
      await expect(composer(page).getByPlaceholder('Subject')).toHaveValue('');
    });

    test('templates can be inserted into the body', async ({ page }) => {
      await page.goto('/gmail');
      await page.getByRole('button', { name: 'Compose' }).click();
      const form = composer(page);
      const body = form.getByPlaceholder('Type your message here...');
      await body.fill('Hi,');

      await form.getByRole('button', { name: 'Follow up' }).click();
      await expect(body).toHaveValue(`Hi,\n\n${DATA.TEMPLATES[0].content}`);
      await form.getByRole('button', { name: 'Invoice sent' }).click();
      await expect(body).toHaveValue(`Hi,\n\n${DATA.TEMPLATES[0].content}\n\nInvoice attached.`);
    });

    test('required fields are enforced before anything is sent', async ({ page, api }) => {
      await page.goto('/gmail');
      await page.getByRole('button', { name: 'Compose' }).click();
      const form = composer(page);
      await form.getByPlaceholder('Recipient').fill('not-an-email');
      await form.getByRole('button', { name: 'Send' }).click();

      await expect(page.getByRole('heading', { name: 'New Message' })).toBeVisible();
      expect(api.callsTo('POST', '/api/gmail/send')).toHaveLength(0);
    });

    test('a failed send keeps the composer open with the draft intact', async ({ page, api }) => {
      api.fail('POST', '/api/gmail/send', 500);
      await page.goto('/gmail');
      await page.getByRole('button', { name: 'Compose' }).click();
      const form = composer(page);
      await form.getByPlaceholder('Recipient').fill('carol@example.com');
      await form.getByPlaceholder('Subject').fill('Will fail');
      await form.getByPlaceholder('Type your message here...').fill('body');

      const send = api.waitForCall('POST', '/api/gmail/send');
      await form.getByRole('button', { name: 'Send' }).click();
      await send;

      await expect(form.getByRole('button', { name: 'Send' })).toBeEnabled();
      await expect(page.getByRole('heading', { name: 'New Message' })).toBeVisible();
      await expect(form.getByPlaceholder('Subject')).toHaveValue('Will fail');
    });

    test('without linked accounts the signed-in address is offered as sender', async ({ page, api }) => {
      api.on('GET', '/api/accounts', { json: [] });
      await page.goto('/gmail');
      await page.getByRole('button', { name: 'Compose' }).click();
      await expect(composer(page).locator('select option')).toHaveText([DATA.USER.email]);
    });

    test('cancel and the close icon discard the composer', async ({ page }) => {
      await page.goto('/gmail');
      await page.getByRole('button', { name: 'Compose' }).click();
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('heading', { name: 'New Message' })).toHaveCount(0);

      await page.getByRole('button', { name: 'Compose' }).click();
      await page.getByRole('heading', { name: 'New Message' }).locator('xpath=..').getByRole('button').click();
      await expect(page.getByRole('heading', { name: 'New Message' })).toHaveCount(0);
    });
  });
});
