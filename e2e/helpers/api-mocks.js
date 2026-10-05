// Fixtures for the "ui" project: the real built SPA (served by the e2e nginx) with every backend
// call answered by Playwright. Each test starts signed in, with deterministic data, no network
// access outside the frontend origin, and a fake WhatsApp bridge socket.
const { test: base, expect } = require('@playwright/test');
const { urls, USERS } = require('./env');

const FRONTEND_ORIGIN = new URL(urls.frontend).origin;

// ─── Mock data (shapes copied from the backend controllers / Google API responses) ──────────

const USER = {
  id: 1,
  email: USERS.primary.email,
  name: USERS.primary.name,
  picture: null,
  createdAt: '2026-01-15T10:00:00',
};

const ACCOUNTS = [
  { id: 1, email: USERS.primary.email, name: USERS.primary.name },
  { id: 2, email: 'work@example.com', name: 'Work' },
];

const GMAIL_MESSAGES = {
  m1: {
    id: 'm1',
    threadId: 't1',
    snippet: 'Quarterly numbers attached &amp; ready for review',
    payload: {
      headers: [
        { name: 'From', value: 'Alice Smith <alice@example.com>' },
        { name: 'Subject', value: 'Q3 report' },
        { name: 'Date', value: 'Mon, 05 Oct 2026 09:15:00 +0000' },
      ],
    },
  },
  m2: {
    id: 'm2',
    threadId: 't2',
    snippet: 'Are we still on for lunch?',
    payload: {
      headers: [
        { name: 'From', value: 'Bob <bob@example.com>' },
        { name: 'Subject', value: 'Lunch tomorrow' },
        { name: 'Date', value: 'Sun, 04 Oct 2026 18:00:00 +0000' },
      ],
    },
  },
};

const gmailList = (ids = Object.keys(GMAIL_MESSAGES)) => ({
  messages: ids.map((id) => ({ id, threadId: GMAIL_MESSAGES[id]?.threadId ?? id })),
  resultSizeEstimate: ids.length,
});

const CALENDAR = {
  items: [
    {
      id: 'evt1',
      summary: 'Team sync',
      location: 'Room 42',
      start: { dateTime: '2026-11-02T09:30:00Z' },
      end: { dateTime: '2026-11-02T10:00:00Z' },
      htmlLink: 'https://calendar.google.com/calendar/event?eid=evt1',
    },
    {
      id: 'evt2',
      summary: 'Company holiday',
      start: { date: '2026-12-24' },
      end: { date: '2026-12-25' },
    },
  ],
};

const FOLDER = 'application/vnd.google-apps.folder';
const DRIVE_ROOT = {
  files: [
    { id: 'fold1', name: 'Projects', mimeType: FOLDER, owners: [{ me: true, displayName: 'E2E User' }], modifiedTime: '2026-03-04T10:00:00Z' },
    { id: 'file1', name: 'Budget.xlsx', mimeType: 'application/vnd.ms-excel', size: '2048', owners: [{ me: false, displayName: 'Alice' }], modifiedTime: '2026-02-01T10:00:00Z' },
    { id: 'file2', name: 'Holiday.png', mimeType: 'image/png', size: '3145728', owners: [{ me: true }], modifiedTime: '2026-01-10T10:00:00Z' },
  ],
};
const DRIVE_PROJECTS = {
  files: [{ id: 'file3', name: 'Roadmap.docx', mimeType: 'application/msword', size: '1024', owners: [{ me: true }], modifiedTime: '2026-03-05T10:00:00Z' }],
};

const PHOTOS_SESSION = { id: 'sess-1', pickerUri: 'https://photospicker.google.com/session/sess-1', mediaItemsSet: false };
const PHOTOS_MEDIA = {
  mediaItems: [
    { id: 'ph1', baseUrl: 'https://lh3.googleusercontent.com/ph1', filename: 'beach.jpg' },
    { id: 'ph2', baseUrl: 'https://lh3.googleusercontent.com/ph2', filename: 'mountain.jpg' },
  ],
};

const TEMPLATES = [
  {
    id: 11,
    title: 'Follow up',
    content: 'Hello Alice,\nthanks for your time today.',
    category: 'General',
    fromEmail: USERS.primary.email,
    targetEmail: 'alice@example.com',
    sendAt: '2099-01-02T08:30:00',
    status: 'PENDING',
  },
  { id: 12, title: 'Invoice sent', content: 'Invoice attached.', category: 'General', targetEmail: 'bob@example.com', status: 'SENT' },
  { id: 13, title: 'Bounced', content: 'Never arrived.', category: 'General', targetEmail: 'nobody@example.com', status: 'FAILED' },
];

const CONTACTS = [
  { name: 'Alice Smith', email: 'alice@example.com' },
  { name: 'Bob Jones', email: 'bob@example.com' },
];

const CONFIG_ENV = {
  GOOGLE_CLIENT_ID: 'client-id-123.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'super-secret',
  OPENAI_API_KEY: 'sk-test-123',
  WHATSAPP_VERIFY_TOKEN: 'verify-me',
};

const AUDIT = [
  { id: 3, actionType: 'SEND_EMAIL', details: 'Executed sendEmail', timestamp: new Date(Date.now() - 5 * 60_000).toISOString() },
  { id: 2, actionType: 'CREATE_EVENT', details: 'Executed createEvent', timestamp: new Date(Date.now() - 3 * 3600_000).toISOString() },
  { id: 1, actionType: 'DRIVE_LIST_FILES', details: 'Executed listFiles', timestamp: '2026-01-02T10:00:00' },
];

const now = Date.now();
const WA_CHATS = [
  { chatId: '491701111111@s.whatsapp.net', name: 'Alice', group: false, lastMessage: 'See you soon', lastMessageTimestamp: new Date(now - 60_000).toISOString(), lastMessageDirection: 'INCOMING', unreadCount: 2 },
  { chatId: '120363000000000000@g.us', name: 'Family Group', group: true, lastMessage: 'Dinner at 8', lastMessageTimestamp: new Date(now - 3600_000).toISOString(), lastMessageDirection: 'OUTGOING', unreadCount: 0 },
  { chatId: '491702222222@s.whatsapp.net', name: 'Bob', group: false, lastMessage: null, lastMediaType: 'IMAGE', lastMessageTimestamp: new Date(now - 7200_000).toISOString(), unreadCount: 0 },
];
const WA_MESSAGES = {
  '491701111111@s.whatsapp.net': [
    { id: 1, messageWaId: 'wa1', chatId: '491701111111@s.whatsapp.net', content: 'Hi there!', direction: 'INCOMING', timestamp: new Date(now - 120_000).toISOString() },
    { id: 2, messageWaId: 'wa2', chatId: '491701111111@s.whatsapp.net', content: 'Hello Alice', direction: 'OUTGOING', timestamp: new Date(now - 90_000).toISOString() },
    { id: 3, messageWaId: 'wa3', chatId: '491701111111@s.whatsapp.net', content: 'See you soon', direction: 'INCOMING', timestamp: new Date(now - 60_000).toISOString() },
  ],
  '120363000000000000@g.us': [
    { id: 4, messageWaId: 'wa4', chatId: '120363000000000000@g.us', content: 'Dinner at 8', direction: 'OUTGOING', timestamp: new Date(now - 3600_000).toISOString() },
    { id: 5, messageWaId: 'wa5', chatId: '120363000000000000@g.us', content: 'Great, see you', authorName: 'Carol', direction: 'INCOMING', timestamp: new Date(now - 3500_000).toISOString() },
  ],
  '491702222222@s.whatsapp.net': [
    { id: 6, messageWaId: 'wa6', chatId: '491702222222@s.whatsapp.net', content: 'Here is the file', mediaType: 'DOCUMENT', direction: 'INCOMING', timestamp: new Date(now - 7200_000).toISOString() },
  ],
};

// 1x1 transparent PNG
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const DATA = {
  USER, ACCOUNTS, GMAIL_MESSAGES, gmailList, CALENDAR, DRIVE_ROOT, DRIVE_PROJECTS, PHOTOS_SESSION, PHOTOS_MEDIA,
  TEMPLATES, CONTACTS, CONFIG_ENV, AUDIT, WA_CHATS, WA_MESSAGES, PNG_1PX,
};

const clone = (v) => JSON.parse(JSON.stringify(v));

// ─── API mock ───────────────────────────────────────────────────────────────────────────────

/** Default answers for every endpoint the SPA calls. Handlers get ({ url, body, method, request, params }). */
function defaultRoutes() {
  return [
    ['GET', '/api/auth/profile', () => ({ json: USER })],
    ['POST', '/api/auth/logout', () => ({ status: 200, json: {} })],
    ['GET', '/api/accounts', () => ({ json: ACCOUNTS })],
    ['POST', '/api/accounts', ({ body }) => ({ json: { id: 99, ...body } })],
    ['DELETE', /^\/api\/accounts\/(\d+)$/, () => ({ status: 200, body: '' })],
    ['GET', '/api/calendar/events', () => ({ json: CALENDAR })],
    ['POST', '/api/calendar/events', ({ body }) => ({ json: { id: 'new-evt', ...body } })],
    ['GET', '/api/gmail/messages', () => ({ json: gmailList() })],
    ['GET', /^\/api\/gmail\/messages\/([^/]+)$/, ({ params }) =>
      GMAIL_MESSAGES[params[0]] ? { json: GMAIL_MESSAGES[params[0]] } : { status: 404, json: { error: 'not found' } }],
    ['POST', '/api/gmail/send', () => ({ json: { id: 'sent-1', labelIds: ['SENT'] } })],
    ['GET', '/api/templates', () => ({ json: TEMPLATES })],
    ['POST', '/api/templates', ({ body }) => ({ json: { ...body, id: 100, status: 'PENDING' } })],
    ['PUT', /^\/api\/templates\/(\d+)$/, ({ body, params }) => ({ json: { ...body, id: Number(params[0]) } })],
    ['DELETE', /^\/api\/templates\/(\d+)$/, () => ({ status: 200, body: '' })],
    ['GET', '/api/contacts', () => ({ json: CONTACTS })],
    ['GET', '/api/drive/files', ({ url }) => ({ json: (url.searchParams.get('q') || '').includes("'fold1' in parents") ? DRIVE_PROJECTS : DRIVE_ROOT })],
    ['POST', '/api/photos/session', () => ({ json: PHOTOS_SESSION })],
    ['GET', /^\/api\/photos\/session\/([^/]+)$/, ({ params }) => ({ json: { id: params[0], mediaItemsSet: true } })],
    ['GET', '/api/photos/media', () => ({ json: PHOTOS_MEDIA })],
    ['POST', '/api/assistant/ask', ({ body }) => ({ json: { action: 'CHAT', response: `You said: **${body?.query}**` } })],
    ['GET', '/api/config/env', () => ({ json: CONFIG_ENV })],
    ['POST', '/api/config/env', () => ({ json: { success: true, message: 'Configuration saved. Restart containers to apply changes.' } })],
    ['GET', '/api/audit', () => ({ json: AUDIT })],
    ['GET', '/api/whatsapp/bridge/status', () => ({ json: { authenticated: true, ready: true, hasQr: false } })],
    ['GET', '/api/whatsapp/bridge/qr', () => ({ status: 200, contentType: 'image/png', body: PNG_1PX })],
    ['GET', '/api/whatsapp/chats', () => ({ json: WA_CHATS })],
    ['GET', /^\/api\/whatsapp\/chats\/(.+)\/messages$/, ({ params }) => ({ json: WA_MESSAGES[decodeURIComponent(params[0])] || [] })],
    ['POST', '/api/whatsapp/send', () => ({ json: { success: true, messageId: 'out-1' } })],
    ['POST', '/api/whatsapp/bridge/logout', () => ({ json: { success: true } })],
    ['POST', '/api/whatsapp/bridge/reset', () => ({ json: { success: true } })],
  ];
}

const matches = (pattern, pathname) => {
  if (typeof pattern === 'string') return pattern === pathname ? [] : null;
  const m = pathname.match(pattern);
  return m ? m.slice(1) : null;
};

class ApiMock {
  constructor(page) {
    this.page = page;
    this.routes = defaultRoutes();
    /** Every /api request the page made: { method, path, url, body, headers }. */
    this.calls = [];
    /** /api requests nobody answered (they get a 404, and usually point at a missing mock). */
    this.unhandled = [];
  }

  /**
   * Overrides one endpoint. `response` is either a response object ({ status, json, body, contentType,
   * headers, delay }) or a function receiving ({ url, body, method, params, request, count }).
   */
  on(method, path, response) {
    this.routes.push([method, path, typeof response === 'function' ? response : () => response]);
    return this;
  }

  /** Shortcut: make an endpoint fail with the given status. */
  fail(method, path, status = 500, json = { error: 'Internal Server Error', message: 'boom' }) {
    return this.on(method, path, { status, json });
  }

  callsTo(method, path) {
    return this.calls.filter((c) => c.method === method && matches(path, c.path) !== null);
  }

  /** Waits for the page to send a matching request and returns its recorded call. */
  async waitForCall(method, path, { timeout = 10_000 } = {}) {
    const req = await this.page.waitForRequest(
      (r) => r.method() === method && matches(path, new URL(r.url()).pathname) !== null,
      { timeout },
    );
    return { method, path: new URL(req.url()).pathname, url: new URL(req.url()), body: parseBody(req), headers: req.headers() };
  }

  async install() {
    const hits = new Map();
    await this.page.route(
      (url) => url.origin === FRONTEND_ORIGIN && url.pathname.startsWith('/api/'),
      async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        const body = parseBody(request);
        this.calls.push({ method, path: url.pathname, url, body, headers: request.headers() });

        for (let i = this.routes.length - 1; i >= 0; i--) {
          const [m, pattern, handler] = this.routes[i];
          if (m !== method) continue;
          const params = matches(pattern, url.pathname);
          if (params === null) continue;
          const key = `${m} ${pattern}`;
          const count = (hits.get(key) || 0) + 1;
          hits.set(key, count);
          const res = (await handler({ url, body, method, params, request, count })) || {};
          if (res.abort) return route.abort(res.abort);
          if (res.delay) await new Promise((r) => setTimeout(r, res.delay));
          return route.fulfill({
            status: res.status ?? 200,
            headers: res.headers,
            contentType: res.contentType,
            json: res.json === undefined ? undefined : clone(res.json),
            body: res.json === undefined ? (res.body ?? '') : undefined,
          });
        }
        this.unhandled.push(`${method} ${url.pathname}`);
        return route.fulfill({ status: 404, json: { error: 'no mock for this endpoint' } });
      },
    );
  }
}

function parseBody(request) {
  const raw = request.postData();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// ─── Fake WhatsApp bridge (Socket.IO v4 over a mocked WebSocket) ───────────────────────────

/**
 * Speaks just enough Engine.IO/Socket.IO to make socket.io-client emit "connect" and receive events.
 * mode: 'online' (accepts the connection) or 'offline' (refuses it: the page gets "connect_error").
 */
class BridgeSocket {
  constructor() {
    this.mode = 'online';
    this.sockets = [];
    this.connects = 0;
  }

  async install(page) {
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
      this.sockets.push(ws);
      ws.onMessage((message) => {
        const msg = String(message);
        if (msg === '2') ws.send('3'); // ping from client (not used by v4, harmless)
        else if (msg.startsWith('40')) {
          // Offline: refuse the namespace connection, which socket.io-client reports as "connect_error".
          if (this.mode === 'offline') return ws.send(`44${JSON.stringify({ message: 'bridge offline' })}`);
          this.connects += 1;
          ws.send(`40${JSON.stringify({ sid: `sid-${this.connects}` })}`);
        }
      });
      // Engine.IO "open" packet. Long ping interval: no heartbeat during a test.
      ws.send(`0${JSON.stringify({ sid: `eio-${Date.now()}`, upgrades: [], pingInterval: 120000, pingTimeout: 60000, maxPayload: 1000000 })}`);
    });
  }

  /** Emits a Socket.IO event to every connected page. */
  emit(event, payload) {
    for (const ws of this.sockets) ws.send(`42${JSON.stringify(payload === undefined ? [event] : [event, payload])}`);
  }
}

// ─── Fixtures ───────────────────────────────────────────────────────────────────────────────

const test = base.extend({
  /** Recorded window.alert/confirm/prompt dialogs; accepted by default (prompt gets its default value). */
  dialogs: async ({ page }, use) => {
    const dialogs = [];
    page.on('dialog', async (d) => {
      dialogs.push({ type: d.type(), message: d.message(), defaultValue: d.defaultValue() });
      if (dialogs.answer !== undefined) {
        const answer = typeof dialogs.answer === 'function' ? dialogs.answer(d) : dialogs.answer;
        if (answer === false) return d.dismiss();
        return d.accept(typeof answer === 'string' ? answer : undefined);
      }
      return d.accept();
    });
    await use(dialogs);
  },

  /** Uncaught page errors; asserted empty after every test so a crash never goes unnoticed. */
  pageErrors: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(errors);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  },

  bridge: async ({ page }, use) => {
    const bridge = new BridgeSocket();
    await bridge.install(page);
    await use(bridge);
  },

  // Auto: every test in the project is signed in and sandboxed, even if it never touches `api`.
  api: [async ({ page, bridge, pageErrors, dialogs }, use) => {
    // Nothing leaves the machine: Google Maps, avatars, fonts, the real bridge on :3001...
    const external = [];
    await page.context().route(
      (url) => url.origin !== FRONTEND_ORIGIN,
      (route) => {
        external.push(route.request().url());
        return route.abort('blockedbyclient');
      },
    );
    // window.open would spawn real popups (Google Photos picker); record the calls instead.
    await page.addInitScript(() => {
      window.__opened = [];
      window.open = (...args) => {
        window.__opened.push(args);
        return null;
      };
    });
    const api = new ApiMock(page);
    api.external = external;
    await api.install();
    await use(api);
  }, { auto: true }],
});

module.exports = { test, expect, DATA, ApiMock, BridgeSocket, FRONTEND_ORIGIN };
