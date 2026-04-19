/**
 * WhatsApp Bridge — Baileys Edition
 *
 * Production-quality bridge using @whiskeysockets/baileys (direct WA protocol).
 * No Puppeteer, no Chromium — lightweight and stable.
 *
 * Architecture:
 *   • Express HTTP server  → for QR/status/send REST endpoints
 *   • Socket.io server     → real-time push to frontend (QR, ready, new messages)
 *   • Baileys WA client    → direct WhatsApp protocol connection
 *   • useMultiFileAuthState → session persisted to Docker volume
 */

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  makeInMemoryStore,
  isJidBroadcast,
  isJidGroup,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';


import { Boom } from '@hapi/boom';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import qrcode from 'qrcode';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import cors from 'cors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const PORT        = Number(process.env.PORT)        || 3001;
const BACKEND_URL = process.env.BACKEND_URL         || 'http://localhost:8080';
const SESSION_DIR = process.env.SESSION_DIR         || './sessions';
const AUTH_DIR    = path.join(SESSION_DIR, 'auth_info');

// ── Server setup ──────────────────────────────────────────────────────────────
const app    = express();
app.use(cors());
app.use(express.json());
const server = createServer(app);
const io     = new SocketIO(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Silent pino — suppress Baileys' verbose output (set to 'info' for debugging)
const logger = pino({ level: 'silent' });

// In-memory store for getMessage callbacks (needed for message retry/decryption)
const store = makeInMemoryStore({ logger });
const STORE_FILE = path.join(SESSION_DIR, "baileys_store.json");
if (fs.existsSync(STORE_FILE)) store.readFromFile(STORE_FILE);
setInterval(() => store.writeToFile(STORE_FILE), 10000);

// ── Bridge state ──────────────────────────────────────────────────────────────
let currentQr    = null;   // base64 data URL for current QR code
let isConnected  = false;  // true when WA session is open
let sock         = null;   // Baileys socket instance
let reconnecting = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract plain text from any message type */
function getText(msg) {
  if (!msg) return '';
  return (
    msg.conversation                        ??
    msg.extendedTextMessage?.text           ??
    msg.imageMessage?.caption               ??
    msg.videoMessage?.caption               ??
    msg.documentMessage?.title              ??
    msg.buttonsResponseMessage?.selectedDisplayText ??
    msg.listResponseMessage?.title          ??
    ''
  );
}

/** Determine media type string for storage */
function getMediaType(msg) {
  if (!msg) return null;
  if (msg.imageMessage)   return 'IMAGE';
  if (msg.videoMessage)   return 'VIDEO';
  if (msg.audioMessage)   return 'AUDIO';
  if (msg.pttMessage)     return 'AUDIO';   // Push-to-talk voice note
  if (msg.documentMessage) return 'DOCUMENT';
  if (msg.stickerMessage) return 'STICKER';
  return null;
}

/** POST to the Spring Boot backend, silently ignore errors */
async function safePost(endpoint, body) {
  try {
    await axios.post(`${BACKEND_URL}${endpoint}`, body, { timeout: 8000 });
  } catch { /* silently discard — bridge must never crash on backend errors */ }
}

/** Sync a Baileys chat object to the backend DB, with an optional name override */
async function syncChat(chat, nameOverride) {
  const chatId = chat.id;
  if (!chatId || isJidBroadcast(chatId)) return;

  let tsInt = chat.conversationTimestamp;
  if (tsInt && typeof tsInt === 'object' && tsInt.low) tsInt = tsInt.low;
  else if (tsInt && typeof tsInt === 'object' && tsInt.toNumber) tsInt = tsInt.toNumber();
  else tsInt = Number(tsInt);
  const ts = (!isNaN(tsInt) && tsInt > 0)
    ? new Date(tsInt * 1000).toISOString()
    : new Date().toISOString();

  // Name resolution priority: explicit override > chat.name > phone number
  const name = nameOverride || chat.name || chatId.split('@')[0];

  await safePost('/api/whatsapp/bridge/chat', {
    chatId,
    name,
    isGroup: isJidGroup(chatId),
    unreadCount:          chat.unreadCount || 0,
    lastMessage:          '',
    lastMessageTimestamp: ts,
    lastMessageDirection: chat.lastMessageDirection || 'INCOMING',
    avatarUrl:            null,
  });
}

/** Sync a single Baileys message to the backend DB */
async function syncMessage(rawMsg) {
  const chatId = rawMsg.key?.remoteJid;
  if (!chatId || isJidBroadcast(chatId)) return;

  const msgId = rawMsg.key?.id;
  if (!msgId) return;

  const msgContent = rawMsg.message;
  if (!msgContent) return;  // protocol-level empty, skip

  const body      = getText(msgContent);
  const mediaType = getMediaType(msgContent);
  const fromMe    = rawMsg.key?.fromMe || false;
  const direction = fromMe ? 'OUTGOING' : 'INCOMING';
  
  // Try to resolve push name if present
  let pushName = rawMsg.pushName || null;
  if (!pushName && !fromMe && group) {
     // For group messages, Baileys sometimes puts participant push name in message object
  }
  const group     = isJidGroup(chatId);
  let tsInt = rawMsg.messageTimestamp;
  if (tsInt && typeof tsInt === 'object' && tsInt.low) tsInt = tsInt.low;
  else if (tsInt && typeof tsInt === 'object' && tsInt.toNumber) tsInt = tsInt.toNumber();
  else tsInt = Number(tsInt);
  const ts = (!isNaN(tsInt) && tsInt > 0)
    ? new Date(tsInt * 1000).toISOString()
    : new Date().toISOString();

  const quotedText = msgContent?.extendedTextMessage?.contextInfo?.quotedMessage
    ? getText(msgContent.extendedTextMessage.contextInfo.quotedMessage)
    : null;

  // chatName logic:
  // • For INCOMING 1:1 messages: pushName = the contact's display name ✓
  // • For OUTGOING 1:1 messages: pushName = MY name, NOT useful for naming the chat → null
  // • For group messages: pushName = sender's name, send it as authorName, not as chatName
  const chatName = (!fromMe && !group) ? (rawMsg.pushName || null) : null;

  await safePost('/api/whatsapp/bridge/message', {
    messageId:   msgId,
    chatId,
    chatName,                    // contact push name (1:1 incoming only)
    isGroup:     group,
    fromMe,
    senderId:    rawMsg.key.participant || (fromMe ? 'me' : chatId),
    body,
    timestamp:   ts,
    hasMedia:    !!mediaType,
    mediaType,
    lastMessageDirection: direction,
    authorName:  group ? rawMsg.pushName : null,   // for group: sender's display name
    authorPhone: group ? rawMsg.key.participant : null,
    quotedMsg:   quotedText,
    isForwarded: !!(msgContent?.extendedTextMessage?.contextInfo?.isForwarded),
    rawPayload:  JSON.stringify(msgContent),
  });

  // Also update chat metadata with the latest message snippet and direction
  await safePost('/api/whatsapp/bridge/chat-preview', {
    chatId,
    lastMessage:          body || (mediaType ? `📎 ${mediaType.toLowerCase()}` : ''),
    lastMessageTimestamp: ts,
    lastMessageDirection: direction,
    pushName:             (!fromMe && !group) ? rawMsg.pushName : null,
  });
}


// ── Baileys bridge ────────────────────────────────────────────────────────────

async function startBridge() {
  if (reconnecting) return;
  reconnecting = true;

  // 🐕 Watchdog: restart if we're stuck in 'loading' for > 60s without progress
  const watchdog = setTimeout(() => {
    if (!isConnected && !currentQr) {
      console.log('[Bridge] 🐕 Watchdog: Stuck in loading for 60s. Restarting...');
      process.exit(1);
    }
  }, 60000);

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  // Resolve latest WA Web version (fallback if offline)
  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: [2, 3000, 1015901307],
  }));

  console.log(`[Bridge] Starting Baileys with WA v${version.join('.')}`);

  sock = makeWASocket({
    version,
    auth:            state,
    logger,
    browser:         Browsers.macOS('Desktop'),
    syncFullHistory: true,   // request full message history on first connect
    getMessage: async (key) => {
      const stored = await store.loadMessage(key.remoteJid, key.id);
      return stored?.message || { conversation: '' };
    },
  });

  store.bind(sock.ev);

  // Persist credentials on every change
  sock.ev.on('creds.update', saveCreds);

  // ── Connection state machine ───────────────────────────────────────────────
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {

    // New QR code generated
    if (qr) {
      console.log('[Bridge] QR received — waiting for scan');
      clearTimeout(watchdog);
      currentQr   = await qrcode.toDataURL(qr);
      isConnected = false;
      io.emit('qr', { qr: currentQr });
    }

    // Successfully connected
    if (connection === 'open') {
      console.log('[Bridge] ✅ Connected to WhatsApp');
      clearTimeout(watchdog);
      currentQr   = null;
      isConnected = true;
      reconnecting = false;
      io.emit('ready', { status: 'connected' });
    }

    // Connection closed
    if (connection === 'close') {
      isConnected  = false;
      reconnecting = false;

      const statusCode = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : undefined;

      console.log('[Bridge] Connection closed — status:', statusCode);

      if (statusCode === DisconnectReason.loggedOut) {
        // User explicitly logged out — clear saved credentials
        console.log('[Bridge] Logged out — clearing session, will show new QR');
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
        io.emit('disconnected', { reason: 'logged_out' });
        setTimeout(startBridge, 1000);
      } else if (statusCode !== DisconnectReason.connectionClosed) {
        // Temporary disconnect — reconnect automatically
        console.log('[Bridge] Reconnecting in 3 s...');
        setTimeout(startBridge, 3000);
      }
    }
  });

  // ── Full history sync (fires once after first connection) ─────────────────
  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, syncType }) => {
    console.log(`[Bridge] History sync started: ${chats?.length} chats, ${contacts?.length} contacts, ${messages?.length} messages (type=${syncType})`);

    // Build a contact name map: JID → display name
    // Priority: notify (push name seen on device) > name (address book)
    const nameMap = new Map();
    for (const c of (contacts || [])) {
      const resolvedName = c.notify || c.name || null;
      if (resolvedName && c.id) nameMap.set(c.id, resolvedName);
    }

    // Also collect push names from the message batch
    for (const msg of (messages || [])) {
      if (msg.pushName && msg.key?.remoteJid && !nameMap.has(msg.key.remoteJid)) {
        nameMap.set(msg.key.remoteJid, msg.pushName);
      }
    }

    console.log(`[Bridge] Resolved ${nameMap.size} contact names from history`);

    // Sync chats — pass resolved name from nameMap
    let chatsSynced = 0;
    for (const chat of (chats || [])) {
      const nameOverride = nameMap.get(chat.id) || null;
      await syncChat(chat, nameOverride);
      chatsSynced++;
      if (chatsSynced % 50 === 0) await new Promise(r => setTimeout(r, 100));
    }

    // Sync messages
    let msgsSynced = 0;
    for (const msg of (messages || [])) {
      await syncMessage(msg);
      msgsSynced++;
      if (msgsSynced % 200 === 0) {
        console.log(`[Bridge] Synced ${msgsSynced}/${messages.length} messages...`);
        await new Promise(r => setTimeout(r, 50));
      }
    }

    console.log(`[Bridge] ✅ History sync complete — ${chatsSynced} chats, ${msgsSynced} messages, ${nameMap.size} names resolved`);
    io.emit('history_synced', { chats: chatsSynced, messages: msgsSynced });

    // Trigger secondary deep sync after 5 seconds to catch stragglers in the store
    setInterval(async () => {
      // ── New: Ultra-Aggressive Identity Resolution ──
      const chatsFromStore = store.chats.all();
      console.log(`[Bridge] 🔍 Deep scanning ${chatsFromStore.length} chats for unresolved identities...`);
      
      for (const chat of chatsFromStore) {
        const jid = chat.id || chat.jid;
        if (!jid || isJidBroadcast(jid)) continue;

        // 1. Resolve Groups
        if (jid.endsWith('@g.us')) {
          try {
            const meta = await sock.groupMetadata(jid);
            if (meta.subject) {
              console.log(`[Bridge] 👨‍👩‍👧‍👦 Resolved Group: ${meta.subject}`);
              await safePost('/api/whatsapp/bridge/contact-name', { chatId: jid, name: meta.subject });
            }
          } catch (err) {
            // Group metadata failed (left group or community internal)
          }
        } 
        // 2. Resolve Contacts
        else if (jid.endsWith('@s.whatsapp.net')) {
          const contact = store.contacts[jid];
          const resolvedName = contact?.notify || contact?.name;
          if (resolvedName) {
            await safePost('/api/whatsapp/bridge/contact-name', { chatId: jid, name: resolvedName });
          } else {
            // Last resort: query presence to trigger a notify push from WA
            try { await sock.presenceSubscribe(jid); } catch (e) {}
          }
        }
        await new Promise(r => setTimeout(r, 100)); // Rate limit
      }
      io.emit('contacts_resolved', { count: 'final' });

      // ── New: Identity Healer (Periodic) ──
      // ── New: Backend-Driven Identity Healer (Zero-Gap) ──
      const resolveIdentities = async () => {
        if (!sock || isConnected === false) return;
        
        try {
          const { data: chats } = await axios.get(`${BACKEND_URL}/api/whatsapp/chats`);
          console.log(`[Bridge] 🩺 Healer: Fetched ${chats.length} chats from backend. Checking for raw IDs...`);
          let resolvedInThisPass = 0;
          
          for (const chat of chats) {
            const jid = chat.chatId;
            const name = chat.name || '';
            const isNumeric = /^[0-9-]+$/.test(name) || name === jid || name.includes('@');
            
            if (isNumeric && (jid.endsWith('@g.us') || jid.endsWith('@s.whatsapp.net'))) {
              try {
                if (jid.endsWith('@g.us')) {
                  console.log(`[Bridge] 🩺 Healer: Resolving group metadata for ${jid}...`);
                  const meta = await sock.groupMetadata(jid);
                  if (meta.subject) {
                    await safePost('/api/whatsapp/bridge/contact-name', { chatId: jid, name: meta.subject });
                    resolvedInThisPass++;
                  }
                } else {
                  console.log(`[Bridge] 🩺 Healer: Resolving contact name for ${jid}...`);
                  const [result] = await sock.onWhatsApp(jid);
                  if (result && result.exists) {
                    // Contact exists, push update will occur via store/upsert events
                    // but for immediate resolution we try to find it in store
                    const contact = store.contacts[jid];
                    if (contact?.notify || contact?.name) {
                      await safePost('/api/whatsapp/bridge/contact-name', { chatId: jid, name: contact.notify || contact.name });
                      resolvedInThisPass++;
                    }
                  }
                }
              } catch (e) {
                // Rate limit or not authorized
              }
              await new Promise(r => setTimeout(r, 500)); // Rate limit
            }
          }
          
          if (resolvedInThisPass > 0) {
            console.log(`[Bridge] 🩺 Resolved ${resolvedInThisPass} identities. Re-scanning in 30s.`);
            setTimeout(resolveIdentities, 30000);
          } else {
            console.log('[Bridge] 🩺 All backup identities look stable. Re-scanning in 2m.');
            setTimeout(resolveIdentities, 120000);
          }
        } catch (e) {
          console.error('[Bridge] 🩺 Healer failed to fetch chats from backend:', e.message);
          setTimeout(resolveIdentities, 60000);
        }
      };
      
      resolveIdentities();
    }, 5000);
  });


  // ── Real-time incoming messages ────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== 'notify') return;

    for (const msg of msgs) {
      if (!msg.message) continue;
      await syncMessage(msg);

      // ── New: Dynamic Identity Resolution ──
      const jid = msg.key.remoteJid;
      if (jid && (jid.endsWith('@g.us') || jid.endsWith('@s.whatsapp.net'))) {
        setTimeout(async () => {
          try {
            if (jid.endsWith('@g.us')) {
              const m = await sock.groupMetadata(jid);
              if (m.subject) await safePost('/api/whatsapp/bridge/contact-name', { chatId: jid, name: m.subject });
            } else {
              const contact = store.contacts[jid];
              if (contact?.notify || contact?.name) {
                await safePost('/api/whatsapp/bridge/contact-name', { chatId: jid, name: contact.notify || contact.name });
              }
            }
          } catch (e) {}
        }, 1000);
      }

      let tsInt = msg.messageTimestamp;
      if (tsInt && typeof tsInt === 'object' && tsInt.low) tsInt = tsInt.low;
      else if (tsInt && typeof tsInt === 'object' && tsInt.toNumber) tsInt = tsInt.toNumber();
      else tsInt = Number(tsInt);
      
      io.emit('new_message', {
        chatId:    msg.key.remoteJid,
        messageId: msg.key.id,
        fromMe:    msg.key.fromMe || false,
        body:      getText(msg.message),
        mediaType: getMediaType(msg.message),
        timestamp: (!isNaN(tsInt) && tsInt > 0)
          ? new Date(tsInt * 1000).toISOString()
          : new Date().toISOString(),
      });
    }
  });

  // ── Contact name resolution (fires as WA pushes contact info) ────────────
  // Baileys fires this event after connection with all known contact push names.
  // This is the primary fix for phone-number chat names.
  sock.ev.on('contacts.upsert', async (contacts) => {
    let updated = 0;
    for (const c of contacts) {
      const name = c.notify || c.name || null;
      if (!name || !c.id || isJidBroadcast(c.id)) continue;
      await safePost('/api/whatsapp/bridge/contact-name', { chatId: c.id, name });
      updated++;
    }
    if (updated > 0) {
      console.log(`[Bridge] ✅ Resolved ${updated} names via contacts.upsert`);
      io.emit('contacts_resolved', { count: updated });
    }
  });

  sock.ev.on('contacts.update', async (contacts) => {
    for (const c of contacts) {
      const name = c.notify || c.name || null;
      if (name && c.id && !isJidBroadcast(c.id)) {
        await safePost('/api/whatsapp/bridge/contact-name', { chatId: c.id, name });
        io.emit('contacts_resolved', { chatId: c.id, name });
      }
    }
  });

  // Handle group metadata updates to fix "Group JID" names
  sock.ev.on('groups.upsert', async (groups) => {
    for (const g of groups) {
      if (g.subject && g.id) {
        await safePost('/api/whatsapp/bridge/contact-name', { chatId: g.id, name: g.subject });
        io.emit('contacts_resolved', { chatId: g.id, name: g.subject });
      }
    }
  });

  // Remove duplicate messaging-history.set handler and replace with generic connection logger
  sock.ev.on('connection.update', async ({ connection }) => {
    if (connection === 'open') {
       console.log('[Bridge] 🟢 Connection stable. Starting Zero-Gap identity resolution...');
       isConnected = true;
       
       // Give WA a moment to push the store
       setInterval(async () => {
         const chats = store.chats.all();
         console.log(`[Bridge] 🩺 Healer: Scanning ${chats.length} chats for raw IDs...`);
         for (const chat of chats) {
           if (!sock) break;
           const jid = chat.id || chat.jid;
           if (jid && (jid.endsWith('@g.us') || jid.endsWith('@s.whatsapp.net'))) {
             // If name is missing or is just the ID
             if (!chat.name || chat.name === jid || /^[0-9-]+$/.test(chat.name)) {
               try {
                 if (jid.endsWith('@g.us')) {
                   const m = await sock.groupMetadata(jid);
                   if (m.subject) await safePost('/api/whatsapp/bridge/contact-name', { chatId: jid, name: m.subject });
                 } else {
                   const contact = store.contacts[jid];
                   if (contact?.notify || contact?.name) {
                     await safePost('/api/whatsapp/bridge/contact-name', { chatId: jid, name: contact.notify || contact.name });
                   }
                 }
                 await new Promise(r => setTimeout(r, 200)); // Rate limit
               } catch (e) {}
             }
           }
         }
         console.log('[Bridge] 🩺 Zero-Gap identity resolution pass complete.');
       }, 10000);
    }
  });
}

// ── HTTP REST API ─────────────────────────────────────────────────────────────

app.get('/health', (_, res) => res.json({ status: 'ok', connected: isConnected }));

app.get('/status', (_, res) => res.json({
  authenticated: isConnected,
  ready:         isConnected,
  hasQr:         !!currentQr,
}));

app.get('/qr', async (_, res) => {
  if (isConnected)  return res.status(204).send();
  if (!currentQr)   return res.status(202).json({ message: 'QR not yet generated — please wait' });
  const base64 = currentQr.replace(/^data:image\/png;base64,/, '');
  res.set('Content-Type', 'image/png').send(Buffer.from(base64, 'base64'));
});

app.post('/send', async (req, res) => {
  if (!isConnected || !sock) return res.status(503).json({ error: 'Not connected to WhatsApp' });
  const { to, content } = req.body;
  if (!to || !content) return res.status(400).json({ error: '"to" and "content" are required' });
  try {
    const result = await sock.sendMessage(to, { text: content });
    // Persist the sent message immediately
    await syncMessage({
      key:              { remoteJid: to, fromMe: true, id: result.key.id },
      message:          { conversation: content },
      messageTimestamp: Math.floor(Date.now() / 1000),
    });
    res.json({ success: true, messageId: result.key.id });
  } catch (err) {
    console.error('[Bridge] /send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


const MEDIA_CACHE_DIR = path.join(SESSION_DIR, 'media_cache');
if (!fs.existsSync(MEDIA_CACHE_DIR)) fs.mkdirSync(MEDIA_CACHE_DIR, { recursive: true });

app.get('/media/:chatId/:messageId', async (req, res) => {
  if (!isConnected || !sock) return res.status(503).json({ error: 'Not connected to WhatsApp' });
  
  const { chatId, messageId } = req.params;
  const cachePath = path.join(MEDIA_CACHE_DIR, `${messageId}`);
  
  // 1. Check disk cache first
  if (fs.existsSync(cachePath)) {
    const metaPath = `${cachePath}.meta`;
    const mimetype = fs.existsSync(metaPath) ? fs.readFileSync(metaPath, 'utf8') : 'image/jpeg';
    res.set('Content-Type', mimetype);
    return res.sendFile(path.resolve(cachePath));
  }

  try {
    // 2. Load message from store or fallback to backend
    let msg = await store.loadMessage(chatId, messageId);
    
    if (!msg || !msg.message) {
      console.log(`[Bridge] Message ${messageId} not in RAM, fetching rawPayload from backend...`);
      const remoteMsg = await axios.get(`${BACKEND_URL}/api/whatsapp/messages/wa/${messageId}`).catch(() => null);
      if (!remoteMsg?.data?.rawPayload) return res.status(404).json({ error: 'Message metadata not found' });
      
      const payload = JSON.parse(remoteMsg.data.rawPayload);
      msg = { key: { remoteJid: chatId, id: messageId }, message: payload };
    }

    // 3. Download from WhatsApp
    console.log(`[Bridge] Downloading media for ${messageId}...`);
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger });
    const mimetype = getWrappedMimetype(msg.message);
    
    // 4. Cache to disk
    fs.writeFileSync(cachePath, buffer);
    fs.writeFileSync(`${cachePath}.meta`, mimetype);
    
    res.set('Content-Type', mimetype);
    res.send(buffer);
  } catch (err) {
    console.error(`[Bridge] Media download failed for ${messageId}:`, err.message);
    res.status(500).json({ error: 'Failed to download media' });
  }
});

function getWrappedMimetype(msg) {
  const m = msg.imageMessage || msg.videoMessage || msg.audioMessage || msg.documentMessage || msg.stickerMessage;
  return m?.mimetype || 'application/octet-stream';
}

app.get('/avatar/:chatId', async (req, res) => {
  if (!isConnected || !sock) return res.status(503).json({ error: 'Not connected' });
  const { chatId } = req.params;
  const cachePath = path.join(MEDIA_CACHE_DIR, `avatar_${chatId.replace(/[^a-zA-Z0-9]/g, '_')}`);
  
  // 1. Check disk cache
  if (fs.existsSync(cachePath)) {
    const stats = fs.statSync(cachePath);
    if (Date.now() - stats.mtimeMs < 86400000) { // 24h cache for avatars
      res.set('Content-Type', 'image/jpeg');
      return res.sendFile(path.resolve(cachePath));
    }
  }

  try {
    const url = await sock.profilePictureUrl(chatId, 'image').catch(() => null);
    if (!url) return res.status(404).json({ error: 'No avatar' });
    
    const resp = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(cachePath, resp.data);
    
    res.set('Content-Type', 'image/jpeg');
    res.send(resp.data);
  } catch (err) {
    res.status(404).send();
  }
});

// ── Session Management (Logout & Hard Reset) ──────────────────────────────────

/**
 * Clean Logout: tell WA to invalidate this session, then wipe local creds.
 */
app.post('/logout', async (req, res) => {
  console.log('[Bridge] 🔴 Logout requested');
  try {
    if (sock) {
      await sock.logout().catch(() => {});
      sock.end();
    }
    if (fs.existsSync(AUTH_DIR)) {
      console.log('[Bridge] Wiping auth_info...');
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    res.json({ success: true, message: 'Logged out successfully' });
    
    // Trigger restart to ensure a clean state for the next QR
    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    console.error('[Bridge] Logout failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Hard Reset: Forcefully nukes the entire SESSION_DIR and restarts the bridge.
 * This is the "Nuclear Option" for stuck or corrupted states.
 */
app.post('/reset', async (req, res) => {
  console.log('[Bridge] ☢️ HARD RESET REQUESTED');
  try {
    if (sock) {
      try { await sock.logout(); } catch (e) {}
      sock.end();
    }
    
    // 1. Tell backend to wipe its WhatsApp DB tables
    console.log('[Bridge] Requesting data purge from backend...');
    await axios.post(`${BACKEND_URL}/api/whatsapp/bridge/clear-all`).catch(e => {
        console.error('[Bridge] Backend purge failed:', e.message);
    });

    // 2. Clear the whole session dir (auth, store, media cache)
    if (fs.existsSync(SESSION_DIR)) {
      console.log(`[Bridge] Nuking local session content in ${SESSION_DIR}...`);
      const files = fs.readdirSync(SESSION_DIR);
      for (const file of files) {
          const p = path.join(SESSION_DIR, file);
          fs.rmSync(p, { recursive: true, force: true });
      }
    }
    
    res.json({ success: true, message: 'Nuclear reset triggered. System is now clean. Restarting bridge...' });
    
    // 3. Immediate exit — Docker will restart everything from scratch
    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    console.error('[Bridge] Hard reset failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[Bridge] Frontend connected via Socket.io');
  // Send current state immediately to the newly connected client
  if (currentQr)   socket.emit('qr',    { qr: currentQr });
  if (isConnected) socket.emit('ready', { status: 'connected' });
  socket.on('disconnect', () => console.log('[Bridge] Frontend disconnected'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Bridge] HTTP + Socket.io listening on port ${PORT}`);
  console.log(`[Bridge] Backend URL : ${BACKEND_URL}`);
  console.log(`[Bridge] Session dir : ${SESSION_DIR}`);
  startBridge();
});
