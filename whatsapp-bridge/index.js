'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode  = require('qrcode');
const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');

const app = express();
app.use(express.json());

const PORT        = process.env.PORT        || 3001;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const SESSION_DIR = process.env.SESSION_DIR || './sessions';

// ─── Stale Lock Cleanup ──────────────────────────────────────────────────────
function cleanStaleLocks(dir) {
  try {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) cleanStaleLocks(full);
      else if (['SingletonLock','SingletonSocket','SingletonCookie'].includes(entry.name)) {
        fs.unlinkSync(full);
        console.log(`[Bridge] Removed stale lock: ${full}`);
      }
    }
  } catch (e) { console.warn('[Bridge] Lock cleanup warning:', e.message); }
}
cleanStaleLocks(SESSION_DIR);

// ─── State ───────────────────────────────────────────────────────────────────
let currentQrDataUrl = null;
let isAuthenticated  = false;
let isReady          = false;

// ─── WhatsApp Client ──────────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  webVersion: '2.3000.1014111620',
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014111620.html',
  },
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: [
      '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas','--no-first-run','--no-zygote',
      '--disable-gpu','--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding',
      '--disable-features=TranslateUI','--disable-ipc-flooding-protection',
      '--window-size=1920,1080',
    ],
  },
});

// ─── Events ──────────────────────────────────────────────────────────────────
client.on('qr', async (qr) => {
  console.log('[Bridge] QR code received — scan with WhatsApp');
  isAuthenticated  = false;
  currentQrDataUrl = await qrcode.toDataURL(qr);
});

client.on('authenticated', () => {
  console.log('[Bridge] Authenticated successfully');
  isAuthenticated  = true;
  currentQrDataUrl = null;
});

client.on('ready', async () => {
  console.log('[Bridge] Client is ready — starting full sync');
  isReady = true;

  // Small delay so WhatsApp Web finishes loading all chats
  await new Promise(r => setTimeout(r, 5000));

  try {
    const chats = await client.getChats();
    console.log(`[Bridge] Found ${chats.length} chats — syncing metadata...`);

    for (const chat of chats) {
      try {
        const chatId = chat.id?._serialized;
        if (!chatId) { console.warn('[Bridge] Skipping chat with no id'); continue; }

        // Build chat payload
        const chatPayload = {
          chatId,
          name:        chat.name || chat.id?.user || chatId,
          isGroup:     chat.isGroup || false,
          unreadCount: chat.unreadCount || 0,
          lastMessage: chat.lastMessage?.body || '',
          lastMessageTimestamp: chat.lastMessage?.timestamp
            ? new Date(chat.lastMessage.timestamp * 1000).toISOString()
            : new Date().toISOString(),
          avatarUrl: null,
        };

        // Fetch avatar (best-effort)
        try { chatPayload.avatarUrl = await chat.getProfilePicUrl() || null; } catch {}

        await axios.post(`${BACKEND_URL}/api/whatsapp/bridge/chat`, chatPayload, { timeout: 5000 })
          .catch(e => console.warn(`[Bridge] Failed to post chat ${chatId}:`, e.message));

      } catch (err) {
        console.error(`[Bridge] Error syncing chat metadata:`, err.message);
      }
    }

    console.log('[Bridge] Chat metadata sync complete — now fetching messages...');

    // Fetch recent messages using the WA Web store directly
    for (const chat of chats) {
      try {
        const chatId = chat.id?._serialized;
        if (!chatId) continue;
        // Skip broadcast/status chats — they never have fetchable history
        if (chatId.includes('broadcast') || chatId === 'status@broadcast') continue;

        let messages = [];
        try {
          // Primary: use the puppeteer page to call WA internals directly
          messages = await client.pupPage.evaluate(async (wid) => {
            try {
              const store = window.Store;
              if (!store || !store.Chat) return [];
              const chatModel = store.Chat.get(wid);
              if (!chatModel) return [];
              await chatModel.loadEarlierMessages();
              const msgModels = chatModel.msgs?.models || [];
              return msgModels.slice(-50).map(m => ({
                id:        m.id?._serialized || '',
                body:      m.body || '',
                type:      m.type || 'chat',
                from:      m.from?._serialized || '',
                to:        m.to?._serialized || '',
                fromMe:    !!m.id?.fromMe,
                timestamp: m.t || 0,
                hasMedia:  !!m.mediaData?.mediaStage,
                isForwarded: !!m.isForwarded,
                quotedBody: m.quotedMsg?.body || null,
                author:    m.author?._serialized || null,
              }));
            } catch (e) {
              return [];
            }
          }, chatId);
        } catch (pageErr) {
          console.warn(`[Bridge] puppeteer eval failed for ${chatId}:`, pageErr.message);
        }

        // Secondary fallback: try chat.fetchMessages
        if (!messages || messages.length === 0) {
          try {
            const fetched = await chat.fetchMessages({ limit: 50 });
            messages = fetched.map(m => ({
              id:        m.id?._serialized || '',
              body:      m.body || '',
              type:      m.type || 'chat',
              from:      m.from || '',
              to:        m.to || '',
              fromMe:    !!m.fromMe,
              timestamp: m.timestamp || 0,
              hasMedia:  !!m.hasMedia,
              isForwarded: !!m.isForwarded,
              quotedBody: m.hasQuotedMsg ? (m._data?.quotedMsg?.body || null) : null,
              author:    null,
            }));
          } catch { /* ignore */ }
        }

        for (const rawMsg of messages) {
          if (!rawMsg.id) continue;
          const payload = {
            messageId:   rawMsg.id,
            chatId,
            chatName:    chat.name || chat.id?.user || chatId,
            isGroup:     chat.isGroup || false,
            fromMe:      rawMsg.fromMe,
            senderId:    rawMsg.from,
            body:        rawMsg.body,
            timestamp:   rawMsg.timestamp ? new Date(rawMsg.timestamp * 1000).toISOString() : new Date().toISOString(),
            hasMedia:    rawMsg.hasMedia,
            mediaType:   rawMsg.type && rawMsg.type !== 'chat' ? rawMsg.type.toUpperCase() : null,
            quotedMsg:   rawMsg.quotedBody || null,
            isForwarded: rawMsg.isForwarded || false,
          };
          await axios.post(`${BACKEND_URL}/api/whatsapp/bridge/message`, payload, { timeout: 10000 })
            .catch(e => console.warn(`[Bridge] Failed to post message ${payload.messageId}:`, e.message));
        }

        await new Promise(r => setTimeout(r, 30));
      } catch (err) {
        console.error(`[Bridge] Error fetching messages for chat:`, err.message);
      }
    }

    console.log('[Bridge] Full sync complete');
  } catch (err) {
    console.error('[Bridge] Sync error:', err.message);
  }
});

// ─── Real-time Messages ───────────────────────────────────────────────────────
client.on('message', async (msg) => {
  try {
    const chat   = await msg.getChat();
    const chatId = chat?.id?._serialized || msg.from;
    console.log(`[Bridge] New message in ${chatId}`);
    await syncMessage(msg, chat, chatId);
  } catch (e) { console.error('[Bridge] message event error:', e.message); }
});

client.on('message_create', async (msg) => {
  if (!msg.fromMe) return;
  try {
    const chat   = await msg.getChat();
    const chatId = chat?.id?._serialized || msg.to;
    await syncMessage(msg, chat, chatId);
  } catch (e) { console.error('[Bridge] message_create event error:', e.message); }
});

// ─── Message Sync Helper ──────────────────────────────────────────────────────
async function syncMessage(msg, chat, chatId) {
  try {
    // Resolve chatId robustly
    const resolvedChatId = chatId
      || chat?.id?._serialized
      || msg.from
      || msg.to;

    if (!resolvedChatId) {
      console.warn('[Bridge] syncMessage: cannot determine chatId, skipping');
      return;
    }

    // Media (best-effort, skip if fails)
    let mediaData = null;
    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media) mediaData = { mimetype: media.mimetype, data: media.data, filename: media.filename || null };
      } catch (mediaErr) {
        console.warn(`[Bridge] Media download failed for ${msg.id._serialized}:`, mediaErr.message);
      }
    }

    // Group author
    let authorName = null, authorPhone = null;
    if ((chat?.isGroup || false) && !msg.fromMe) {
      try {
        const contact = await msg.getContact();
        authorName  = contact.pushname || contact.name || contact.number;
        authorPhone = contact.number;
      } catch {}
    }

    const payload = {
      messageId:   msg.id._serialized,
      chatId:      resolvedChatId,
      chatName:    chat?.name || chat?.id?.user || resolvedChatId,
      isGroup:     chat?.isGroup || false,
      fromMe:      msg.fromMe,
      senderId:    msg.from,
      authorName,
      authorPhone,
      body:        msg.body || '',
      timestamp:   new Date(msg.timestamp * 1000).toISOString(),
      hasMedia:    msg.hasMedia,
      mediaType:   msg.type && msg.type !== 'chat' ? msg.type.toUpperCase() : null,
      mediaData,
      quotedMsg:   msg.hasQuotedMsg ? (msg._data?.quotedMsg?.body || null) : null,
      isForwarded: msg.isForwarded || false,
    };

    await axios.post(`${BACKEND_URL}/api/whatsapp/bridge/message`, payload, { timeout: 10000 })
      .catch(e => console.warn(`[Bridge] Failed to post message ${payload.messageId}:`, e.message));

  } catch (err) {
    console.error(`[Bridge] syncMessage error:`, err.message);
  }
}

// ─── HTTP API ─────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status:'ok', authenticated:isAuthenticated, ready:isReady }));

app.get('/qr', async (_, res) => {
  if (isAuthenticated) return res.status(204).send();
  if (!currentQrDataUrl) return res.status(202).json({ message:'QR not yet generated, please wait...' });
  const base64 = currentQrDataUrl.replace(/^data:image\/png;base64,/, '');
  res.set('Content-Type','image/png').send(Buffer.from(base64,'base64'));
});

app.get('/status', (_, res) => res.json({
  authenticated: isAuthenticated, ready: isReady, hasQr: !!currentQrDataUrl,
}));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Bridge] HTTP server listening on port ${PORT}`);
  console.log(`[Bridge] Backend URL: ${BACKEND_URL}`);
});

console.log('[Bridge] Initializing WhatsApp client...');
client.initialize();
