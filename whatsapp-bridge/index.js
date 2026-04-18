'use strict';

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const SESSION_DIR = process.env.SESSION_DIR || './sessions';

// ─── Stale Lock Cleanup ──────────────────────────────────────────────────────
// Chromium leaves a SingletonLock file when the container is killed. Remove it.
function cleanStaleLocks(dir) {
  try {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        cleanStaleLocks(full);
      } else if (entry.name === 'SingletonLock' || entry.name === 'SingletonSocket' || entry.name === 'SingletonCookie') {
        fs.unlinkSync(full);
        console.log(`[Bridge] Removed stale lock: ${full}`);
      }
    }
  } catch (e) {
    console.warn('[Bridge] Lock cleanup warning:', e.message);
  }
}
cleanStaleLocks(SESSION_DIR);

// ─── State ──────────────────────────────────────────────────────────────────
let currentQrDataUrl = null;
let isAuthenticated = false;
let isReady = false;

// ─── WhatsApp Client ─────────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  // Pin a known-stable WhatsApp Web version to avoid "Couldn't link device"
  // errors caused by breaking changes in the live WhatsApp Web releases.
  webVersion: '2.3000.1014111620',
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014111620.html',
  },
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--window-size=1920,1080',
    ],
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium'
  }
});


// ─── QR Code Event ───────────────────────────────────────────────────────────
client.on('qr', async (qr) => {
  console.log('[Bridge] QR code received — scan with WhatsApp');
  isAuthenticated = false;
  currentQrDataUrl = await qrcode.toDataURL(qr);
});

// ─── Authenticated ────────────────────────────────────────────────────────────
client.on('authenticated', () => {
  console.log('[Bridge] Authenticated successfully');
  isAuthenticated = true;
  currentQrDataUrl = null;
});

// ─── Ready: Sync all chats ───────────────────────────────────────────────────
client.on('ready', async () => {
  console.log('[Bridge] Client is ready — starting full sync');
  isReady = true;

  try {
    const chats = await client.getChats();
    console.log(`[Bridge] Found ${chats.length} chats — syncing...`);

    for (const chat of chats) {
      try {
        // Build chat metadata
        const chatPayload = {
          chatId: chat.id._serialized,
          name: chat.name || chat.id.user,
          isGroup: chat.isGroup,
          unreadCount: chat.unreadCount,
          lastMessage: chat.lastMessage?.body || '',
          lastMessageTimestamp: chat.lastMessage?.timestamp
            ? new Date(chat.lastMessage.timestamp * 1000).toISOString()
            : new Date().toISOString()
        };

        // Fetch avatar
        try {
          const avatarUrl = await chat.getProfilePicUrl();
          chatPayload.avatarUrl = avatarUrl || null;
        } catch {
          chatPayload.avatarUrl = null;
        }

        // Sync chat metadata to backend
        await axios.post(`${BACKEND_URL}/api/whatsapp/bridge/chat`, chatPayload, { timeout: 5000 });

        // Fetch messages (last 50 per chat to avoid overload)
        const messages = await chat.fetchMessages({ limit: 50 });

        for (const msg of messages) {
          await syncMessage(msg, chat);
        }
      } catch (chatErr) {
        console.error(`[Bridge] Error syncing chat ${chat.id._serialized}:`, chatErr.message);
      }
    }

    console.log('[Bridge] Full sync complete');
  } catch (err) {
    console.error('[Bridge] Sync error:', err.message);
  }
});

// ─── Real-time New Messages ───────────────────────────────────────────────────
client.on('message', async (msg) => {
  console.log(`[Bridge] New message from ${msg.from}`);
  const chat = await msg.getChat();
  await syncMessage(msg, chat);
});

client.on('message_create', async (msg) => {
  if (msg.fromMe) {
    const chat = await msg.getChat();
    await syncMessage(msg, chat);
  }
});

// ─── Message Sync Helper ─────────────────────────────────────────────────────
async function syncMessage(msg, chat) {
  try {
    let mediaData = null;

    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media) {
          mediaData = {
            mimetype: media.mimetype,
            data: media.data,      // base64
            filename: media.filename || null
          };
        }
      } catch (mediaErr) {
        console.warn(`[Bridge] Failed to download media for msg ${msg.id._serialized}:`, mediaErr.message);
      }
    }

    // Determine author for group messages
    let authorName = null;
    let authorPhone = null;
    if (chat.isGroup && !msg.fromMe) {
      try {
        const contact = await msg.getContact();
        authorName = contact.pushname || contact.name || contact.number;
        authorPhone = contact.number;
      } catch { /* ignore */ }
    }

    const payload = {
      messageId:   msg.id._serialized,
      chatId:      chat.id._serialized,
      chatName:    chat.name || chat.id.user,
      isGroup:     chat.isGroup,
      fromMe:      msg.fromMe,
      senderId:    msg.from,
      authorName:  authorName,
      authorPhone: authorPhone,
      body:        msg.body || '',
      timestamp:   new Date(msg.timestamp * 1000).toISOString(),
      hasMedia:    msg.hasMedia,
      mediaType:   msg.type !== 'chat' ? msg.type.toUpperCase() : null,
      mediaData:   mediaData,
      quotedMsg:   msg.hasQuotedMsg ? msg._data?.quotedMsg?.body || null : null,
      isForwarded: msg.isForwarded || false
    };

    await axios.post(`${BACKEND_URL}/api/whatsapp/bridge/message`, payload, { timeout: 10000 });
  } catch (err) {
    console.error(`[Bridge] Failed to sync message ${msg.id._serialized}:`, err.message);
  }
}

// ─── Express API ─────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', authenticated: isAuthenticated, ready: isReady });
});

// QR code image
app.get('/qr', async (req, res) => {
  if (isAuthenticated) {
    return res.status(204).send();
  }
  if (!currentQrDataUrl) {
    return res.status(202).json({ message: 'QR not yet generated, please wait...' });
  }

  // Return as PNG image
  const base64Data = currentQrDataUrl.replace(/^data:image\/png;base64,/, '');
  const imgBuffer = Buffer.from(base64Data, 'base64');
  res.set('Content-Type', 'image/png');
  res.send(imgBuffer);
});

// Status
app.get('/status', (req, res) => {
  res.json({
    authenticated: isAuthenticated,
    ready: isReady,
    hasQr: !!currentQrDataUrl
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Bridge] HTTP server listening on port ${PORT}`);
  console.log(`[Bridge] Backend URL: ${BACKEND_URL}`);
});

console.log('[Bridge] Initializing WhatsApp client...');
client.initialize();
