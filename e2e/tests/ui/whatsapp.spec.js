const { test, expect, DATA } = require('../../helpers/api-mocks');

// The WhatsApp page talks to the backend over HTTP and to the bridge over Socket.IO. The `bridge`
// fixture fakes that socket (helpers/api-mocks.js), the `api` fixture fakes the backend.

const [ALICE, , BOB] = DATA.WA_CHATS;
const chatList = (page) => page.locator('div[style*="width: 360px"]');
const header = (page) => page.locator('div[style*="height: 60px"]');
const input = (page) => page.getByPlaceholder('Type a message');

test.describe('ui: whatsapp', () => {
  test('a ready bridge shows the chat list and opens the latest chat', async ({ page, api, bridge }) => {
    await page.goto('/whatsapp');

    await expect(chatList(page).getByText('Alice', { exact: true })).toBeVisible();
    await expect(chatList(page).getByText('Family Group')).toBeVisible();
    await expect(chatList(page).getByText('Dinner at 8')).toBeVisible();
    // Media-only last message is described, unread count is badged.
    await expect(chatList(page).getByText('Photo', { exact: true })).toBeVisible();
    await expect(chatList(page).getByText('2', { exact: true })).toBeVisible();

    await expect(header(page).getByText('Alice', { exact: true })).toBeVisible();
    await expect(header(page).getByText('click here for contact info')).toBeVisible();
    await expect(page.getByText('Hi there!')).toBeVisible();
    await expect(page.getByText('Hello Alice')).toBeVisible();
    await expect(page.getByText('Today', { exact: true })).toBeVisible();

    expect(bridge.connects).toBeGreaterThanOrEqual(1);
    expect(api.callsTo('GET', `/api/whatsapp/chats/${encodeURIComponent(ALICE.chatId)}/messages`).length).toBeGreaterThan(0);
  });

  test('selecting another chat loads its messages', async ({ page, api }) => {
    await page.goto('/whatsapp');
    await expect(page.getByText('Hi there!')).toBeVisible();

    await chatList(page).getByText('Family Group').click();
    await expect(header(page).getByText('Family Group')).toBeVisible();
    await expect(header(page).getByText('click here for group info')).toBeVisible();
    await expect(page.getByText('Great, see you')).toBeVisible();
    await expect(page.getByText('Carol', { exact: true })).toBeVisible(); // group author
    await expect(page.getByText('Hi there!')).toHaveCount(0);

    await chatList(page).getByText('Bob', { exact: true }).click();
    await expect(page.getByText('Here is the file')).toBeVisible();
    await expect(page.getByText('Document', { exact: true })).toBeVisible();
    expect(api.callsTo('GET', `/api/whatsapp/chats/${encodeURIComponent(BOB.chatId)}/messages`).length).toBeGreaterThan(0);
  });

  test('sending a message posts it to the selected chat and reloads the conversation', async ({ page, api }) => {
    let sent = null;
    api.on('POST', '/api/whatsapp/send', ({ body }) => {
      sent = body;
      return { json: { success: true, messageId: 'out-9' } };
    });
    api.on('GET', /^\/api\/whatsapp\/chats\/(.+)\/messages$/, ({ params }) => {
      const list = DATA.WA_MESSAGES[decodeURIComponent(params[0])] || [];
      return {
        json: sent && decodeURIComponent(params[0]) === ALICE.chatId
          ? [...list, { id: 99, messageWaId: 'out-9', chatId: ALICE.chatId, content: sent.content, direction: 'OUTGOING', timestamp: new Date().toISOString() }]
          : list,
      };
    });
    await page.goto('/whatsapp');
    await expect(page.getByText('Hi there!')).toBeVisible();

    await input(page).fill('On my way 🚗');
    const post = api.waitForCall('POST', '/api/whatsapp/send');
    await input(page).press('Enter');
    const call = await post;

    expect(call.body).toEqual({ to: ALICE.chatId, content: 'On my way 🚗' });
    await expect(input(page)).toHaveValue('');
    await expect(page.getByText('On my way 🚗')).toBeVisible();
  });

  test('blank messages are not sent', async ({ page, api }) => {
    await page.goto('/whatsapp');
    await expect(page.getByText('Hi there!')).toBeVisible();
    await input(page).fill('   ');
    await input(page).press('Enter');
    expect(api.callsTo('POST', '/api/whatsapp/send')).toHaveLength(0);
  });

  test('a failed send keeps the typed text so it can be retried', async ({ page, api }) => {
    api.fail('POST', '/api/whatsapp/send', 503, { success: false, error: 'Not connected to WhatsApp' });
    await page.goto('/whatsapp');
    await expect(page.getByText('Hi there!')).toBeVisible();
    await input(page).fill('please arrive');
    const post = api.waitForCall('POST', '/api/whatsapp/send');
    await input(page).press('Enter');
    await post;
    await expect(input(page)).toBeEnabled();
    await expect(input(page)).toHaveValue('please arrive');
  });

  test('search and filters narrow the chat list', async ({ page }) => {
    await page.goto('/whatsapp');
    await expect(chatList(page).getByText('Family Group')).toBeVisible();

    await page.getByRole('button', { name: 'Unread' }).click();
    await expect(chatList(page).getByText('Alice', { exact: true })).toBeVisible();
    await expect(chatList(page).getByText('Family Group')).toHaveCount(0);

    await page.getByRole('button', { name: 'Groups' }).click();
    await expect(chatList(page).getByText('Family Group')).toBeVisible();
    await expect(chatList(page).getByText('Bob', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'All' }).click();
    await page.getByPlaceholder('Search or start new chat').fill('bo');
    await expect(chatList(page).getByText('Bob', { exact: true })).toBeVisible();
    await expect(chatList(page).getByText('Family Group')).toHaveCount(0);

    await page.getByPlaceholder('Search or start new chat').fill('nobody here');
    await expect(page.getByText('No chats match your search')).toBeVisible();
  });

  test('a "new_message" event from the bridge refreshes the open chat', async ({ page, api, bridge }) => {
    let extra = [];
    api.on('GET', /^\/api\/whatsapp\/chats\/(.+)\/messages$/, ({ params }) => ({
      json: [...(DATA.WA_MESSAGES[decodeURIComponent(params[0])] || []), ...extra],
    }));
    await page.goto('/whatsapp');
    await expect(page.getByText('Hi there!')).toBeVisible();

    extra = [{ id: 77, messageWaId: 'wa77', chatId: ALICE.chatId, content: 'Pushed in real time', direction: 'INCOMING', timestamp: new Date().toISOString() }];
    bridge.emit('new_message', { chatId: ALICE.chatId });
    await expect(page.getByText('Pushed in real time')).toBeVisible({ timeout: 5000 });
  });

  test('a "history_synced" event shows the sync banner', async ({ page, bridge }) => {
    await page.goto('/whatsapp');
    await expect(page.getByText('Hi there!')).toBeVisible();
    bridge.emit('history_synced', { chats: 12, messages: 345 });
    await expect(page.getByText('Synced 12 chats · 345 messages')).toBeVisible();
  });

  test('no chats yet shows the empty state', async ({ page, api }) => {
    api.on('GET', '/api/whatsapp/chats', { json: [] });
    await page.goto('/whatsapp');
    await expect(page.getByText('No conversations yet')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'WhatsApp Web' })).toBeVisible();
  });

  test('an unlinked bridge pushes its QR code over the socket', async ({ page, api, bridge }) => {
    api.on('GET', '/api/whatsapp/bridge/status', { json: { authenticated: false, ready: false, hasQr: true } });
    await page.goto('/whatsapp');
    await expect(page.getByRole('heading', { name: 'Link a device to use WhatsApp' })).toBeVisible();

    const qr = `data:image/png;base64,${DATA.PNG_1PX.toString('base64')}`;
    bridge.emit('state', { connected: false, hasQr: true, qr });
    await expect(page.getByRole('img', { name: 'WhatsApp QR' })).toHaveAttribute('src', qr);
    await expect(page.getByText('Go to Linked Devices')).toBeVisible();
    expect(api.callsTo('GET', '/api/whatsapp/chats')).toHaveLength(0);
  });

  // BUG: WhatsApp.jsx passes the axios *response* to URL.createObjectURL() instead of response.data,
  // which throws (swallowed by .catch), so the QR fetched over REST is never shown; the page only
  // works if the bridge also pushes the QR over the socket.
  test.fixme('an unlinked bridge shows the QR code fetched from the backend', async ({ page, api }) => {
    api.on('GET', '/api/whatsapp/bridge/status', { json: { authenticated: false, ready: false, hasQr: true } });
    await page.goto('/whatsapp');
    await expect(page.getByRole('heading', { name: 'Link a device to use WhatsApp' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'WhatsApp QR' })).toBeVisible();
    await expect(page.getByText('Go to Linked Devices')).toBeVisible();
    expect(api.callsTo('GET', '/api/whatsapp/bridge/qr')).toHaveLength(1);
    expect(api.callsTo('GET', '/api/whatsapp/chats')).toHaveLength(0);
  });

  test('a QR pushed over the socket is shown, and "ready" switches to the chats', async ({ page, api, bridge }) => {
    api.on('GET', '/api/whatsapp/bridge/status', { json: { authenticated: false, ready: false, hasQr: false } });
    await page.goto('/whatsapp');
    await expect(page.getByRole('heading', { name: 'Link a device to use WhatsApp' })).toBeVisible();

    const qr = `data:image/png;base64,${DATA.PNG_1PX.toString('base64')}`;
    bridge.emit('qr', { qr });
    await expect(page.getByRole('img', { name: 'WhatsApp QR' })).toHaveAttribute('src', qr);

    bridge.emit('ready', { status: 'connected' });
    await expect(chatList(page).getByText('Family Group')).toBeVisible();
  });

  test('an offline bridge says so and "Retry" checks again', async ({ page, api, bridge }) => {
    bridge.mode = 'offline';
    await page.goto('/whatsapp');
    await expect(page.getByText('Bridge is offline.')).toBeVisible();

    api.on('GET', '/api/whatsapp/bridge/status', { json: { authenticated: false, ready: false, hasQr: true } });
    const status = api.waitForCall('GET', '/api/whatsapp/bridge/status');
    await page.getByRole('button', { name: 'Retry' }).click();
    await status;
    await expect(page.getByText('Bridge is offline.')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Link a device to use WhatsApp' })).toBeVisible();
  });

  test('a backend outage on the status call is shown as offline', async ({ page, api }) => {
    api.fail('GET', '/api/whatsapp/bridge/status', 502);
    await page.goto('/whatsapp');
    await expect(page.getByText('Bridge is offline.')).toBeVisible();
  });

  test('a chat list outage leaves the page usable', async ({ page, api }) => {
    api.fail('GET', '/api/whatsapp/chats', 500);
    await page.goto('/whatsapp');
    await expect(page.getByText('No conversations yet')).toBeVisible();
    await page.getByTitle('Back to Dashboard').click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('"Log out" from the menu asks first and calls the bridge logout', async ({ page, api, dialogs }) => {
    await page.goto('/whatsapp');
    await expect(page.getByText('Hi there!')).toBeVisible();
    const menu = chatList(page).locator('button:has(svg.lucide-ellipsis-vertical), button:has(svg.lucide-more-vertical)').first();

    dialogs.answer = false;
    await menu.click();
    await page.getByText('Log out', { exact: true }).click();
    await expect.poll(() => dialogs.length).toBe(1);
    expect(api.callsTo('POST', '/api/whatsapp/bridge/logout')).toHaveLength(0);

    dialogs.answer = true; // the menu is still open after the cancelled confirm
    const logout = api.waitForCall('POST', '/api/whatsapp/bridge/logout');
    await page.getByText('Log out', { exact: true }).click();
    await logout;
  });

  test('"RESET SESSION" needs confirmation, then wipes local data and calls the bridge reset', async ({ page, api, dialogs }) => {
    await page.goto('/whatsapp');
    await expect(page.getByText('Hi there!')).toBeVisible();
    await page.evaluate(() => localStorage.setItem('wa-test', '1'));

    dialogs.answer = false;
    await page.getByRole('button', { name: 'RESET SESSION' }).click();
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0].message).toContain('NUCLEAR RESET');
    expect(api.callsTo('POST', '/api/whatsapp/bridge/reset')).toHaveLength(0);
    await expect(page.getByText('Hi there!')).toBeVisible();

    dialogs.answer = true;
    const reset = api.waitForCall('POST', '/api/whatsapp/bridge/reset');
    await page.getByRole('button', { name: 'RESET SESSION' }).click();
    await reset;
    await expect(page.getByText('Generating QR code…')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('wa-test'))).toBeNull();
  });
});
