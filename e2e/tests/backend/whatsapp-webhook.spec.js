const { test, expect } = require('@playwright/test');
const { WEBHOOK_VERIFY_TOKEN } = require('../../helpers/env');
const { rows, lit, psql, runId } = require('../../helpers/db');

const WEBHOOK = '/api/whatsapp/webhook';

function metaPayload({ from, id, text, profileName }) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              contacts: profileName ? [{ wa_id: from, profile: { name: profileName } }] : [],
              messages: [{ from, id, type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

test.describe('backend: WhatsApp webhook (Meta Cloud API) + database', () => {
  const run = runId();
  const senders = [];

  test.afterAll(() => {
    if (senders.length) psql(`delete from whatsapp_messages where sender_id in (${senders.map(lit).join(',')})`);
  });

  test('verification handshake echoes the challenge for the right token', async ({ request }) => {
    const res = await request.get(WEBHOOK, {
      params: { 'hub.mode': 'subscribe', 'hub.verify_token': WEBHOOK_VERIFY_TOKEN, 'hub.challenge': 'abc123' },
    });
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe('abc123');
  });

  test('verification handshake rejects a wrong token with 403', async ({ request }) => {
    const res = await request.get(WEBHOOK, {
      params: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'abc123' },
    });
    expect(res.status()).toBe(403);
  });

  test('verification handshake rejects a wrong mode with 403', async ({ request }) => {
    const res = await request.get(WEBHOOK, {
      params: { 'hub.mode': 'unsubscribe', 'hub.verify_token': WEBHOOK_VERIFY_TOKEN, 'hub.challenge': 'abc123' },
    });
    expect(res.status()).toBe(403);
  });

  test('verification handshake without parameters is a client error', async ({ request }) => {
    const res = await request.get(WEBHOOK);
    expect(res.status()).toBe(400);
  });

  test('an incoming text message is stored with its profile name', async ({ request }) => {
    const from = `49170${run}`;
    senders.push(from);
    const sid = `wamid.${run}.1`;

    const res = await request.post(WEBHOOK, {
      data: metaPayload({ from, id: sid, text: 'Hallo from e2e', profileName: 'E2E Tester' }),
    });
    expect(res.status()).toBe(200);

    const stored = rows(`select sender_id, sender_name, content, direction, message_sid
                         from whatsapp_messages where message_sid = ${lit(sid)}`);
    expect(stored).toEqual([
      { sender_id: from, sender_name: 'E2E Tester', content: 'Hallo from e2e', direction: 'INCOMING', message_sid: sid },
    ]);
  });

  test('without a contact entry the sender number is used as name', async ({ request }) => {
    const from = `49171${run}`;
    senders.push(from);
    const sid = `wamid.${run}.2`;

    await request.post(WEBHOOK, { data: metaPayload({ from, id: sid, text: 'no profile' }) });

    const [stored] = rows(`select sender_name from whatsapp_messages where message_sid = ${lit(sid)}`);
    expect(stored.sender_name).toBe(from);
  });

  test('non-text messages are acknowledged but not stored', async ({ request }) => {
    const from = `49172${run}`;
    senders.push(from);
    const sid = `wamid.${run}.3`;
    const payload = metaPayload({ from, id: sid, text: 'x' });
    delete payload.entry[0].changes[0].value.messages[0].text;
    payload.entry[0].changes[0].value.messages[0].type = 'image';

    const res = await request.post(WEBHOOK, { data: payload });
    expect(res.status()).toBe(200);
    expect(rows(`select 1 as n from whatsapp_messages where message_sid = ${lit(sid)}`)).toHaveLength(0);
  });

  test('malformed payloads are acknowledged without crashing the service', async ({ request }) => {
    const res = await request.post(WEBHOOK, {
      headers: { 'Content-Type': 'application/json' },
      data: '{ this is not json',
    });
    expect(res.status()).toBe(200);

    const health = await request.get('/api/auth/profile');
    expect(health.status()).toBe(401); // still serving requests
  });
});
