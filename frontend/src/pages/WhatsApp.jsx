import React, {
  useState, useEffect, useMemo, useRef, useCallback,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, MoreVertical, Send, Paperclip, Smile, Mic,
  CheckCheck, ShieldCheck, Globe, Loader2, X, RefreshCw,
  Image as ImageIcon, FileText, Volume2, Video, Phone, Edit3,
  MessageSquare, Users, CircleDot, Star, ArrowLeft, Camera,
} from 'lucide-react';
import { api } from '../api/axios';

/* ─── Exact WhatsApp Web Dark Colors ─────────────────────────────────────── */
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
  textPri:   '#e9edef',
  textSec:   '#8696a0',
  green:     '#00a884',
  blue:      '#53bdeb',
  iconActive:'#e9edef',
};

/* ─── Avatar fallback colors ─────────────────────────────────────────────── */
const BG = ['#00a884','#128c7e','#dfa62f','#3b82f6','#9333ea','#ef4444','#f97316','#0ea5e9'];
const avatarBg = (id = '') => BG[id.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % BG.length];

/* ─── Formatters ─────────────────────────────────────────────────────────── */
const fmtTime = ts => {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hour12:false });
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return d.toLocaleDateString([], { weekday:'short' });
  return d.toLocaleDateString([], { day:'2-digit', month:'2-digit', year:'2-digit' });
};

const fmtDateLabel = ts => {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { day:'numeric', month:'long', year:'numeric' });
};

const mediaIcon = type => {
  if (!type) return null;
  const t = type.toUpperCase();
  if (t === 'IMAGE' || t === 'STICKER') return <ImageIcon size={14}/>;
  if (t === 'VIDEO')  return <Video size={14}/>;
  if (t === 'AUDIO' || t === 'PTT') return <Volume2 size={14}/>;
  return <FileText size={14}/>;
};

/* ─── Avatar ──────────────────────────────────────────────────────────────── */
const Avatar = ({ src, name='?', id='', size=40 }) => {
  const [err, setErr] = useState(false);
  if (src && !err) return (
    <img src={src} alt={name} onError={()=>setErr(true)} style={{
      width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0, display:'block',
    }}/>
  );
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background: avatarBg(id||name), display:'flex',
      alignItems:'center', justifyContent:'center',
      fontWeight:700, fontSize:size*0.43, color:'#fff', userSelect:'none',
    }}>
      {(name||'?')[0].toUpperCase()}
    </div>
  );
};

/* ─── Small icon button ───────────────────────────────────────────────────── */
const IconBtn = ({ icon, title, onClick }) => (
  <button onClick={onClick} title={title} style={{
    background:'none', border:'none', cursor:'pointer',
    color: C.textSec, padding:8, borderRadius:'50%', display:'flex',
    alignItems:'center', justifyContent:'center',
    transition:'color .15s',
  }}
    onMouseEnter={e=>e.currentTarget.style.color=C.iconActive}
    onMouseLeave={e=>e.currentTarget.style.color=C.textSec}
  >{icon}</button>
);

/* ─── QR / Bridge Overlay ────────────────────────────────────────────────── */
const BridgeOverlay = ({ status, qrUrl, onRetry, onRefreshQr }) => (
  <div style={{
    flex:1, display:'flex', flexDirection:'column',
    alignItems:'center', justifyContent:'center',
    background:C.bg, gap:24, position:'relative', zIndex:1,
  }}>
    <div style={{ textAlign:'center' }}>
      <h2 style={{ color:C.textPri, fontSize:22, fontWeight:300, margin:'0 0 8px' }}>Link your WhatsApp</h2>
      <p style={{ color:C.textSec, fontSize:13, margin:0, maxWidth:320, lineHeight:1.7 }}>
        Scan this QR code with WhatsApp on your phone to mirror all your conversations.
      </p>
    </div>

    {status === 'loading' && (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
        <Loader2 size={48} color={C.green} style={{ animation:'spin 1s linear infinite' }}/>
        <p style={{ color:C.textSec, fontSize:13, margin:0 }}>Starting WhatsApp bridge…</p>
      </div>
    )}

    {status === 'qr' && (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:18 }}>
        <div style={{ background:'#fff', padding:20, borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,.5)' }}>
          {qrUrl
            ? <img src={qrUrl} alt="QR" style={{ width:264, height:264, display:'block' }}/>
            : <div style={{ width:264, height:264, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Loader2 size={40} color={C.green} style={{ animation:'spin 1s linear infinite' }}/>
              </div>
          }
        </div>
        <ol style={{ color:C.textSec, fontSize:13, lineHeight:2.2, paddingLeft:20, maxWidth:280, margin:0 }}>
          <li>Open WhatsApp on your phone</li>
          <li>Go to <strong style={{ color:C.textPri }}>Settings → Linked Devices</strong></li>
          <li>Tap <strong style={{ color:C.textPri }}>Link a Device</strong></li>
          <li>Scan the QR code above</li>
        </ol>
        <button onClick={onRefreshQr} style={{
          background:'none', border:'none', color:C.green,
          fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6,
        }}>
          <RefreshCw size={13}/> Refresh QR
        </button>
      </div>
    )}

    {status === 'offline' && (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
        <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(239,68,68,.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <X size={28} color="#ef4444"/>
        </div>
        <p style={{ color:C.textSec, fontSize:13, textAlign:'center', margin:0 }}>
          WhatsApp bridge is offline.<br/>
          Make sure the <code style={{ color:C.green }}>whatsapp-bridge</code> container is running.
        </p>
        <button onClick={onRetry} style={{
          background:C.green, border:'none', color:'#111b21',
          padding:'8px 22px', borderRadius:20, fontSize:13, fontWeight:600,
          cursor:'pointer', display:'flex', alignItems:'center', gap:6,
        }}>
          <RefreshCw size={13}/> Retry
        </button>
      </div>
    )}
  </div>
);

/* ─── Message Bubble ──────────────────────────────────────────────────────── */
const Bubble = ({ msg }) => {
  const out = msg.direction === 'OUTGOING';
  const hasImg   = msg.mediaBase64 && (msg.mediaType === 'IMAGE' || msg.mediaType === 'STICKER');
  const hasVideo = msg.mediaBase64 && msg.mediaType === 'VIDEO';
  const hasAudio = msg.mediaBase64 && (msg.mediaType === 'AUDIO' || msg.mediaType === 'PTT');
  const mediaSrc = msg.mediaBase64 && msg.mediaMimetype
    ? `data:${msg.mediaMimetype};base64,${msg.mediaBase64}` : null;

  return (
    <div style={{ display:'flex', justifyContent: out ? 'flex-end' : 'flex-start', marginBottom:2, padding:'0 60px' }}>
      <div style={{
        maxWidth:'65%', background: out ? C.bubbleOut : C.bubbleIn,
        borderRadius: out ? '8px 0 8px 8px' : '0 8px 8px 8px',
        padding:'6px 9px 8px', boxShadow:'0 1px 2px rgba(0,0,0,.3)', position:'relative',
      }}>
        {/* Group author */}
        {!out && msg.authorName && (
          <p style={{ fontSize:12.5, fontWeight:700, color:C.green, margin:'0 0 2px' }}>{msg.authorName}</p>
        )}
        {/* Quoted */}
        {msg.repliedToContent && (
          <div style={{ marginBottom:6, borderRadius:6, overflow:'hidden', borderLeft:`4px solid ${C.green}`, background:'rgba(0,0,0,.22)' }}>
            <div style={{ padding:'4px 8px' }}>
              <p style={{ fontSize:11, fontWeight:700, color:C.green, margin:0 }}>{out ? 'You' : (msg.senderName||msg.senderId)}</p>
              <p style={{ fontSize:12, color:C.textSec, margin:0, fontStyle:'italic' }}>{msg.repliedToContent}</p>
            </div>
          </div>
        )}
        {hasImg && mediaSrc && (
          <div style={{ margin:'-6px -9px 6px', overflow:'hidden', borderRadius: out ? '8px 0 0 0' : '0 8px 0 0' }}>
            <img src={mediaSrc} alt="media" style={{ maxHeight:320, width:'100%', objectFit:'cover', display:'block' }}/>
          </div>
        )}
        {hasVideo && mediaSrc && (
          <div style={{ margin:'-6px -9px 6px', overflow:'hidden' }}>
            <video src={mediaSrc} controls style={{ maxHeight:280, width:'100%', display:'block' }}/>
          </div>
        )}
        {hasAudio && mediaSrc && (
          <div style={{ marginBottom:6 }}>
            <audio src={mediaSrc} controls style={{ height:36, width:'100%' }}/>
          </div>
        )}
        {msg.content && (
          <p style={{ fontSize:14.2, color:C.textPri, margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word', paddingRight:52, lineHeight:1.45 }}>
            {msg.content}
          </p>
        )}
        {!msg.content && !hasImg && !hasVideo && !hasAudio && msg.mediaType && (
          <div style={{ display:'flex', alignItems:'center', gap:6, color:C.textSec, fontSize:13, paddingRight:52 }}>
            {mediaIcon(msg.mediaType)} <span style={{ textTransform:'capitalize' }}>{msg.mediaType.toLowerCase()}</span>
          </div>
        )}
        {/* Time + tick */}
        <div style={{ position:'absolute', bottom:5, right:8, display:'flex', alignItems:'center', gap:3 }}>
          <span style={{ fontSize:11, color:'rgba(134,150,160,.9)', whiteSpace:'nowrap' }}>{fmtTime(msg.timestamp)}</span>
          {out && <CheckCheck size={15} color={C.blue}/>}
        </div>
      </div>
    </div>
  );
};

/* ─── Date Divider ────────────────────────────────────────────────────────── */
const DateDivider = ({ label }) => (
  <div style={{ display:'flex', justifyContent:'center', margin:'10px 0 6px' }}>
    <span style={{ background:C.header, color:C.textSec, borderRadius:8, padding:'4px 12px', fontSize:12, boxShadow:'0 1px 2px rgba(0,0,0,.3)' }}>
      {label}
    </span>
  </div>
);

/* ─── Chat Row ────────────────────────────────────────────────────────────── */
const ChatRow = ({ chat, isSelected, onClick }) => (
  <div onClick={onClick} style={{
    display:'flex', alignItems:'center', gap:13,
    padding:'10px 16px', cursor:'pointer',
    borderBottom:`1px solid ${C.divider}`,
    background: isSelected ? C.selected : 'transparent',
    transition:'background .1s',
  }}
    onMouseEnter={e=>{ if(!isSelected) e.currentTarget.style.background = C.hover; }}
    onMouseLeave={e=>{ if(!isSelected) e.currentTarget.style.background = 'transparent'; }}
  >
    <Avatar src={chat.avatarUrl} name={chat.name} id={chat.chatId} size={49}/>
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:3 }}>
        <span style={{ color:C.textPri, fontSize:16, fontWeight:400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'calc(100% - 60px)' }}>
          {chat.name}
        </span>
        <span style={{ color: chat.unreadCount>0 ? C.green : C.textSec, fontSize:12, flexShrink:0 }}>
          {fmtTime(chat.lastMessageTimestamp)}
        </span>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ color:C.textSec, fontSize:13.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'calc(100% - 30px)' }}>
          {chat.lastMessage || ''}
        </span>
        {chat.unreadCount > 0 && (
          <span style={{ background:C.green, color:'#111b21', fontSize:11, fontWeight:700, borderRadius:'50%', minWidth:20, height:20, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px', flexShrink:0 }}>
            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
          </span>
        )}
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
const WhatsApp = () => {
  const navigate = useNavigate();
  const [chats, setChats]               = useState([]);
  const [messages, setMessages]         = useState([]);
  const [selected, setSelected]         = useState(null);
  const [search, setSearch]             = useState('');
  const [newMsg, setNewMsg]             = useState('');
  const [sending, setSending]           = useState(false);
  const [loading, setLoading]           = useState(true);
  const [bridgeStatus, setBridgeStatus] = useState('loading');
  const [filter, setFilter]             = useState('All');
  const [qrUrl, setQrUrl]               = useState(null);

  const endRef     = useRef(null);
  const pollRef    = useRef(null);
  const msgPollRef = useRef(null);
  const qrBlobRef  = useRef(null);

  const checkBridge = useCallback(async () => {
    try {
      const r = await api.get('/api/whatsapp/bridge/status', { timeout:5000 });
      const { authenticated, ready, hasQr } = r.data;
      if      (ready)         { setBridgeStatus('ready'); setQrUrl(null); }
      else if (hasQr)         setBridgeStatus('qr');
      else if (authenticated) setBridgeStatus('loading');
      else                    setBridgeStatus('qr');
    } catch { setBridgeStatus('offline'); }
  }, []);

  const fetchQr = useCallback(async () => {
    try {
      const r = await api.get('/api/whatsapp/bridge/qr', { responseType:'blob', timeout:8000 });
      if (r.status === 200 && r.data.size > 0) {
        if (qrBlobRef.current) URL.revokeObjectURL(qrBlobRef.current);
        const url = URL.createObjectURL(r.data);
        qrBlobRef.current = url; setQrUrl(url);
      }
    } catch { /* not ready */ }
  }, []);

  const fetchChats = useCallback(async () => {
    try {
      const r = await api.get('/api/whatsapp/chats');
      setChats(r.data || []); setLoading(false);
    } catch { setLoading(false); }
  }, []);

  const fetchMessages = useCallback(async (chatId) => {
    if (!chatId) return;
    try {
      const r = await api.get(`/api/whatsapp/chats/${encodeURIComponent(chatId)}/messages`);
      setMessages(r.data || []);
    } catch { setMessages([]); }
  }, []);

  // Initial poll
  useEffect(() => {
    checkBridge(); fetchChats();
    pollRef.current = setInterval(() => { checkBridge(); fetchChats(); }, 5000);
    return () => clearInterval(pollRef.current);
  }, [checkBridge, fetchChats]);

  // QR refresh
  useEffect(() => {
    if (bridgeStatus !== 'qr') return;
    fetchQr();
    const t = setInterval(fetchQr, 25000);
    return () => {
      clearInterval(t);
      if (qrBlobRef.current) { URL.revokeObjectURL(qrBlobRef.current); qrBlobRef.current = null; }
    };
  }, [bridgeStatus, fetchQr]);

  // Message polling for selected chat
  useEffect(() => {
    clearInterval(msgPollRef.current);
    if (!selected) { setMessages([]); return; }
    fetchMessages(selected.chatId);
    msgPollRef.current = setInterval(() => fetchMessages(selected.chatId), 5000);
    return () => clearInterval(msgPollRef.current);
  }, [selected, fetchMessages]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  const visibleChats = useMemo(() => chats.filter(c => {
    const m = (c.name||'').toLowerCase().includes(search.toLowerCase());
    if (filter==='Unread')    return m && c.unreadCount > 0;
    if (filter==='Favorites') return m && c.favorite;
    if (filter==='Groups')    return m && c.group;
    return m;
  }), [chats, search, filter]);

  const msgItems = useMemo(() => {
    const out = []; let lastDate = '';
    messages.forEach(msg => {
      const day = msg.timestamp ? new Date(msg.timestamp).toDateString() : '';
      if (day !== lastDate) {
        out.push({ kind:'divider', label: fmtDateLabel(msg.timestamp), key:`d-${day}` });
        lastDate = day;
      }
      out.push({ kind:'msg', msg });
    });
    return out;
  }, [messages]);

  const handleSend = async () => {
    if (!newMsg.trim() || !selected || sending) return;
    try {
      setSending(true);
      await api.post('/api/whatsapp/messages/send', { to: selected.chatId, content: newMsg });
      setNewMsg('');
      fetchMessages(selected.chatId);
    } catch(e) { console.error('Send failed', e); }
    finally { setSending(false); }
  };

  const showOverlay = bridgeStatus !== 'ready';

  /* ── RENDER ─────────────────────────────────────────────────────────────── */
  return (
    <div style={{
      display:'flex', width:'100vw', height:'100vh', overflow:'hidden',
      background:C.bg,
      fontFamily:"'Segoe UI', Helvetica, Arial, sans-serif",
    }}>

      {/* ── THIN LEFT STRIP (WhatsApp Web style) ──────────────────────────── */}
      <div style={{
        width:60, background:'#182229', display:'flex', flexDirection:'column',
        alignItems:'center', padding:'0', flexShrink:0,
        borderRight:`1px solid ${C.divider}`,
      }}>
        {/* Top: Go back to app dashboard */}
        <button onClick={()=>navigate('/dashboard')} title="Back to Dashboard" style={{
          background:'none', border:'none', cursor:'pointer',
          color:C.textSec, padding:'16px 0 8px', display:'flex', flexDirection:'column',
          alignItems:'center', gap:2, width:'100%',
        }}
          onMouseEnter={e=>e.currentTarget.style.color=C.textPri}
          onMouseLeave={e=>e.currentTarget.style.color=C.textSec}
        >
          <ArrowLeft size={20}/>
        </button>

        {/* Spacer */}
        <div style={{ flex:1 }}/>

        {/* Bottom icons (WA Web style) */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, paddingBottom:16 }}>
          <IconBtn icon={<CircleDot size={22}/>} title="Status"/>
          <IconBtn icon={<Users size={22}/>} title="Communities"/>
          <IconBtn icon={<MessageSquare size={22}/>} title="Chats"/>
          {/* Bridge status indicator */}
          <div style={{
            width:8, height:8, borderRadius:'50%', margin:'6px auto 0',
            background: bridgeStatus==='ready' ? C.green : bridgeStatus==='offline' ? '#ef4444' : '#facc15',
            boxShadow: bridgeStatus==='ready' ? `0 0 6px ${C.green}` : 'none',
          }} title={`Bridge: ${bridgeStatus}`}/>
        </div>
      </div>

      {/* ── CHAT LIST PANEL ───────────────────────────────────────────────── */}
      <div style={{
        width:370, minWidth:370, display:'flex', flexDirection:'column',
        background:C.panel, borderRight:`1px solid ${C.divider}`,
      }}>
        {/* Header */}
        <div style={{ height:60, background:C.header, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {/* User's own avatar placeholder */}
            <div style={{ width:40, height:40, borderRadius:'50%', background:'#3c4a50', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Camera size={18} color={C.textSec}/>
            </div>
          </div>
          <span style={{ color:C.textPri, fontWeight:700, fontSize:19, flex:1, paddingLeft:12 }}>WhatsApp</span>
          <div style={{ display:'flex', alignItems:'center', gap:2 }}>
            <IconBtn icon={<Edit3 size={20}/>} title="New chat"/>
            <IconBtn icon={<MoreVertical size={20}/>} title="Menu"/>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding:'8px 12px 4px', flexShrink:0 }}>
          <div style={{ background:C.inputBg, borderRadius:9, display:'flex', alignItems:'center', padding:'0 12px', gap:10 }}>
            <Search size={16} color={C.textSec}/>
            <input
              value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search or start new chat"
              style={{ background:'none', border:'none', outline:'none', fontSize:14, color:C.textPri, padding:'10px 0', width:'100%' }}
            />
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display:'flex', gap:6, padding:'4px 12px 8px', overflowX:'auto', flexShrink:0 }}>
          {['All','Unread','Favorites','Groups'].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{
              border:'none', borderRadius:16, padding:'5px 14px',
              fontSize:13, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap',
              background: filter===f ? C.green : C.inputBg,
              color: filter===f ? '#111b21' : C.textSec,
            }}>{f}</button>
          ))}
        </div>

        {/* Locked / Archived */}
        <SpecialRow icon={<ShieldCheck size={20} color={C.green}/>} label="Locked chats"/>
        <SpecialRow icon={<Globe size={18} color={C.textSec}/>} label="Archived" border/>

        {/* Chat items */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading && (
            <div style={{ display:'flex', justifyContent:'center', padding:32 }}>
              <Loader2 size={24} color={C.green} style={{ animation:'spin 1s linear infinite' }}/>
            </div>
          )}
          {!loading && visibleChats.length===0 && bridgeStatus==='ready' && (
            <p style={{ textAlign:'center', color:C.textSec, fontSize:14, padding:32 }}>No conversations found</p>
          )}
          {visibleChats.map(chat=>(
            <ChatRow key={chat.chatId} chat={chat} isSelected={selected?.chatId===chat.chatId} onClick={()=>setSelected(chat)}/>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL ───────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', background:C.bg, position:'relative', overflow:'hidden' }}>
        {/* Wallpaper */}
        <div style={{
          position:'absolute', inset:0, opacity:.065, pointerEvents:'none',
          backgroundImage:'url("https://w0.peakpx.com/wallpaper/818/148/HD-wallpaper-whatsapp-dark-background-whatsapp-doodle-patterns-thumbnail.jpg")',
          backgroundSize:'400px',
        }}/>

        {showOverlay ? (
          <BridgeOverlay status={bridgeStatus} qrUrl={qrUrl} onRetry={checkBridge} onRefreshQr={()=>{checkBridge();fetchQr();}}/>
        ) : selected ? (
          <>
            {/* Chat header */}
            <div style={{
              height:60, background:C.header, flexShrink:0, position:'relative', zIndex:10,
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'0 16px', borderBottom:`1px solid ${C.divider}`,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}>
                <Avatar src={selected.avatarUrl} name={selected.name} id={selected.chatId} size={40}/>
                <div>
                  <p style={{ color:C.textPri, fontSize:16, fontWeight:500, margin:0 }}>{selected.name}</p>
                  <p style={{ color:C.textSec, fontSize:12, margin:0 }}>{selected.group ? 'Group' : 'click here for contact info'}</p>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center' }}>
                {[Video, Phone, Search, MoreVertical].map((Icon,i)=>(
                  <IconBtn key={i} icon={<Icon size={20}/>}/>
                ))}
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'8px 0', position:'relative', zIndex:1 }}>
              {messages.length===0
                ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
                    <div style={{ background:C.header, color:C.textSec, borderRadius:8, padding:'6px 16px', fontSize:13 }}>
                      No messages yet
                    </div>
                  </div>
                : msgItems.map((item,i) =>
                    item.kind==='divider'
                      ? <DateDivider key={item.key} label={item.label}/>
                      : <Bubble key={item.msg.id||i} msg={item.msg}/>
                  )
              }
              <div ref={endRef}/>
            </div>

            {/* Input */}
            <div style={{
              display:'flex', alignItems:'center', gap:8, padding:'6px 16px',
              background:C.header, borderTop:`1px solid ${C.divider}`,
              flexShrink:0, zIndex:10, position:'relative',
            }}>
              <IconBtn icon={<Smile size={24}/>}/>
              <IconBtn icon={<Paperclip size={24} style={{ transform:'rotate(-45deg)' }}/>}/>
              <div style={{ flex:1, background:C.inputBg, borderRadius:9, padding:'0 16px' }}>
                <input
                  value={newMsg} onChange={e=>setNewMsg(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&handleSend()}
                  placeholder="Type a message" disabled={sending}
                  style={{ background:'none', border:'none', outline:'none', width:'100%', fontSize:15, color:C.textPri, padding:'10px 0' }}
                />
              </div>
              <IconBtn
                icon={newMsg.trim() ? <Send size={24} color={C.green}/> : <Mic size={24}/>}
                onClick={newMsg.trim() ? handleSend : undefined}
              />
            </div>
          </>
        ) : (
          /* No chat selected — empty state */
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:24, padding:48, position:'relative', zIndex:1, textAlign:'center' }}>
            <div style={{ width:220, height:220, borderRadius:'50%', background:'rgba(134,150,160,.07)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Globe size={120} color="rgba(134,150,160,.12)"/>
            </div>
            <div>
              <h2 style={{ color:C.textPri, fontSize:34, fontWeight:300, margin:'0 0 12px' }}>WhatsApp Web</h2>
              <p style={{ color:C.textSec, fontSize:14, maxWidth:400, margin:'0 auto', lineHeight:1.7 }}>
                Send and receive messages without keeping your phone online.<br/>
                Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
              </p>
            </div>
            <div style={{ width:'55%', height:1, background:C.divider }}/>
            <div style={{ display:'flex', alignItems:'center', gap:8, color:C.textSec, fontSize:13 }}>
              <ShieldCheck size={15}/>
              <span>Your personal messages are end-to-end encrypted</span>
            </div>
          </div>
        )}
      </div>

      {/* CSS */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(134,150,160,.25); border-radius:3px; }
        ::-webkit-scrollbar-thumb:hover { background:rgba(134,150,160,.45); }
      `}</style>
    </div>
  );
};

/* ─── Sub-components ──────────────────────────────────────────────────────── */
const SpecialRow = ({ icon, label, border }) => (
  <div style={{
    display:'flex', alignItems:'center', gap:16, padding:'12px 20px', cursor:'pointer',
    borderBottom: border ? `1px solid ${C.divider}` : 'none', flexShrink:0,
  }}
    onMouseEnter={e=>e.currentTarget.style.background=C.hover}
    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
  >
    {icon}
    <span style={{ color:C.textPri, fontSize:15 }}>{label}</span>
  </div>
);

export default WhatsApp;
