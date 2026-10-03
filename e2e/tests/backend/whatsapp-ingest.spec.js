const { test, expect } = require('@playwright/test');
const { rows, lit, deleteWhatsAppData, runId } = require('../../helpers/db');

const BRIDGE = '/api/whatsapp/bridge';

test.describe('backend: bridge ingest endpoints + database', () => {
  const run = runId();
  const chatIds = [];
  const newChatId = (label) => {
    const id = `e2e-${run}-${label}@s.whatsapp.net`;
    chatIds.push(id);
    return id;
  };

  const chatRow = (chatId) =>
    rows(`select name, is_group, last_message, last_message_direction, last_media_type, unread_count
          from whatsapp_chats where chat_id = ${lit(chatId)}`);
  const messageRows = (waId) =>
    rows(`select chat_id, content, direction, media_type, media_mimetype, media_base64, sender_id
          from whatsapp_messages where message_wa_id = ${lit(waId)}`);

  test.afterAll(() => deleteWhatsAppData(chatIds));

  test.describe('chats', () => {
    test('creates a chat and upserts it on the second call', async ({ request }) => {
      const chatId = newChatId('upsert');

      let res = await request.post(`${BRIDGE}/chat`, {
        data: { chatId, name: 'First name', isGroup: false, lastMessage: 'hi', unreadCount: 2 },
      });
      expect(res.status()).toBe(200);
      expect(chatRow(chatId)).toEqual([
        { name: 'First name', is_group: false, last_message: 'hi', last_message_direction: null, last_media_type: null, unread_count: 2 },
      ]);

      res = await request.post(`${BRIDGE}/chat`, {
        data: { chatId, name: 'Second name', isGroup: true, lastMessage: 'updated', unreadCount: 0 },
      });
      expect(res.status()).toBe(200);

      const after = chatRow(chatId);
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({ name: 'Second name', is_group: true, last_message: 'updated', unread_count: 0 });
    });

    test('rejects a chat without chatId', async ({ request }) => {
      const res = await request.post(`${BRIDGE}/chat`, { data: { name: 'nameless' } });
      expect(res.status()).toBe(400);
    });

    test('malformed JSON is a 400 and does not leak internals', async ({ request }) => {
      const res = await request.post(`${BRIDGE}/chat`, {
        headers: { 'Content-Type': 'application/json' },
        data: '{ nope',
      });
      expect(res.status()).toBe(400);
      expect(await res.text()).not.toMatch(/Exception|at com\.|org\.springframework/);
    });

    test('chat-preview creates the chat when it does not exist yet', async ({ request }) => {
      const chatId = newChatId('preview-new');
      const res = await request.post(`${BRIDGE}/chat-preview`, {
        data: {
          chatId,
          lastMessage: 'preview text',
          lastMessageTimestamp: '2026-01-02T03:04:05.000Z',
          lastMessageDirection: 'INCOMING',
          pushName: 'Preview Person',
        },
      });
      expect(res.status()).toBe(200);
      expect(chatRow(chatId)).toEqual([
        { name: 'Preview Person', is_group: false, last_message: 'preview text', last_message_direction: 'INCOMING', last_media_type: null, unread_count: 0 },
      ]);
    });

    test('chat-preview without chatId is rejected', async ({ request }) => {
      const res = await request.post(`${BRIDGE}/chat-preview`, { data: { lastMessage: 'x' } });
      expect(res.status()).toBe(400);
    });

    test('contact-name replaces a phone-number name but keeps a real name', async ({ request }) => {
      const chatId = newChatId('contact-name');
      await request.post(`${BRIDGE}/chat`, { data: { chatId, name: '+49 170 1234567' } });

      let res = await request.post(`${BRIDGE}/contact-name`, { data: { chatId, name: 'Real Name' } });
      expect(res.status()).toBe(200);
      expect(chatRow(chatId)[0].name).toBe('Real Name');

      res = await request.post(`${BRIDGE}/contact-name`, { data: { chatId, name: 'Other Name' } });
      expect(res.status()).toBe(200);
      expect(chatRow(chatId)[0].name).toBe('Real Name');
    });

    test('contact-name validates its input', async ({ request }) => {
      expect((await request.post(`${BRIDGE}/contact-name`, { data: { name: 'x' } })).status()).toBe(400);
      expect((await request.post(`${BRIDGE}/contact-name`, { data: { chatId: 'a@b', name: '  ' } })).status()).toBe(400);
    });
  });

  test.describe('messages', () => {
    const message = (chatId, messageId, extra = {}) => ({
      messageId,
      chatId,
      isGroup: false,
      fromMe: false,
      senderId: chatId,
      body: 'hello',
      timestamp: new Date().toISOString(),
      ...extra,
    });

    test('stores an incoming message and updates the chat preview', async ({ request }) => {
      const chatId = newChatId('msg-in');
      const waId = `${run}-in-1`;
      await request.post(`${BRIDGE}/chat`, { data: { chatId, name: '+49 170 000' } });

      const res = await request.post(`${BRIDGE}/message`, {
        data: message(chatId, waId, { body: 'incoming hello', chatName: 'Alice' }),
      });
      expect(res.status()).toBe(200);

      expect(messageRows(waId)).toMatchObject([
        { chat_id: chatId, content: 'incoming hello', direction: 'INCOMING', media_type: null },
      ]);
      // The push name resolves a phone-number chat name, and the preview follows the message.
      expect(chatRow(chatId)[0]).toMatchObject({
        name: 'Alice',
        last_message: 'incoming hello',
        last_message_direction: 'INCOMING',
      });
    });

    test('stores an outgoing message with direction OUTGOING', async ({ request }) => {
      const chatId = newChatId('msg-out');
      const waId = `${run}-out-1`;
      await request.post(`${BRIDGE}/chat`, { data: { chatId, name: 'Bob' } });

      await request.post(`${BRIDGE}/message`, {
        data: message(chatId, waId, { fromMe: true, senderId: 'me', body: 'outgoing hi' }),
      });

      expect(messageRows(waId)[0]).toMatchObject({ direction: 'OUTGOING', sender_id: 'me', content: 'outgoing hi' });
      expect(chatRow(chatId)[0]).toMatchObject({ name: 'Bob', last_message_direction: 'OUTGOING' });
    });

    test('is idempotent: the same message id is stored once', async ({ request }) => {
      const chatId = newChatId('msg-dedup');
      const waId = `${run}-dedup-1`;
      await request.post(`${BRIDGE}/chat`, { data: { chatId, name: 'Dedup' } });

      for (let i = 0; i < 3; i++) {
        const res = await request.post(`${BRIDGE}/message`, { data: message(chatId, waId) });
        expect(res.status()).toBe(200);
      }
      expect(messageRows(waId)).toHaveLength(1);
    });

    test('stores media and shows a media preview for caption-less messages', async ({ request }) => {
      const chatId = newChatId('msg-media');
      const waId = `${run}-media-1`;
      await request.post(`${BRIDGE}/chat`, { data: { chatId, name: 'Media' } });
      const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

      await request.post(`${BRIDGE}/message`, {
        data: message(chatId, waId, { body: '', mediaType: 'IMAGE', mediaData: { data: tinyPng, mimetype: 'image/png' } }),
      });

      expect(messageRows(waId)[0]).toMatchObject({ media_type: 'IMAGE', media_mimetype: 'image/png', media_base64: tinyPng });
      expect(chatRow(chatId)[0]).toMatchObject({ last_message: '📎 image', last_media_type: 'IMAGE' });
    });

    test('rejects a message without messageId', async ({ request }) => {
      const res = await request.post(`${BRIDGE}/message`, { data: { chatId: 'x@s.whatsapp.net', body: 'no id' } });
      expect(res.status()).toBe(400);
    });

    test('unicode and long bodies survive the round trip', async ({ request }) => {
      const chatId = newChatId('msg-unicode');
      const waId = `${run}-unicode-1`;
      const body = `Grüße 你好 🚀 ${'x'.repeat(5000)}`;
      await request.post(`${BRIDGE}/chat`, { data: { chatId, name: 'Unicode' } });

      await request.post(`${BRIDGE}/message`, { data: message(chatId, waId, { body }) });

      expect(messageRows(waId)[0].content).toBe(body);
    });
  });

  test.describe('bridge status proxy', () => {
    test('reports the same state the bridge reports', async ({ request, playwright }) => {
      const res = await request.get(`${BRIDGE}/status`);
      expect(res.status()).toBe(200);
      const status = await res.json();

      expect(status).toMatchObject({ authenticated: expect.any(Boolean), ready: expect.any(Boolean), hasQr: expect.any(Boolean) });
      // Without a linked phone the stack must never claim to be ready.
      expect(status.ready).toBe(false);
    });
  });
});
