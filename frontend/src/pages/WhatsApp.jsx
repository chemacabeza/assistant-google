import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search, MoreVertical, Send, Paperclip, Smile, Mic, User,
  CheckCheck, ShieldCheck, Globe, Loader2, X, RefreshCw,
  Image as ImageIcon, FileText, Volume2, Video, Phone, Info
} from 'lucide-react';
import { api } from '../api/axios';

// ─── Theme: Official WhatsApp Dark ───────────────────────────────────────────
const T = {
  bg:        'bg-[#0b141a]',
  sidebar:   'bg-[#111b21]',
  header:    'bg-[#202c33]',
  bubbleIn:  'bg-[#202c33]',
  bubbleOut: 'bg-[#005c4b]',
  textP:     'text-[#e9edef]',
  textS:     'text-[#8696a0]',
  accent:    'text-[#00a884]',
  border:    'border-[#222d34]',
  input:     'bg-[#2a3942]',
};

const AVATAR_COLORS = [
  '#00a884','#dfa62f','#128c7e','#075e54',
  '#3b82f6','#9333ea','#ef4444','#f97316',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const avatarColor = (id = '') =>
  AVATAR_COLORS[id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

const fmtTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const mediaIcon = (type) => {
  if (!type) return null;
  const t = type.toUpperCase();
  if (t === 'IMAGE' || t === 'STICKER') return <ImageIcon size={13} />;
  if (t === 'VIDEO') return <Video size={13} />;
  if (t === 'AUDIO' || t === 'PTT') return <Volume2 size={13} />;
  return <FileText size={13} />;
};

// ─── Avatar Component ─────────────────────────────────────────────────────────
const Avatar = ({ chat, size = 12 }) => {
  const s = `w-${size} h-${size}`;
  if (chat?.avatarUrl) {
    return (
      <img
        src={chat.avatarUrl}
        alt={chat.name}
        className={`${s} rounded-full object-cover flex-shrink-0`}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    );
  }
  const letter = (chat?.name || '?')[0].toUpperCase();
  const bg = avatarColor(chat?.chatId || '');
  return (
    <div className={`${s} rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white text-lg`}
         style={{ backgroundColor: bg }}>
      {letter}
    </div>
  );
};

// ─── QR Overlay ───────────────────────────────────────────────────────────────
const QrOverlay = ({ bridgeStatus, qrDataUrl, onRefresh }) => (
  <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 bg-[#0b141a]">
    <div className="text-center space-y-2">
      <h2 className="text-2xl font-light text-[#e9edef]">Link your WhatsApp</h2>
      <p className="text-sm text-[#8696a0] max-w-xs">
        Scan this QR code with WhatsApp on your phone to mirror all your conversations.
      </p>
    </div>

    {bridgeStatus === 'loading' && (
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={48} className="animate-spin text-[#00a884]" />
        <p className="text-[#8696a0] text-sm">Starting WhatsApp bridge…</p>
      </div>
    )}

    {bridgeStatus === 'qr' && (
      <div className="flex flex-col items-center gap-4">
        <div className="p-4 bg-white rounded-2xl shadow-2xl">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="WhatsApp QR Code"
              className="w-64 h-64"
            />
          ) : (
            <div className="w-64 h-64 flex items-center justify-center">
              <Loader2 size={40} className="animate-spin text-[#00a884]" />
            </div>
          )}
        </div>
        <ol className="text-[#8696a0] text-sm space-y-1.5 text-left list-decimal list-inside max-w-xs">
          <li>Open WhatsApp on your phone</li>
          <li>Go to <strong className="text-[#e9edef]">Settings → Linked Devices</strong></li>
          <li>Tap <strong className="text-[#e9edef]">Link a Device</strong></li>
          <li>Scan the QR code above</li>
        </ol>
        <button onClick={onRefresh}
          className="flex items-center gap-2 text-[#00a884] text-sm hover:underline">
          <RefreshCw size={14} /> Refresh QR
        </button>
      </div>
    )}

    {bridgeStatus === 'offline' && (
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <X size={32} className="text-red-400" />
        </div>
        <p className="text-[#8696a0] text-sm text-center">
          WhatsApp bridge is offline.<br />
          Make sure the <code className="text-[#00a884]">whatsapp-bridge</code> container is running.
        </p>
        <button onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-[#00a884] text-white rounded-full text-sm hover:bg-[#00c99c]">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )}
  </div>
);

// ─── Message Bubble ───────────────────────────────────────────────────────────
const MessageBubble = ({ msg }) => {
  const isOut = msg.direction === 'OUTGOING';
  const hasImage = msg.mediaBase64 && (msg.mediaType === 'IMAGE' || msg.mediaType === 'STICKER');
  const hasVideo = msg.mediaBase64 && msg.mediaType === 'VIDEO';
  const hasAudio = msg.mediaBase64 && (msg.mediaType === 'AUDIO' || msg.mediaType === 'PTT');

  const mediaSrc = msg.mediaBase64 && msg.mediaMimetype
    ? `data:${msg.mediaMimetype};base64,${msg.mediaBase64}`
    : null;

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} w-full mb-1`}>
      <div className={`relative max-w-[72%] px-3 py-1.5 rounded-lg shadow-sm
        ${isOut ? 'bg-[#005c4b] rounded-tr-none' : 'bg-[#202c33] rounded-tl-none'}`}>

        {/* Group author name */}
        {!isOut && msg.authorName && (
          <p className="text-[12px] font-bold mb-0.5"
             style={{ color: avatarColor(msg.authorPhone || msg.authorName) }}>
            {msg.authorName}
          </p>
        )}

        {/* Quoted reply */}
        {msg.repliedToContent && (
          <div className="mb-1.5 flex bg-black/20 rounded-md border-l-4 border-[#00a884] overflow-hidden">
            <div className="p-2 py-1">
              <p className="text-[11px] font-bold text-[#00a884]">{isOut ? 'You' : (msg.senderName || msg.senderId)}</p>
              <p className="text-[12px] text-[#8696a0] truncate italic">{msg.repliedToContent}</p>
            </div>
          </div>
        )}

        {/* Image */}
        {hasImage && mediaSrc && (
          <div className="-mx-3 -mt-1.5 mb-1 overflow-hidden rounded-t-lg">
            <img src={mediaSrc} alt="media" className="max-h-80 w-full object-cover" />
          </div>
        )}

        {/* Video */}
        {hasVideo && mediaSrc && (
          <div className="-mx-3 -mt-1.5 mb-1 overflow-hidden rounded-t-lg">
            <video src={mediaSrc} controls className="max-h-64 w-full" />
          </div>
        )}

        {/* Audio */}
        {hasAudio && mediaSrc && (
          <div className="flex items-center gap-2 mb-1">
            <audio src={mediaSrc} controls className="max-w-full h-8" />
          </div>
        )}

        {/* Body text */}
        {msg.content && (
          <p className="text-[14px] leading-relaxed break-words pr-14 text-[#e9edef]"
             style={{ whiteSpace: 'pre-wrap' }}>
            {msg.content}
          </p>
        )}

        {/* No text, show media placeholder label */}
        {!msg.content && !hasImage && !hasVideo && !hasAudio && msg.mediaType && (
          <div className="flex items-center gap-2 pr-14 text-[#8696a0] text-[13px]">
            {mediaIcon(msg.mediaType)}
            <span className="capitalize">{msg.mediaType.toLowerCase()}</span>
          </div>
        )}

        {/* Timestamp + read receipt */}
        <div className="absolute bottom-1 right-2 flex items-center gap-1">
          <span className="text-[10px] text-[#8696a0cc]">
            {fmtTime(msg.timestamp)}
          </span>
          {isOut && <CheckCheck size={14} className="text-[#53bdeb]" />}
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const WhatsApp = () => {
  const [chats, setChats]           = useState([]);
  const [messages, setMessages]     = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [bridgeStatus, setBridgeStatus] = useState('loading'); // loading | qr | ready | offline
  const [activeFilter, setActiveFilter] = useState('All');
  const [qrDataUrl, setQrDataUrl]   = useState(null);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);
  const qrBlobRef = useRef(null); // track object URLs to revoke them

  // ─── Bridge status check ─────────────────────────────────────────────────
  const checkBridge = useCallback(async () => {
    try {
      const res = await api.get('/api/whatsapp/bridge/status', { timeout: 5000 });
      const { authenticated, ready, hasQr } = res.data;
      if (ready) {
        setBridgeStatus('ready');
        setQrDataUrl(null);
      } else if (hasQr) {
        setBridgeStatus('qr');
      } else if (authenticated) {
        setBridgeStatus('loading'); // authenticated but not yet ready
      } else {
        setBridgeStatus('qr');
      }
    } catch {
      setBridgeStatus('offline');
    }
  }, []);

  // ─── Fetch QR as blob (so session cookie is sent via axios) ──────────────
  const fetchQr = useCallback(async () => {
    try {
      const res = await api.get('/api/whatsapp/bridge/qr', { responseType: 'blob', timeout: 8000 });
      if (res.status === 200 && res.data.size > 0) {
        if (qrBlobRef.current) URL.revokeObjectURL(qrBlobRef.current);
        const url = URL.createObjectURL(res.data);
        qrBlobRef.current = url;
        setQrDataUrl(url);
      }
    } catch {
      // QR not ready yet — ignore
    }
  }, []);

  // ─── Fetch chats ─────────────────────────────────────────────────────────
  const fetchChats = useCallback(async () => {
    try {
      const res = await api.get('/api/whatsapp/chats');
      setChats(res.data || []);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  // ─── Fetch messages for selected chat ────────────────────────────────────
  const fetchMessages = useCallback(async (chatId) => {
    if (!chatId) return;
    try {
      const encodedId = encodeURIComponent(chatId);
      const res = await api.get(`/api/whatsapp/chats/${encodedId}/messages`);
      setMessages(res.data || []);
    } catch {
      setMessages([]);
    }
  }, []);

  // ─── Polling ─────────────────────────────────────────────────────────────
  useEffect(() => {
    checkBridge();
    fetchChats();

    pollRef.current = setInterval(() => {
      checkBridge();
      fetchChats();
      if (selectedChat) fetchMessages(selectedChat.chatId);
    }, 5000);

    return () => clearInterval(pollRef.current);
  }, [checkBridge, fetchChats]);

  // Fetch QR whenever bridgeStatus becomes 'qr', and auto-refresh every 25s
  useEffect(() => {
    if (bridgeStatus !== 'qr') return;
    fetchQr();
    const qrTimer = setInterval(fetchQr, 25000);
    return () => {
      clearInterval(qrTimer);
      if (qrBlobRef.current) { URL.revokeObjectURL(qrBlobRef.current); qrBlobRef.current = null; }
    };
  }, [bridgeStatus, fetchQr]);

  useEffect(() => {
    if (selectedChat) fetchMessages(selectedChat.chatId);
  }, [selectedChat, fetchMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Filtered chats ───────────────────────────────────────────────────────
  const filteredChats = useMemo(() => {
    return chats.filter(c => {
      const matchSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
      if (activeFilter === 'Groups') return matchSearch && c.group;
      if (activeFilter === 'Unread') return matchSearch && c.unreadCount > 0;
      return matchSearch;
    });
  }, [chats, searchTerm, activeFilter]);

  // ─── Send message ─────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!newMessage.trim() || !selectedChat || sending) return;
    try {
      setSending(true);
      await api.post('/api/whatsapp/messages/send', {
        to: selectedChat.chatId,
        content: newMessage
      });
      setNewMessage('');
      fetchMessages(selectedChat.chatId);
    } catch (e) {
      console.error('Send failed:', e);
    } finally {
      setSending(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`h-full flex overflow-hidden rounded-xl shadow-2xl border ${T.border} ${T.bg} font-sans`}>

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <div className={`w-[340px] min-w-[340px] flex flex-col border-r ${T.border} ${T.sidebar}`}>

        {/* Header */}
        <div className={`h-[60px] px-4 flex items-center justify-between ${T.header}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#6a7175] flex items-center justify-center text-white">
              <User size={22} />
            </div>
            <h1 className="text-[#e9edef] font-bold text-lg">WhatsApp</h1>
          </div>
          <div className="flex items-center gap-2 text-[#aebac1]">
            {bridgeStatus !== 'ready' && (
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" title="Bridge connecting…" />
            )}
            {bridgeStatus === 'ready' && (
              <div className="w-2 h-2 rounded-full bg-[#00a884]" title="Connected" />
            )}
            <MoreVertical size={20} className="cursor-pointer hover:text-white" />
          </div>
        </div>

        {/* Search */}
        <div className="p-2 pt-3">
          <div className="bg-[#202c33] rounded-lg flex items-center px-3 gap-3">
            <Search size={16} className="text-[#8696a0]" />
            <input
              type="text"
              placeholder="Search or start new chat"
              className="bg-transparent border-none outline-none text-sm py-2 w-full text-[#e9edef] placeholder:text-[#8696a0]"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Filter chips */}
        <div className="px-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {['All', 'Unread', 'Groups'].map(f => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={`px-4 py-1 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors
                ${activeFilter === f ? 'bg-[#00a884] text-[#111b21]' : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Special rows */}
        <div className={`px-4 py-3 flex items-center gap-4 hover:bg-[#202c33] cursor-pointer`}>
          <ShieldCheck size={20} className="text-[#00a884]" />
          <span className="text-[15px] text-[#e9edef]">Locked chats</span>
        </div>
        <div className={`px-4 py-3 flex items-center gap-4 hover:bg-[#202c33] cursor-pointer border-b ${T.border}`}>
          <Globe size={18} className="text-[#8696a0]" />
          <span className="text-[15px] text-[#e9edef]">Archived</span>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center items-center p-8">
              <Loader2 size={24} className="animate-spin text-[#00a884]" />
            </div>
          )}
          {!loading && filteredChats.length === 0 && bridgeStatus === 'ready' && (
            <p className="text-center text-[#8696a0] text-sm p-8">No conversations found</p>
          )}
          {filteredChats.map(chat => (
            <div key={chat.chatId}
              onClick={() => setSelectedChat(chat)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b ${T.border}
                hover:bg-[#202c33] transition-colors
                ${selectedChat?.chatId === chat.chatId ? 'bg-[#2a3942]' : ''}`}>
              <Avatar chat={chat} size={12} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                  <h3 className="text-[15px] font-normal text-[#e9edef] truncate">{chat.name}</h3>
                  <span className="text-[11px] text-[#8696a0] ml-2 flex-shrink-0">{fmtTime(chat.lastMessageTimestamp)}</span>
                </div>
                <div className="flex items-center gap-1 min-w-0">
                  {chat.lastMessage?.startsWith('📎') && (
                    <Paperclip size={12} className="text-[#8696a0] flex-shrink-0" />
                  )}
                  <p className="text-[13px] truncate text-[#8696a0]">{chat.lastMessage || ''}</p>
                  {chat.unreadCount > 0 && (
                    <span className="ml-auto flex-shrink-0 bg-[#00a884] text-[#111b21] text-[11px] font-bold
                      rounded-full w-5 h-5 flex items-center justify-center">
                      {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col relative bg-[#0b141a]">

        {/* Wallpaper doodle */}
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: 'url("https://w0.peakpx.com/wallpaper/818/148/HD-wallpaper-whatsapp-dark-background-whatsapp-doodle-patterns-thumbnail.jpg")', backgroundSize: '400px' }} />

        {bridgeStatus !== 'ready' && !selectedChat ? (
          <QrOverlay bridgeStatus={bridgeStatus} qrDataUrl={qrDataUrl} onRefresh={() => { checkBridge(); fetchQr(); }} />
        ) : selectedChat ? (
          <>
            {/* Chat header */}
            <div className={`h-[60px] px-4 flex items-center justify-between z-10 ${T.header} border-b ${T.border}`}>
              <div className="flex items-center gap-3 cursor-pointer">
                <Avatar chat={selectedChat} size={10} />
                <div>
                  <h2 className="text-[15px] font-medium text-[#e9edef]">{selectedChat.name}</h2>
                  <p className="text-[12px] text-[#8696a0]">
                    {selectedChat.group ? 'Group' : 'Click for contact info'}
                  </p>
                </div>
              </div>
              <div className="flex gap-5 text-[#aebac1]">
                <Search size={20} className="hover:text-white cursor-pointer" />
                <Phone size={20} className="hover:text-white cursor-pointer" />
                <Info size={20} className="hover:text-white cursor-pointer" />
                <MoreVertical size={20} className="hover:text-white cursor-pointer" />
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-12 py-4 z-10 flex flex-col">
              {messages.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-[#8696a0] text-sm">No messages yet</p>
                </div>
              )}
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-2 flex items-center gap-3 z-10 bg-[#202c33]">
              <Smile size={24} className="text-[#8696a0] cursor-pointer hover:text-white flex-shrink-0" />
              <Paperclip size={24} className="text-[#8696a0] cursor-pointer hover:text-white flex-shrink-0 -rotate-45" />
              <input
                type="text"
                placeholder="Type a message"
                className="flex-1 bg-[#2a3942] rounded-lg px-4 py-2.5 text-sm text-[#e9edef]
                  placeholder:text-[#8696a0] border-none outline-none"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                disabled={sending}
              />
              {newMessage.trim() ? (
                <Send size={24} className="text-[#00a884] cursor-pointer flex-shrink-0"
                  onClick={handleSend} />
              ) : (
                <Mic size={24} className="text-[#8696a0] cursor-pointer hover:text-white flex-shrink-0" />
              )}
            </div>
          </>
        ) : (
          /* Empty state — bridge is ready but no chat selected */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-12">
            <Globe size={120} className="text-[#202c33]" />
            <div>
              <h2 className="text-3xl font-light text-[#e9edef] mb-2">WhatsApp Web</h2>
              <p className="text-sm text-[#8696a0] max-w-sm">
                Send and receive messages without keeping your phone online.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#8696a0] mt-6">
              <ShieldCheck size={14} /><span>End-to-end encrypted</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsApp;
