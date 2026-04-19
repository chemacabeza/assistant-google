import React, {
  useState, useEffect, useMemo, useRef, useCallback,
} from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import {
  Search, MoreVertical, Send, Paperclip, Smile, Mic,
  CheckCheck, ShieldCheck, Globe, Loader2, X, RefreshCw,
  Image as ImageIcon, FileText, Volume2, Video, Phone, Edit3,
  MessageSquare, Users, CircleDot, Star, Camera, Settings,
  Megaphone, MessageCircle, Archive, Zap, WifiOff, QrCode,
} from 'lucide-react';
import { api } from '../api/axios';

/* ─── Design Tokens (WhatsApp Web dark palette) ─────────────────────────── */
const C = {
  bg:        '#0b141a',
  panel:     '#111b21',
  header:    '#202c33',
  hover:     '#2a3942',
  selected:  '#2a3942',
  divider:   '#222d34',
  inputBg:   '#2a3942',
  bubbleIn:  '#202c33',
  bubbleOut: '#005c4b',
  textPri:   '#d1d7db', // Slightly softer production white
  textSec:   '#8696a0',
  green:     '#00a884',
  blue:      '#53bdeb',
  iconActive:'#aebac1',
  overlayBg: '#222e35',
};

/* ─── Bridge Socket.io URL  ──────────────────────────────────────────────── */
// Connect directly to the bridge for real-time events.
// Uses the current hostname so it works both locally and over network.
const BRIDGE_WS_URL = `http://${window.location.hostname}:3001`;

/* ─── Avatar palette ─────────────────────────────────────────────────────── */
const AVATAR_BG = [
  '#00a884','#128c7e','#dfa62f','#3b82f6',
  '#9333ea','#ef4444','#f97316','#0ea5e9',
  '#14b8a6','#f43f5e','#8b5cf6','#22c55e',
];
const avatarBg = (id = '') =>
  AVATAR_BG[id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_BG.length];

/* ─── Time formatter ─────────────────────────────────────────────────────── */
const fmtTime = ts => {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 1)  return 'Yesterday';
  if (diff < 7)   return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const fmtDateLabel = ts => {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
};

const mediaIcon = type => {
  if (!type) return null;
  const t = type.toUpperCase();
  if (t === 'IMAGE' || t === 'STICKER') return <ImageIcon size={13} />;
  if (t === 'VIDEO')  return <Video size={13} />;
  if (t === 'AUDIO' || t === 'PTT') return <Volume2 size={13} />;
  return <FileText size={13} />;
};

const mediaLabel = type => {
  if (!type) return '';
  const t = type.toUpperCase();
  if (t === 'IMAGE')    return 'Photo';
  if (t === 'VIDEO')    return 'Video';
  if (t === 'AUDIO' || t === 'PTT') return 'Audio';
  if (t === 'STICKER')  return 'Sticker';
  if (t === 'DOCUMENT') return 'Document';
  return type;
};

/* ─── Avatar ────────────────────────────────────────────────────────────── */
const Avatar = ({ src, name = '?', id = '', size = 40 }) => {
  const [err, setErr] = useState(false);
  const proxyUrl = id ? `${BRIDGE_WS_URL}/avatar/${encodeURIComponent(id)}` : null;
  const initial = name ? name.charAt(0).toUpperCase() : '?';

  // Prefer the provided src, fallback to bridge proxy, fallback to initials
  const finalSrc = (src && !err) ? src : (!err && proxyUrl ? proxyUrl : null);

  if (finalSrc) {
    return (
      <img
        src={finalSrc} alt={name}
        onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, display: 'block' }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: avatarBg(id || name), display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.43, color: '#fff', userSelect: 'none',
    }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );
};

/* ─── Icon button ────────────────────────────────────────────────────────── */
const IconBtn = ({ icon, title, onClick, style = {} }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: C.textSec, padding: 8, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'color .15s, background .15s', ...style,
    }}
    onMouseEnter={e => { e.currentTarget.style.color = C.iconActive; e.currentTarget.style.background = 'rgba(255,255,255,.05)'; }}
    onMouseLeave={e => { e.currentTarget.style.color = C.textSec;    e.currentTarget.style.background = 'none'; }}
  >
    {icon}
  </button>
);

/* ─── QR / Bridge Overlay ────────────────────────────────────────────────── */
const BridgeOverlay = ({ status, qrUrl, onRetry }) => (
  <div style={{
    position: 'absolute', inset: 0, zIndex: 50,
    background: C.bg,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 32,
  }}>
    {/* Title row */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <MessageCircle size={32} color={C.green} />
      <h1 style={{ color: C.textPri, fontSize: 24, fontWeight: 300, margin: 0 }}>WhatsApp Web</h1>
    </div>

    {/* QR card */}
    {(status === 'qr' || status === 'loading') && (
      <div style={{
        background: '#fff',
        borderRadius: 24,
        padding: 28,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 20,
        boxShadow: '0 8px 40px rgba(0,0,0,.5)',
      }}>
        {status === 'qr' && qrUrl ? (
          <img src={qrUrl} alt="WhatsApp QR" style={{ width: 256, height: 256, display: 'block' }} />
        ) : (
          <div style={{ width: 256, height: 256, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
            <Loader2 size={48} color={C.green} style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#555', fontSize: 14, margin: 0, textAlign: 'center' }}>
              {status === 'loading' ? 'Generating QR code…' : 'Starting bridge…'}
            </p>
          </div>
        )}
      </div>
    )}

    {/* Instructions */}
    {status === 'qr' && qrUrl && (
      <ol style={{ color: C.textSec, fontSize: 14, lineHeight: 1.9, margin: 0, paddingLeft: 20, maxWidth: 320 }}>
        <li>Open <strong style={{ color: C.textPri }}>WhatsApp</strong> on your Android phone</li>
        <li>Tap <strong style={{ color: C.textPri }}>⋮ More options</strong> → <strong style={{ color: C.textPri }}>Linked devices</strong></li>
        <li>Tap <strong style={{ color: C.textPri }}>Link a device</strong></li>
        <li>Point your phone at this QR code to scan it</li>
      </ol>
    )}

    {/* Offline error */}
    {status === 'offline' && (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <WifiOff size={28} color="#ef4444" />
        </div>
        <p style={{ color: C.textSec, fontSize: 14, textAlign: 'center', margin: 0, maxWidth: 280 }}>
          Bridge is offline.<br />Make sure the <code style={{ color: C.green }}>whatsapp-bridge</code> container is running.
        </p>
        <button
          onClick={onRetry}
          style={{ background: C.green, border: 'none', color: '#111b21', padding: '9px 26px', borderRadius: 20, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )}

    {/* E2E note */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.textSec, fontSize: 12 }}>
      <ShieldCheck size={13} />
      <span>Your personal messages are end-to-end encrypted</span>
    </div>

    <style>{`
      @keyframes spin { to { transform: rotate(360deg); } }
      
      /* Global high-fidelity scrollbars */
      ::-webkit-scrollbar { width: 6px !important; height: 6px !important; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); }
      ::-webkit-scrollbar-track { background: transparent; }

      /* Message tail logic */
      .bubble-in::before {
        content: ""; position: absolute; top: 0; left: -8px; 
        width: 8px; height: 13px; background: ${C.bubbleIn};
        clip-path: polygon(100% 0, 0 100%, 100% 100%); /* Sharper tail for incoming */
      }
      .bubble-out::after {
        content: ""; position: absolute; top: 0; right: -8px; 
        width: 8px; height: 13px; background: ${C.bubbleOut};
        clip-path: polygon(0 0, 100% 0, 0 100%);
      }
    `}</style>
  </div>
);

/* ─── Message Bubble ─────────────────────────────────────────────────────── */
const Bubble = ({ msg }) => {
  const out = msg.direction === 'OUTGOING';
  const hasImg   = msg.mediaType === 'IMAGE' || msg.mediaType === 'STICKER';
  const hasVideo = msg.mediaType === 'VIDEO';
  const hasAudio = msg.mediaType === 'AUDIO' || msg.mediaType === 'PTT';
  
  // New media source logic: 
  // 1. Check for legacy inline base64
  // 2. Otherwise use the Bridge Proxy endpoint
  let mediaSrc = msg.mediaBase64 && msg.mediaMimetype
    ? `data:${msg.mediaMimetype};base64,${msg.mediaBase64}` : null;
    
  if (!mediaSrc && (hasImg || hasVideo || hasAudio)) {
    mediaSrc = `${BRIDGE_WS_URL}/media/${encodeURIComponent(msg.chatId)}/${msg.messageWaId}`;
  }

  return (
    <div style={{
      display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start',
      padding: '2px 6%',
    }}>
      <div 
        className={out ? 'bubble-out' : 'bubble-in'}
        style={{
          background:  out ? C.bubbleOut : C.bubbleIn,
          borderRadius: out ? '7.5px 7.5px 0 7.5px' : '7.5px 7.5px 7.5px 0',
          padding:      '6px 9px 8px',
          maxWidth:     '65%',
          minWidth:     60,
          position:     'relative',
          boxShadow:    '0 1px 0.5px rgba(0,0,0,.13)',
          wordBreak:    'break-word',
        }}
      >
        {/* Quoted message */}
        {msg.repliedToContent && (
          <div style={{ borderLeft: `3px solid ${out ? 'rgba(255,255,255,.4)' : C.green}`, paddingLeft: 8, marginBottom: 6, borderRadius: 2 }}>
            <p style={{ color: out ? 'rgba(255,255,255,.7)' : C.textSec, fontSize: 12, margin: 0, whiteSpace: 'pre-wrap', overflow: 'hidden', maxHeight: 40 }}>
              {msg.repliedToContent}
            </p>
          </div>
        )}
        {/* Media */}
        {hasImg && mediaSrc && (
          <div style={{ margin: '-6px -9px 6px', overflow: 'hidden', borderRadius: out ? '12px 2px 0 0' : '0 12px 0 0', cursor: 'pointer' }}>
            <img src={mediaSrc} alt="media" style={{ maxWidth: '100%', maxHeight: 320, minWidth: 200, display: 'block', objectFit: 'cover' }} />
          </div>
        )}
        {!hasImg && !hasVideo && !hasAudio && msg.mediaType && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.textSec, fontSize: 13, paddingRight: 52, marginBottom: msg.content ? 4 : 0 }}>
            {mediaIcon(msg.mediaType)}
            <span style={{ color: C.textSec }}>{mediaLabel(msg.mediaType)}</span>
          </div>
        )}
        {hasVideo && mediaSrc && (
          <div style={{ margin: '-6px -9px 6px', overflow: 'hidden', borderRadius: out ? '12px 2px 0 0' : '0 12px 0 0', minWidth: 250 }}>
            <video src={mediaSrc} controls style={{ maxWidth: '100%', display: 'block' }} />
          </div>
        )}
        {hasAudio && mediaSrc && (
          <audio src={mediaSrc} controls style={{ height: 40, width: '100%', marginBottom: 6 }} />
        )}
        {/* Text */}
        {msg.content && (
          <p style={{ fontSize: 14.2, color: C.textPri, margin: 0, whiteSpace: 'pre-wrap', paddingRight: 52, lineHeight: 1.45 }}>
            {msg.content}
          </p>
        )}
        {/* Timestamp + tick */}
        <div style={{ position: 'absolute', bottom: 5, right: 8, display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 11, color: 'rgba(134,150,160,.85)', whiteSpace: 'nowrap' }}>
            {fmtTime(msg.timestamp)}
          </span>
          {out && <CheckCheck size={14} color={C.blue} />}
        </div>
      </div>
    </div>
  );
};

/* ─── Date Divider ───────────────────────────────────────────────────────── */
const DateDivider = ({ label }) => (
  <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 6px' }}>
    <span style={{ background: C.header, color: C.textSec, borderRadius: 8, padding: '4px 12px', fontSize: 12, boxShadow: '0 1px 2px rgba(0,0,0,.3)' }}>
      {label}
    </span>
  </div>
);

/* ─── Chat Row ───────────────────────────────────────────────────────────── */
const ChatRow = ({ chat, isSelected, onClick }) => {
  const hasUnread = chat.unreadCount > 0;
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', cursor: 'pointer',
        borderBottom: `1px solid ${C.divider}`,
        background: isSelected ? C.selected : 'transparent',
        transition: 'background .1s linear',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.hover; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      <Avatar src={chat.avatarUrl} name={chat.name} id={chat.chatId} size={49} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: C.textPri, fontSize: 16, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {chat.name || chat.chatId.split('@')[0]}
          </span>
          <span style={{ color: hasUnread ? C.green : C.textSec, fontSize: 12, flexShrink: 0, marginLeft: 8 }}>
            {fmtTime(chat.lastMessageTimestamp)}
          </span>
        </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            {chat.lastMessageDirection === 'OUTGOING' && <CheckCheck size={16} style={{ color: chat.unreadCount === 0 ? C.blue : C.textSec, flexShrink: 0 }} />}
            <span style={{ color: C.textSec, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chat.lastMessage || (chat.lastMediaType ? mediaLabel(chat.lastMediaType) : '')}
            </span>
          </div>
          {hasUnread && (
            <div style={{ background: C.green, color: '#0b141a', borderRadius: '50%', minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, padding: '0 4px', flexShrink: 0 }}>
              {chat.unreadCount}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Static Sections ────────────────────────────────────────────────────── */
const InfoRow = ({ icon, label, count }) => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 12px 16px', cursor: 'pointer', borderBottom: `1px solid ${C.divider}` }} className="chat-row-hover">
    <div style={{ width: 44, display: 'flex', justifyContent: 'center', color: C.green }}>{icon}</div>
    <div style={{ flex: 1, marginLeft: 16, color: C.textPri, fontSize: 16, fontWeight: 300 }}>{label}</div>
    {count !== undefined && <span style={{ color: C.green, fontSize: 12, fontWeight: 500 }}>{count}</span>}
  </div>
);

/* ═══════════════════════  MAIN COMPONENT  ═══════════════════════════════════ */
const WhatsApp = () => {
  const navigate = useNavigate();

  const [chats, setChats]               = useState([]);
  const [messages, setMessages]         = useState([]);
  const [selected, setSelected]         = useState(null);
  const [search, setSearch]             = useState('');
  const [newMsg, setNewMsg]             = useState('');
  const [sending, setSending]           = useState(false);
  const [loading, setLoading]           = useState(true);
  const [msgLoading, setMsgLoading]     = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState('loading');
  const [filter, setFilter]             = useState('All');
  const [qrDataUrl, setQrDataUrl]       = useState(null);
  const [historySync, setHistorySync]   = useState(null);
  const [socketOk, setSocketOk]         = useState(false);
  const [showMenu, setShowMenu]         = useState(false);
  const [resetting, setResetting]       = useState(false);

  const endRef      = useRef(null);
  const socketRef   = useRef(null);
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const fetchMessages = useCallback(async (chatId) => {
    if (!chatId) return;
    setMsgLoading(true);
    try {
      const r = await api.get(`/api/whatsapp/chats/${encodeURIComponent(chatId)}/messages`);
      setMessages(r.data || []);
    } catch { setMessages([]); }
    finally { setMsgLoading(false); }
  }, []);

  const fetchChats = useCallback(async () => {
    try {
      const r = await api.get('/api/whatsapp/chats');
      const data = r.data || [];
      setChats(data);
      setLoading(false);
      
      // Auto-select the latest chat on initial load if none selected
      if (!selectedRef.current && data.length > 0) {
        setSelected(data[0]);
        fetchMessages(data[0].chatId);
      }
    } catch (err) { 
      console.error('[WA] Failed to fetch chats:', err);
      setLoading(false); 
    }
  }, [fetchMessages]);

  useEffect(() => {
    const socket = io(BRIDGE_WS_URL, {
      transports:     ['websocket', 'polling'],
      reconnectionDelay: 2000,
      timeout:        10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[WA] Socket.io connected to bridge');
      setSocketOk(true);
    });

    socket.on('disconnect', () => {
      console.log('[WA] Socket.io disconnected');
      setSocketOk(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('[WA] Socket.io connect error:', err.message);
      api.get('/api/whatsapp/bridge/status', { timeout: 4000 })
        .then(r => {
          const { authenticated, ready, hasQr } = r.data;
          if      (ready)         setBridgeStatus('ready');
          else if (hasQr)         setBridgeStatus('qr');
          else if (authenticated) setBridgeStatus('loading');
          else                    setBridgeStatus('qr');
        })
        .catch(() => setBridgeStatus('offline'));
    });

    socket.on('qr', ({ qr }) => {
      console.log('[WA] QR received');
      setQrDataUrl(qr);
      setBridgeStatus('qr');
    });

    socket.on('ready', () => {
      console.log('[WA] Bridge ready');
      setBridgeStatus('ready');
      setQrDataUrl(null);
      fetchChats();
    });

    socket.on('disconnected', ({ reason }) => {
      console.log('[WA] Bridge disconnected:', reason);
      setBridgeStatus('qr');
      setQrDataUrl(null);
    });

    socket.on('history_synced', ({ chats: c, messages: m }) => {
      console.log(`[WA] History synced: ${c} chats, ${m} messages`);
      setHistorySync({ chats: c, messages: m });
      fetchChats();
      if (selectedRef.current) fetchMessages(selectedRef.current.chatId);
    });

    socket.on('new_message', ({ chatId }) => {
      fetchChats();
      if (selectedRef.current?.chatId === chatId) {
        fetchMessages(chatId);
      }
    });

    socket.on('contacts_resolved', ({ count }) => {
      console.log(`[WA] ${count} contact names resolved — refreshing chat list`);
      fetchChats();
    });

    socket.on('chat_update', () => {
      fetchChats();
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchChats, fetchMessages]);


  useEffect(() => {
    fetchChats();
    const t = setInterval(fetchChats, 10000);
    return () => clearInterval(t);
  }, [fetchChats]);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    fetchMessages(selected.chatId);
    const t = setInterval(() => fetchMessages(selected.chatId), 8000);
    return () => clearInterval(t);
  }, [selected, fetchMessages]);

  const msgRetryRef = useRef(null);
  useEffect(() => {
    if (msgRetryRef.current) { clearInterval(msgRetryRef.current); msgRetryRef.current = null; }
    if (!selected || messages.length > 0) return;
    let tries = 0;
    msgRetryRef.current = setInterval(async () => {
      tries++;
      if (tries > 15) { clearInterval(msgRetryRef.current); return; }
      const r = await api.get(`/api/whatsapp/chats/${encodeURIComponent(selected.chatId)}/messages`).catch(() => null);
      if (r?.data?.length > 0) {
        setMessages(r.data);
        clearInterval(msgRetryRef.current);
      }
    }, 4000);
    return () => { if (msgRetryRef.current) clearInterval(msgRetryRef.current); };
  }, [selected, messages.length]);


  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const visibleChats = useMemo(() => chats.filter(c => {
    const match = (c.name || '').toLowerCase().includes(search.toLowerCase());
    if (filter === 'Unread')  return match && c.unreadCount > 0;
    if (filter === 'Groups')  return match && c.group;
    return match;
  }), [chats, search, filter]);

  const msgItems = useMemo(() => {
    const out = []; let lastDate = '';
    messages.forEach(msg => {
      const day = msg.timestamp ? new Date(msg.timestamp).toDateString() : '';
      if (day !== lastDate) {
        out.push({ kind: 'divider', label: fmtDateLabel(msg.timestamp), key: `d-${day}` });
        lastDate = day;
      }
      out.push({ kind: 'msg', msg });
    });
    return out;
  }, [messages]);

  const handleSend = async () => {
    if (!newMsg.trim() || !selected || sending) return;
    try {
      setSending(true);
      await api.post('/api/whatsapp/send', { to: selected.chatId, content: newMsg });
      setNewMsg('');
      setTimeout(() => fetchMessages(selected.chatId), 500);
    } catch (e) { console.error('Send failed', e); }
    finally { setSending(false); }
  };

  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to log out from WhatsApp?')) return;
    try {
      setResetting(true);
      setShowMenu(false);
      await api.post(`${BRIDGE_WS_URL}/logout`);
      window.location.reload();
    } catch (e) { console.error('Logout failed', e); setResetting(false); }
  };

  const handleReset = async () => {
    if (!window.confirm('☢️ HARD RESET: This will wipe all session data and force a new QR scan from scratch. Continue?')) return;
    try {
      setResetting(true);
      setShowMenu(false);
      
      // Immediately clear local state to prevent showing stale UI during transit
      setChats([]);
      setMessages([]);
      setSelected(null);
      
      await api.post(`${BRIDGE_WS_URL}/reset`);
      // Wait for bridge/backend to reboot and settle
      setTimeout(() => window.location.reload(), 2500);
    } catch (e) { 
      console.error('Reset failed', e); 
      setResetting(false); 
      alert('Reset failed. Check bridge logs.');
    }
  };

  const showOverlay =
    bridgeStatus === 'qr'     ||
    bridgeStatus === 'offline' ||
    resetting ||
    (bridgeStatus === 'loading' && chats.length === 0);


  return (
    <div style={{
      display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden',
      background: C.bg, fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif",
      position: 'relative',
    }}>
      {showOverlay && (
        <BridgeOverlay
          status={resetting ? 'loading' : bridgeStatus}
          qrUrl={qrDataUrl}
          onRetry={() => {
            setBridgeStatus('loading');
            api.get('/api/whatsapp/bridge/status').then(r => {
              const { authenticated, ready, hasQr } = r.data;
              if (ready) setBridgeStatus('ready');
              else if (hasQr) setBridgeStatus('qr');
              else setBridgeStatus('offline');
            }).catch(() => setBridgeStatus('offline'));
          }}
        />
      )}

      <div style={{
        width: 56, background: C.panel, display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '10px 0 14px', flexShrink: 0,
        borderRight: `1px solid ${C.divider}`, zIndex: 20,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ background: C.selected, borderRadius: 16, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.iconActive, position: 'relative', cursor: 'pointer' }}>
            <MessageSquare fill="currentColor" size={22} />
            {chats.some(c => c.unreadCount > 0) && (
              <div style={{ position: 'absolute', top: 6, right: 10, width: 8, height: 8, background: C.green, borderRadius: '50%', border: `2px solid ${C.selected}` }} />
            )}
          </div>
          <IconBtn icon={<CircleDot size={22} />} title="Status" />
          <IconBtn icon={<Megaphone size={22} />} title="Channels" />
          <IconBtn icon={<Users size={22} />} title="Communities" />
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <IconBtn icon={<Settings size={22} />} title="Settings" />
          <div
            title="Back to Dashboard"
            onClick={() => navigate('/dashboard')}
            style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', background: avatarBg('me'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#fff', marginTop: 4 }}
          >
            M
          </div>
        </div>
      </div>

      <div style={{
        width: 360, minWidth: 280, display: 'flex', flexDirection: 'column',
        background: C.panel, borderRight: `1px solid ${C.divider}`,
        flexShrink: 0, position: 'relative', zIndex: 10,
      }}>
        <div style={{ height: 59, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: C.header, flexShrink: 0, borderBottom: `1px solid ${C.divider}` }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: C.textPri, paddingLeft: 4, letterSpacing: '-0.5px' }}>WhatsApp</span>
          <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
            {[CircleDot, Users, Megaphone, MessageSquare].map((Icon, i) => (
              <IconBtn key={i} icon={<Icon size={20} color={C.textSec} />} />
            ))}
            <IconBtn 
               icon={<MoreVertical size={20} color={C.textSec} />} 
               onClick={() => setShowMenu(!showMenu)}
            />
            {showMenu && (
              <div 
                style={{
                  position: 'absolute', top: 40, right: 0, 
                  background: C.header, borderRadius: 3, 
                  boxShadow: '0 4px 12px rgba(0,0,0,.3)', 
                  zIndex: 100, width: 180, padding: '8px 0'
                }}
                onMouseLeave={() => setShowMenu(false)}
              >
                <div 
                  onClick={handleLogout}
                  style={{ padding: '10px 24px', color: C.textPri, fontSize: 14, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.hover}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  Log out
                </div>
                <div 
                  onClick={handleReset}
                  style={{ padding: '10px 24px', color: '#ffb300', fontSize: 14, cursor: 'pointer', borderTop: `1px solid ${C.divider}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.hover}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  Reset Session
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '8px 12px', flexShrink: 0 }}>
          <div style={{ background: C.inputBg, borderRadius: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px' }}>
            <Search size={16} color={C.textSec} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search or start new chat"
              style={{ background: 'none', border: 'none', outline: 'none', flex: 1, fontSize: 14, color: C.textPri }}
            />
            {search && <X size={16} color={C.textSec} onClick={() => setSearch('')} style={{ cursor: 'pointer' }} />}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '0 12px 8px', flexShrink: 0 }}>
          {['All', 'Unread', 'Favorites', 'Groups'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 12px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                background: filter === f ? 'rgba(0,168,132,.2)' : C.header,
                color: filter === f ? C.green : C.textSec,
                transition: 'all .2s'
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {historySync && (
          <div style={{ padding: '6px 16px', background: 'rgba(0,168,132,.12)', borderBottom: `1px solid ${C.divider}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Zap size={14} color={C.green} />
            <span style={{ color: C.green, fontSize: 12 }}>
              Synced {historySync.chats} chats · {historySync.messages} messages
            </span>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <InfoRow icon={<ShieldCheck size={20} />} label="Locked chats" />
          <InfoRow icon={<Archive size={20} />} label="Archived" count={0} />

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
              <Loader2 size={22} color={C.green} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          )}
          {!loading && visibleChats.length === 0 && (
            <p style={{ textAlign: 'center', color: C.textSec, fontSize: 14, padding: 32 }}>
              {search ? 'No chats match your search' : 'No conversations yet'}
            </p>
          )}
          {visibleChats.map(c => (
            <ChatRow
              key={c.chatId}
              chat={c}
              isSelected={selected?.chatId === c.chatId}
              onClick={() => { setSelected(c); setMessages([]); fetchMessages(c.chatId); }}
            />
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        {/* Wallpaper */}
        <div style={{
          position: "absolute", inset: 0, opacity: .12, pointerEvents: "none",
          backgroundImage: "url('https://w0.peakpx.com/wallpaper/818/148/HD-whatsapp-dark-background-whatsapp-doodle-patterns-thumbnail.jpg')",
          backgroundSize: "460px", backgroundRepeat: "repeat",
        }} />

        {selected ? (
          <>
            {/* Chat header */}
            <div style={{ height: 60, background: C.header, flexShrink: 0, position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: `1px solid ${C.divider}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <Avatar src={selected.avatarUrl} name={selected.name} id={selected.chatId} size={40} />
                <div>
                  <p style={{ color: C.textPri, fontSize: 16, fontWeight: 500, margin: 0 }}>{selected.name}</p>
                  <p style={{ color: C.textSec, fontSize: 12.5, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
                    {selected.chatId.endsWith('@g.us') 
                      ? 'click here for group info' 
                      : 'click here for contact info'}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {[Video, Phone, Search, MoreVertical].map((Icon, i) => (
                  <IconBtn key={i} icon={<Icon size={20} />} />
                ))}
              </div>
            </div>

            {/* Messages area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', position: 'relative', zIndex: 1 }}>
              {msgLoading && messages.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
                  <Loader2 size={22} color={C.green} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : messages.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
                  <Loader2 size={24} color={C.green} style={{ animation: 'spin 1s linear infinite', opacity: 0.8 }} />
                  <p style={{ color: C.textSec, fontSize: 13, margin: 0 }}>Syncing messages...</p>
                </div>
              ) : (
                msgItems.map((item, i) =>
                  item.kind === 'divider'
                    ? <DateDivider key={item.key} label={item.label} />
                    : <Bubble key={item.msg.id || i} msg={item.msg} />
                )
              )}
              <div ref={endRef} />
            </div>

            {/* Message input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: C.header, borderTop: `1px solid ${C.divider}`, flexShrink: 0, zIndex: 10, position: 'relative' }}>
              <IconBtn icon={<Smile size={24} />} />
              <IconBtn icon={<Paperclip size={24} style={{ transform: 'rotate(-45deg)' }} />} />
              <div style={{ flex: 1, background: C.inputBg, borderRadius: 9, padding: '0 16px' }}>
                <input
                  value={newMsg}
                  onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Type a message"
                  disabled={sending}
                  style={{ background: 'none', border: 'none', outline: 'none', width: '100%', fontSize: 15, color: C.textPri, padding: '10px 0' }}
                />
              </div>
              <IconBtn
                icon={newMsg.trim() ? <Send size={24} color={C.green} /> : <Mic size={24} />}
                onClick={newMsg.trim() ? handleSend : undefined}
              />
            </div>
          </>
        ) : (
          /* No chat selected — empty state */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 48, position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <div style={{ width: 200, height: 200, borderRadius: '50%', background: 'rgba(134,150,160,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={110} color="rgba(134,150,160,.1)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: C.textPri, fontSize: 32, fontWeight: 300, margin: '0 0 10px', opacity: 0.88 }}>WhatsApp Web</h2>
              <p style={{ color: C.textSec, fontSize: 14, maxWidth: 450, margin: '0 auto', lineHeight: 1.6, opacity: 0.6 }}>
                Send and receive messages without keeping your phone online.<br />
                Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
              </p>
            </div>
            <div style={{ width: '55%', height: 1, background: C.divider }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.textSec, fontSize: 13 }}>
              <ShieldCheck size={14} />
              <span>Your personal messages are end-to-end encrypted</span>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { scrollbar-width: thin; scrollbar-color: #374045 transparent; }
        *::-webkit-scrollbar { width: 5px; }
        *::-webkit-scrollbar-thumb { background: #374045; border-radius: 3px; }
      `}</style>
    </div>
  );
};

export default WhatsApp;
