const { test, expect } = require('@playwright/test');
const { io } = require('socket.io-client');
const { urls } = require('../../helpers/env');

function connect() {
  return io(urls.bridge, { transports: ['websocket'], reconnection: false, timeout: 8000 });
}

function once(socket, event, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

test.describe('whatsapp-bridge: Socket.IO', () => {
  test('a new client immediately receives the current state', async () => {
    const socket = connect();
    try {
      const state = await once(socket, 'state');
      expect(typeof state.connected).toBe('boolean');
      expect(typeof state.hasQr).toBe('boolean');
      // The QR payload is a data URL when one exists and null otherwise.
      if (state.hasQr) expect(state.qr).toMatch(/^data:image\/png;base64,/);
      else expect(state.qr).toBeNull();
    } finally {
      socket.close();
    }
  });

  test('a client sees a disconnected bridge as not connected', async ({ request }) => {
    const status = await (await request.get('/status')).json();
    test.skip(status.ready, 'phone is linked - this check only applies while disconnected');

    const socket = connect();
    try {
      const state = await once(socket, 'state');
      expect(state.connected).toBe(false);
    } finally {
      socket.close();
    }
  });

  test('several clients can connect at the same time', async () => {
    const sockets = Array.from({ length: 5 }, connect);
    try {
      const states = await Promise.all(sockets.map((s) => once(s, 'state')));
      expect(states).toHaveLength(5);
    } finally {
      sockets.forEach((s) => s.close());
    }
  });
});
