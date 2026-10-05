const { test, expect } = require('../../helpers/api-mocks');

test.describe('ui: assistant chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/assistant');
    await expect(page.getByText("Hello! I'm your Google Assistant.", { exact: false })).toBeVisible();
  });

  test('sending a question shows it, then renders the markdown reply', async ({ page, api }) => {
    api.on('POST', '/api/assistant/ask', {
      json: { action: 'CHAT', response: 'Your next meeting is **Team sync**.\n\n- at 09:30\n- in Room 42' },
    });
    const input = page.getByPlaceholder('Ask me anything...');
    const send = page.locator('form button[type="submit"]');
    await expect(send).toBeDisabled();

    await input.fill('What is my next meeting?');
    const ask = api.waitForCall('POST', '/api/assistant/ask');
    await send.click();
    const call = await ask;

    expect(call.body).toEqual({ query: 'What is my next meeting?', history: [] });
    await expect(input).toHaveValue('');
    await expect(page.getByText('What is my next meeting?')).toBeVisible();
    await expect(page.locator('strong', { hasText: 'Team sync' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'in Room 42' })).toBeVisible();
  });

  test('follow-up questions carry the conversation history (without the greeting)', async ({ page, api }) => {
    const input = page.getByPlaceholder('Ask me anything...');
    await input.fill('first');
    await input.press('Enter');
    await expect(page.locator('strong', { hasText: 'first' })).toBeVisible();

    const ask = api.waitForCall('POST', '/api/assistant/ask');
    await input.fill('second');
    await input.press('Enter');
    const call = await ask;

    expect(call.body).toEqual({
      query: 'second',
      history: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'You said: **first**' },
      ],
    });
    await expect(page.locator('strong', { hasText: 'second' })).toBeVisible();
  });

  test('shows a typing indicator while waiting and blocks double submits', async ({ page, api }) => {
    api.on('POST', '/api/assistant/ask', { json: { response: 'done' }, delay: 1500 });
    const input = page.getByPlaceholder('Ask me anything...');
    await input.fill('slow one');
    await input.press('Enter');
    await expect(page.locator('.animate-bounce').first()).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toBeDisabled();
    await expect(page.getByText('done', { exact: true })).toBeVisible();
    await expect(page.locator('.animate-bounce')).toHaveCount(0);
    expect(api.callsTo('POST', '/api/assistant/ask')).toHaveLength(1);
  });

  test('a backend error is reported in the chat and the page keeps working', async ({ page, api }) => {
    api.fail('POST', '/api/assistant/ask', 500);
    const input = page.getByPlaceholder('Ask me anything...');
    await input.fill('will fail');
    await input.press('Enter');
    await expect(page.getByText('Sorry, I encountered an error reaching the backend.')).toBeVisible();

    api.on('POST', '/api/assistant/ask', { json: { response: 'back online' } });
    await input.fill('again');
    await input.press('Enter');
    await expect(page.getByText('back online')).toBeVisible();
  });

  test('an ERROR action shows the raw details for debugging', async ({ page, api }) => {
    api.on('POST', '/api/assistant/ask', { json: { action: 'ERROR', response: 'OpenAI is unavailable', error: 'quota exceeded' } });
    await page.getByPlaceholder('Ask me anything...').fill('hi');
    await page.getByPlaceholder('Ask me anything...').press('Enter');
    await expect(page.locator('p', { hasText: 'OpenAI is unavailable' })).toBeVisible();
    await expect(page.locator('pre')).toContainText('"error": "quota exceeded"');
  });

  test('a reply without text falls back to a generic message', async ({ page, api }) => {
    api.on('POST', '/api/assistant/ask', { json: { action: 'UNKNOWN' } });
    await page.getByPlaceholder('Ask me anything...').fill('???');
    await page.getByPlaceholder('Ask me anything...').press('Enter');
    await expect(page.getByText("Sorry, I couldn't process that.")).toBeVisible();
  });

  test('blank input is never sent', async ({ page, api }) => {
    const input = page.getByPlaceholder('Ask me anything...');
    await input.fill('   ');
    await input.press('Enter');
    await expect(page.locator('form button[type="submit"]')).toBeDisabled();
    expect(api.callsTo('POST', '/api/assistant/ask')).toHaveLength(0);
  });

  test('suggestion chips fill the input', async ({ page }) => {
    await page.getByRole('button', { name: 'Show my next meetings' }).click();
    await expect(page.getByPlaceholder('Ask me anything...')).toHaveValue('Show my next meetings');
    await page.getByRole('button', { name: 'Draft an email' }).click();
    await expect(page.getByPlaceholder('Ask me anything...')).toHaveValue('Draft an email to X');
  });
});
