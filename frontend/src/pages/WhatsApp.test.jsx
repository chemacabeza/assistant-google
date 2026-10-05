import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route } from 'react-router-dom';
import { server } from '../test/server';
import { mockLocation, readJson, renderWithProviders } from '../test/utils';
import WhatsApp from './WhatsApp';

// socket.io-client is mocked: tests drive the bridge events by hand.
const sockets = vi.hoisted(() => ({ instances: [], io: null }));
vi.mock('socket.io-client', () => {
  sockets.io = vi.fn((url, options) => {
    const handlers = {};
    const socket = {
      url,
      options,
      handlers,
      on: vi.fn((event, cb) => { (handlers[event] ||= []).push(cb); return socket; }),
      disconnect: vi.fn(),
      fire: (event, payload) => (handlers[event] || []).forEach((cb) => cb(payload)),
    };
    sockets.instances.push(socket);
    return socket;
  });
  return { io: (...args) => sockets.io(...args) };
});

const lastSocket = () => sockets.instances.at(-1);
const fire = (event, payload) => act(() => lastSocket().fire(event, payload));

const now = new Date();
const chats = [
  {
    chatId: '33611111111@s.whatsapp.net', name: 'Alice', group: false, unreadCount: 2,
    lastMessage: 'See you soon', lastMessageTimestamp: now.toISOString(), lastMessageDirection: 'INCOMING',
  },
  {
    chatId: '1203630@g.us', name: 'Family', group: true, unreadCount: 0,
    lastMessage: null, lastMediaType: 'IMAGE', lastMessageTimestamp: now.toISOString(), lastMessageDirection: 'OUTGOING',
  },
];
const messagesByChat = {
  [chats[0].chatId]: [
    { id: 1, chatId: chats[0].chatId, direction: 'INCOMING', content: 'Hi there!', timestamp: now.toISOString() },
    { id: 2, chatId: chats[0].chatId, direction: 'OUTGOING', content: 'Hello Alice', timestamp: now.toISOString(), repliedToContent: 'Hi there!' },
  ],
  [chats[1].chatId]: [
    { id: 3, chatId: chats[1].chatId, direction: 'INCOMING', content: 'Dinner at 8', authorName: 'Mum', timestamp: now.toISOString() },
    { id: 4, chatId: chats[1].chatId, direction: 'INCOMING', mediaType: 'DOCUMENT', timestamp: now.toISOString() },
  ],
};

function mockBridge({ status = { authenticated: true, ready: true, hasQr: false }, chatList = chats, messages = messagesByChat } = {}) {
  const calls = { status: 0, sent: [], messageRequests: [], logout: 0, reset: 0 };
  server.use(
    http.get('/api/whatsapp/bridge/status', () => {
      calls.status += 1;
      return typeof status === 'function' ? status(calls.status) : HttpResponse.json(status);
    }),
    http.get('/api/whatsapp/bridge/qr', () => new HttpResponse(new Blob(['png']), { headers: { 'Content-Type': 'image/png' } })),
    http.get('/api/whatsapp/chats', () => HttpResponse.json(chatList)),
    http.get('/api/whatsapp/chats/:chatId/messages', ({ params }) => {
      calls.messageRequests.push(params.chatId);
      return HttpResponse.json(messages[params.chatId] || []);
    }),
    http.post('/api/whatsapp/send', async ({ request }) => {
      calls.sent.push(await readJson(request));
      return HttpResponse.json({ success: true });
    }),
    http.post('/api/whatsapp/bridge/logout', () => { calls.logout += 1; return HttpResponse.json({ success: true }); }),
    http.post('/api/whatsapp/bridge/reset', () => { calls.reset += 1; return HttpResponse.json({ success: true }); }),
  );
  return calls;
}

function renderWhatsApp() {
  return renderWithProviders(<WhatsApp />, {
    route: '/whatsapp',
    path: '/whatsapp',
    extraRoutes: <Route path="/dashboard" element={<div>Dashboard page</div>} />,
  });
}

async function renderConnected(options) {
  const calls = mockBridge(options);
  const utils = renderWhatsApp();
  fire('connect');
  await screen.findByText('Hello Alice');
  return { ...utils, calls };
}

beforeEach(() => {
  sockets.instances.length = 0;
});

describe('WhatsApp page', () => {
  it('connects to the bridge socket on port 3001 and disconnects on unmount', () => {
    mockBridge();
    const { unmount } = renderWhatsApp();
    expect(sockets.io).toHaveBeenCalledWith(
      `http://${window.location.hostname}:3001`,
      expect.objectContaining({ transports: ['websocket', 'polling'] }),
    );
    unmount();
    expect(lastSocket().disconnect).toHaveBeenCalled();
  });

  it('loads the chat list once the bridge reports ready and auto-opens the latest chat', async () => {
    const { calls } = await renderConnected();

    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(2); // list + header
    expect(screen.getByText('See you soon')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // unread badge
    expect(screen.getByText('Family')).toBeInTheDocument();
    expect(screen.getByText('Photo')).toBeInTheDocument(); // media-only last message
    expect(screen.getByText('click here for contact info')).toBeInTheDocument();
    expect(screen.getByText('Hello Alice')).toBeInTheDocument();
    expect(screen.getAllByText('Hi there!')).toHaveLength(2); // message + quoted reply
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(calls.messageRequests).toContain(chats[0].chatId);
  });

  it('opens another chat and shows its messages', async () => {
    const { user } = await renderConnected();
    await user.click(screen.getByText('Family'));
    expect(await screen.findByText('Dinner at 8')).toBeInTheDocument();
    expect(screen.getByText('Mum')).toBeInTheDocument();
    expect(screen.getByText('Document')).toBeInTheDocument();
    expect(screen.getByText('click here for group info')).toBeInTheDocument();
    expect(screen.queryByText('Hello Alice')).not.toBeInTheDocument();
  });

  it('filters chats by search text and by tab', async () => {
    const { user } = await renderConnected();
    const search = screen.getByPlaceholderText('Search or start new chat');

    await user.type(search, 'fam');
    expect(screen.queryByText('See you soon')).not.toBeInTheDocument();
    expect(screen.getByText('Family')).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.getByText('No chats match your search')).toBeInTheDocument();
    await user.clear(search);

    await user.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.getByText('See you soon')).toBeInTheDocument();
    expect(screen.queryByText('Family')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByText('Family')).toBeInTheDocument();
    expect(screen.queryByText('See you soon')).not.toBeInTheDocument();
  });

  it('sends a message to the selected chat with Enter and clears the input', async () => {
    const { user, calls } = await renderConnected();
    const input = screen.getByPlaceholderText('Type a message');
    await user.type(input, 'On my way{Enter}');

    await waitFor(() => expect(calls.sent).toEqual([{ to: chats[0].chatId, content: 'On my way' }]));
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('does not send blank messages', async () => {
    const { user, calls } = await renderConnected();
    await user.type(screen.getByPlaceholderText('Type a message'), '   {Enter}');
    expect(calls.sent).toEqual([]);
  });

  it('keeps the draft when sending fails', async () => {
    const { user } = await renderConnected();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    server.use(http.post('/api/whatsapp/send', () => HttpResponse.json({ success: false }, { status: 503 })));
    const input = screen.getByPlaceholderText('Type a message');
    await user.type(input, 'lost?{Enter}');
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue('lost?');
  });

  it('refreshes chats and the open conversation on new_message', async () => {
    const live = { ...messagesByChat, [chats[0].chatId]: [...messagesByChat[chats[0].chatId]] };
    await renderConnected({ messages: live });
    live[chats[0].chatId].push({ id: 9, chatId: chats[0].chatId, direction: 'INCOMING', content: 'Fresh news', timestamp: now.toISOString() });

    fire('new_message', { chatId: chats[0].chatId });
    expect(await screen.findByText('Fresh news')).toBeInTheDocument();
  });

  it('shows the history sync banner', async () => {
    await renderConnected();
    fire('history_synced', { chats: 12, messages: 340 });
    expect(await screen.findByText('Synced 12 chats · 340 messages')).toBeInTheDocument();
  });

  it('shows the QR code when the bridge needs linking', async () => {
    const createObjectURL = vi.fn(() => 'blob:qr-image');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL }));
    mockBridge({ status: { authenticated: false, ready: false, hasQr: true } });
    renderWhatsApp();
    fire('connect');

    expect(await screen.findByRole('img', { name: 'WhatsApp QR' })).toHaveAttribute('src', 'blob:qr-image');
    expect(screen.getByRole('heading', { name: 'Link a device to use WhatsApp' })).toBeInTheDocument();
    expect(screen.getByText(/To use WhatsApp on your computer/)).toBeInTheDocument();
  });

  it('updates the QR from socket events and switches to the chat UI on ready', async () => {
    mockBridge();
    renderWhatsApp();
    fire('qr', { qr: 'data:image/png;base64,QR1' });
    expect(screen.getByRole('img', { name: 'WhatsApp QR' })).toHaveAttribute('src', 'data:image/png;base64,QR1');

    fire('ready');
    expect(await screen.findByText('Hello Alice')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'WhatsApp QR' })).not.toBeInTheDocument();
  });

  it('shows the offline overlay and recovers with Retry', async () => {
    mockBridge();
    const { user } = renderWhatsApp();
    fire('connect_error', new Error('ECONNREFUSED'));

    expect(screen.getByText(/Bridge is offline/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Hello Alice')).toBeInTheDocument();
  });

  it('stays offline when Retry fails', async () => {
    mockBridge({ status: () => new HttpResponse(null, { status: 502 }) });
    const { user } = renderWhatsApp();
    fire('connect_error', new Error('down'));
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText(/Bridge is offline/)).toBeInTheDocument();
  });

  it('goes offline when the status endpoint is unreachable after connecting', async () => {
    mockBridge({ status: () => HttpResponse.error() });
    renderWhatsApp();
    fire('connect');
    expect(await screen.findByText(/Bridge is offline/)).toBeInTheDocument();
  });

  it('logs out of WhatsApp from the menu after confirmation', async () => {
    const { reload } = mockLocation();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, calls, container } = await renderConnected();

    const menuButton = container.querySelector('button:has(.lucide-ellipsis-vertical), button:has(.lucide-more-vertical)');
    await user.click(menuButton);
    await user.click(screen.getByText('Log out'));

    await waitFor(() => expect(calls.logout).toBe(1));
    expect(reload).toHaveBeenCalled();
  });

  it('does not reset the session when the confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user, calls } = await renderConnected();
    await user.click(screen.getByRole('button', { name: 'RESET SESSION' }));
    expect(calls.reset).toBe(0);
    expect(screen.getByText('Hello Alice')).toBeInTheDocument();
  });

  it('nuclear reset wipes local storage, calls the bridge and reloads /whatsapp', async () => {
    const { hrefSet } = mockLocation();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { user, calls } = await renderConnected();
    localStorage.setItem('k', 'v');

    vi.useFakeTimers({ shouldAdvanceTime: true });
    await user.click(screen.getByRole('button', { name: 'RESET SESSION' }));

    await waitFor(() => expect(calls.reset).toBe(1));
    expect(localStorage.getItem('k')).toBeNull();
    expect(screen.getByText('Generating QR code…')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(hrefSet).toHaveBeenCalledWith('/whatsapp');
  });

  it('navigates back to the dashboard', async () => {
    const { user } = await renderConnected();
    await user.click(screen.getByTitle('Back to Dashboard'));
    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
  });

  // BUG: the search only looks at chat.name, but unnamed chats are displayed by their phone
  // number (chatId prefix). Typing the number you can see in the list hides that chat.
  it.skip('BUG: finds unnamed chats by the phone number shown in the list', async () => {
    const unnamed = { chatId: '34600000000@s.whatsapp.net', name: null, unreadCount: 0, lastMessage: 'yo' };
    const { user } = await renderConnected({ chatList: [...chats, unnamed] });
    expect(screen.getByText('34600000000')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Search or start new chat'), '34600');
    expect(screen.getByText('34600000000')).toBeInTheDocument();
  });
});
