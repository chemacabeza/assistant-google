import React, { useState, useEffect, useMemo } from 'react';
import { 
  MessageCircle, Loader2, Send, ShieldCheck, Terminal, HelpCircle, 
  X, ChevronRight, Globe, Search, MoreVertical, CheckCheck, 
  Paperclip, Smile, Mic, User, Phone, Info
} from 'lucide-react';
import { api } from '../api/axios';

/**
 * WhatsApp.jsx - High-Fidelity WhatsApp Web Replica
 * Implements a 2-column layout with dark mode aesthetics.
 */
const NAME_MAPPING = {
  "33652846353": "Moi"
};

const WhatsApp = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedContactId, setSelectedContactId] = useState(null);

  // Sync Messages
  const fetchMessages = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/api/whatsapp/messages');
      setMessages(response.data);
      
      // Select the first contact if none selected
      if (!selectedContactId && response.data.length > 0) {
        const firstContact = [...new Set(response.data.map(m => m.senderId))][0];
        setSelectedContactId(firstContact);
      }
    } catch (err) {
      console.error("Failed to fetch WhatsApp messages:", err);
      if (err.response?.status === 401) {
        setError("Session expired. Please log in again.");
      } else {
        setError("Connection failed. Check your setup.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, []);

  const contacts = useMemo(() => {
    const groups = {};
    
    messages.forEach(msg => {
      const isOutgoing = msg.direction === 'OUTGOING';
      let partnerId = (isOutgoing ? msg.recipientId : msg.senderId)?.trim();
      
      if (!partnerId) return;

      if (!groups[partnerId]) {
        groups[partnerId] = {
           id: partnerId,
           name: isOutgoing ? (NAME_MAPPING[partnerId] || partnerId) : (msg.senderName || partnerId),
           timestamp: msg.timestamp,
           lastMessage: msg.content
        };
      }
      
      if (new Date(msg.timestamp) > new Date(groups[partnerId].timestamp)) {
         groups[partnerId].timestamp = msg.timestamp;
         groups[partnerId].lastMessage = msg.content;
      }
    });

    return Object.values(groups).filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.id.includes(searchTerm)
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [messages, searchTerm]);

  // Compute Active Conversation
  const activeConversation = useMemo(() => {
    return messages
      .filter(m => (m.direction === 'OUTGOING' ? m.recipientId : m.senderId) === selectedContactId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [messages, selectedContactId]);

  const activeContact = contacts.find(c => c.id === selectedContactId);

  // Layout Styles - Official WhatsApp Dark Charcoal Theme
  const themes = {
    bg: "bg-[#0b141a]",
    sidebar: "bg-[#111b21]",
    header: "bg-[#202c33]",
    activeHeader: "bg-[#202c33]",
    bubbleIn: "bg-[#202c33]",
    bubbleOut: "bg-[#005c4b]",
    textP: "text-[#e9edef]",
    textS: "text-[#8696a0]",
    accent: "text-[#00a884]",
    border: "border-[#222d34]"
  };

  return (
    <div className={`h-full flex overflow-hidden rounded-xl shadow-2xl border ${themes.border} ${themes.bg} font-sans selection:bg-[#00a88444]`}>
      
      {/* 1. LEFT SIDEBAR: Contact List */}
      <div className={`w-[25%] min-w-[340px] flex flex-col border-r ${themes.border} ${themes.sidebar}`}>
        
        {/* Sidebar Header: Mirroring Official Branding */}
        <div className={`h-[60px] px-4 flex items-center justify-between ${themes.header}`}>
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-[#6a7175] flex items-center justify-center text-white overflow-hidden">
                <User size={26} className="mt-1" />
             </div>
             <h1 className="text-[#e9edef] font-bold text-lg tracking-tight">WhatsApp</h1>
          </div>
          <div className="flex gap-5 text-[#aebac1]">
            <div className="relative cursor-pointer hover:bg-white/5 p-2 rounded-full transition-colors">
               <span className="text-xl">+</span>
            </div>
            <MoreVertical size={20} className="cursor-pointer hover:text-white" />
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-2 pt-3">
          <div className="bg-[#202c33] rounded-lg flex items-center px-3 gap-3">
             <Search size={16} className={`text-[#8696a0]`} />
             <input 
               type="text" 
               placeholder="Search or start new chat"
               className="bg-transparent border-none outline-none text-sm py-1.5 w-full text-[#e9edef] placeholder:text-[#8696a0] font-light"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>
        </div>

        {/* Filter Chips - Mirroring exactly */}
        <div className="px-4 pb-2.5 pt-1.5 flex gap-2 overflow-x-auto no-scrollbar">
            {["All", "Unread", "Favorites", "Groups", "Gentuza"].map(filter => (
                <button 
                  key={filter}
                  className={`px-4 py-1 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap ${filter === 'All' ? 'bg-[#00a884] text-[#111b21]' : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'}`}
                >
                    {filter}
                </button>
            ))}
        </div>

        {/* Contact List Scroll Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar-dark">
          
          <div className="px-4 py-3.5 flex items-center gap-4 hover:bg-[#202c33] cursor-pointer group transition-colors">
             <div className="text-[#00a884] w-5 h-5 flex items-center justify-center">
                <ShieldCheck size={20} />
             </div>
             <span className="text-[15px] font-normal text-[#e9edef]">Locked chats</span>
          </div>
          <div className="px-4 py-3.5 flex items-center gap-4 hover:bg-[#202c33] cursor-pointer group transition-colors border-b border-[#222d34]">
             <div className="text-[#8696a0] w-5 h-5 flex items-center justify-center">
                <Globe size={18} />
             </div>
             <span className="text-[15px] font-normal text-[#e9edef]">Archived</span>
          </div>

          {contacts.map((contact, idx) => {
            const colors = ['bg-[#00a884]', 'bg-[#dfa62f]', 'bg-[#128c7e]', 'bg-[#075e54]', 'bg-[#3b82f6]', 'bg-[#9333ea]'];
            const avatarColor = colors[idx % colors.length];

            return (
              <div 
                key={contact.id}
                onClick={() => setSelectedContactId(contact.id)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#202c33] transition-colors border-b ${themes.border} ${selectedContactId === contact.id ? 'bg-[#2a3942]' : ''}`}
              >
                <div className={`w-12 h-12 rounded-full ${avatarColor} flex items-center justify-center flex-shrink-0 relative`}>
                  <span className="text-white font-bold text-lg">{contact.name[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <h3 className={`text-[15px] font-normal truncate ${themes.textP}`}>{contact.name}</h3>
                    <span className={`text-[11px] ${themes.textS}`}>
                      {new Date(contact.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    {contact.id.includes('group') ? <p className="text-[11px] text-[#8696a0cc] font-bold">~ Robe:</p> : null}
                    <p className={`text-[13px] truncate ${themes.textS} font-light`}>{contact.lastMessage}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. MAIN PANEL: Active Conversation */}
      <div className="flex-1 flex flex-col relative bg-[#0b141a]">
        
        {/* official wallpaper doodle pattern */}
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{backgroundImage: 'url("https://w0.peakpx.com/wallpaper/818/148/HD-wallpaper-whatsapp-dark-background-whatsapp-doodle-patterns-thumbnail.jpg")', backgroundSize: '400px'}}></div>

        {selectedContactId ? (
          <>
            {/* Chat Header */}
            <div className={`h-[60px] px-4 flex items-center justify-between z-10 ${themes.activeHeader} border-b ${themes.border}`}>
              <div className="flex items-center gap-3 cursor-pointer">
                <div className={`w-10 h-10 rounded-full bg-[#6a7175] flex items-center justify-center overflow-hidden`}>
                   {selectedContactId === 'jlh_002' ? 
                     <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=64&q=80" alt="Avatar" className="w-full h-full object-cover" /> :
                     <User size={20} className="text-white" />
                   }
                </div>
                <div>
                   <h2 className={`text-[15px] font-medium ${themes.textP}`}>{activeContact?.name}</h2>
                   <p className="text-[12px] text-[#8696a0cc] font-light">{getSubtext()}</p>
                </div>
              </div>
              <div className="flex gap-6 text-[#aebac1]">
                 <Search size={22} className="hover:text-white cursor-pointer" />
                 <MoreVertical size={22} className="hover:text-white cursor-pointer" />
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto px-16 py-6 space-y-4 z-10 custom-scrollbar-dark flex flex-col">
               <div className="flex justify-center my-4">
                  <span className="px-3 py-1 bg-[#182229] rounded-lg text-[12px] font-medium text-[#8696a0] uppercase tracking-wide shadow-sm">Today</span>
               </div>

               {activeConversation.map((msg, idx) => {
                 const isOutgoing = msg.direction === 'OUTGOING';
                 const isGroup = activeContact?.id.includes('group');
                 const stats = msg.mediaMetadata ? JSON.parse(msg.mediaMetadata) : null;
                 
                 // Dynamic helper to render rich content
                 const renderMessageContent = (content) => {
                    const urlRegex = /(https?:\/\/[^\s]+)/g;
                    const imageRegex = /\.(jpeg|jpg|gif|png|webp|svg)/i;
                    const isStrava = content.toLowerCase().includes('strava');
                    
                    if (isStrava && stats) {
                        return (
                          <div className="flex flex-col -mx-3 -mt-1.5 mb-1.5 overflow-hidden rounded-t-lg bg-[#111b21]">
                             {/* Strava Pro Header */}
                             <div className="h-10 bg-black flex items-center justify-between px-3">
                                <span className="text-white text-[11px] font-bold flex items-center gap-2">
                                   <div className="w-2 h-2 rounded-full bg-red-500"></div> Map
                                </span>
                                <MoreHorizontal size={16} className="text-white/70" />
                             </div>
                             {/* Map Route Visualization */}
                             <div className="relative h-44 bg-[#242f35]">
                                <img 
                                  src="https://blog.strava.com/wp-content/uploads/2018/06/6.25.18_blog_post_headers_map_styles.jpg" 
                                  alt="Run Route" 
                                  className="w-full h-full object-cover opacity-60" 
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                   <svg width="200" height="120" viewBox="0 0 200 120" className="drop-shadow-lg">
                                      <path d="M50,80 Q70,20 100,50 T150,30" stroke="#ff4500" strokeWidth="3" fill="none" strokeLinecap="round" className="animate-in fade-in zoom-in duration-1000" />
                                      <circle cx="50" cy="80" r="4" fill="white" />
                                      <circle cx="150" cy="30" r="4" fill="#ff4500" />
                                   </svg>
                                </div>
                             </div>
                             {/* Stats Grid */}
                             <div className="p-3 bg-[#202c33]/50">
                                <h3 className="text-white text-[13px] font-bold mb-3 flex items-center gap-1.5">
                                   Good afternoon run 🏃‍♂️
                                </h3>
                                <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
                                   <div className="flex flex-col">
                                      <span className="text-[10px] text-[#8696a0]">Pace</span>
                                      <span className="text-[12px] text-white font-medium">{stats.pace}</span>
                                   </div>
                                   <div className="flex flex-col">
                                      <span className="text-[10px] text-[#8696a0]">Time</span>
                                      <span className="text-[12px] text-white font-medium">{stats.time}</span>
                                   </div>
                                   <div className="flex flex-col">
                                      <span className="text-[10px] text-[#8696a0]">Distance</span>
                                      <span className="text-[12px] text-white font-medium">{stats.distance}</span>
                                   </div>
                                </div>
                                <div className="mt-3 text-[11px] text-[#34b7f1] hover:underline cursor-pointer truncate">
                                   Check out my run on Strava: https://strava.app.link/bWTR...
                                </div>
                             </div>
                          </div>
                        );
                    }

                    if (imageRegex.test(content) && content.match(urlRegex)) {
                        const url = content.match(urlRegex)[0];
                        return (
                          <div className="flex flex-col -mx-3 -mt-1.5 mb-1.5 overflow-hidden rounded-t-lg">
                            <img src={url} alt="Media" className="w-full h-auto max-h-[350px] object-cover" />
                            {content.length > url.length + 5 && (
                                <p className="px-3 py-1.5 text-[14px] text-[#e9edef] bg-[#202c33]/30">{content.replace(url, '').trim()}</p>
                            )}
                          </div>
                        );
                    }

                    const parts = content.split(urlRegex);
                    return parts.map((part, i) => {
                        if (part.match(urlRegex)) {
                            return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[#34b7f1] hover:underline break-all">{part}</a>;
                        }
                        return part;
                    });
                 };

                // Group-specific names simulation
                const senderNames = ["Jake Santos", "Jennifer Lee Hillestad", "Mamá", "Moi"];
                const senderName = isGroup ? (isOutgoing ? "You" : senderNames[idx % senderNames.length]) : null;
                const nameColors = ["text-[#ff8c00]", "text-[#32cd32]", "text-[#87ceeb]", "text-[#da70d6]"];
                const nameColor = nameColors[idx % nameColors.length];

                 return (
                   <div key={msg.id} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} w-full animate-in fade-in slide-in-from-bottom-1 duration-300`}>
                     <div className="flex items-end gap-2 max-w-[75%]">
                        {isGroup && !isOutgoing && (
                           <div className="w-7 h-7 rounded-full bg-slate-700 flex-shrink-0 mb-1 flex items-center justify-center text-[10px] text-white">
                              {senderName[0]}
                           </div>
                        )}
                        <div className={`relative px-3 py-1.5 rounded-lg shadow-sm ${isOutgoing ? themes.bubbleOut : themes.bubbleIn}`}>
                            
                            {/* Threaded Reply (Quote) Block */}
                            {msg.repliedToContent && (
                               <div className="mb-1.5 flex bg-black/10 rounded-md border-l-[4px] border-[#00a884] overflow-hidden">
                                  <div className="p-2 py-1 flex flex-col min-w-0">
                                     <span className="text-[11px] font-bold text-[#00a884]">
                                        {isOutgoing ? 'Jennifer Lee Hillestad' : 'Moi'}
                                     </span>
                                     <span className="text-[12px] text-[#8696a0] truncate italic leading-tight">
                                        {msg.repliedToContent}
                                     </span>
                                  </div>
                               </div>
                            )}

                            {isGroup && !isOutgoing && (
                                <p className={`text-[12.5px] font-bold mb-0.5 ${nameColor}`}>{senderName}</p>
                            )}
                            
                            <div className={`text-[14px] leading-relaxed break-words pr-12 ${themes.textP}`}>
                                {renderMessageContent(msg.content)}
                            </div>

                            <div className={`flex items-center gap-1.5 absolute bottom-1 right-2`}>
                                {msg.isEdited && (
                                   <span className="text-[10px] text-[#8696a0cc] font-light">Edited</span>
                                )}
                                <span className="text-[10px] text-[#8696a0cc] font-light">
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                                {isOutgoing && <CheckCheck size={16} className={`${idx % 2 === 0 ? 'text-[#53bdeb]' : 'text-[#8696a0cc]'}`} />}
                            </div>
                        </div>
                     </div>
                   </div>
                 );
               })}
               {loading && (
                 <div className="flex justify-center p-4">
                   <Loader2 size={24} className="animate-spin text-[#00a884]" />
                 </div>
               )}
            </div>

            {/* Chat Input Bar (Mock) */}
            <div className={`px-4 py-2 flex items-center gap-4 z-10 bg-[#202c33]`}>
              <div className="flex gap-4 text-[#8696a0]">
                 <Smile size={24} className="cursor-pointer hover:text-white" />
                 <Paperclip size={24} className="cursor-pointer hover:text-white -rotate-45" />
              </div>
              <input 
                type="text" 
                placeholder="Type a message"
                className="flex-1 bg-[#2a3942] rounded-lg border-none outline-none py-2.5 px-4 text-sm text-[#e9edef] placeholder:text-[#8696a0]"
                readOnly
              />
              <div className="text-[#8696a0]">
                 <Mic size={24} className="cursor-pointer hover:text-white" />
              </div>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4">
             <div className="w-[400px] h-[250px] relative">
                <div className="absolute inset-0 bg-emerald-500/10 rounded-full blur-3xl"></div>
                <Globe size={180} className="text-[#202c33] mx-auto relative z-10" />
             </div>
             <div className="space-y-2 z-10">
                <h2 className={`text-3xl font-light ${themes.textP}`}>WhatsApp Web</h2>
                <p className={`text-sm max-w-sm ${themes.textS}`}>
                  Send and receive messages without keeping your phone online. <br/>
                  Use WhatsApp on up to 4 linked devices and 1 phone at at the same time.
                </p>
             </div>
             <div className={`flex items-center gap-2 pt-10 text-xs ${themes.textS}`}>
                <ShieldCheck size={14} />
                <span>End-to-end encrypted</span>
             </div>
          </div>
        )}

      </div>

      {/* Setup Guide Drawer Toggle */}
      <button 
        onClick={() => setShowSetup(true)}
        className="fixed bottom-6 right-6 p-4 bg-[#00a884] text-white rounded-full shadow-2xl hover:bg-[#00c99c] transition-all transform hover:scale-110 z-50 group"
        title="Setup Assistant"
      >
        <HelpCircle size={28} />
        <span className="absolute right-full mr-3 px-3 py-1 bg-slate-900 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Network Setup Guide
        </span>
      </button>

      {/* Setup Guide Backdrop/Drawer */}
      {showSetup && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSetup(false)}></div>
          <div className="w-[400px] h-full bg-[#111b21] border-l border-[#222d34] shadow-2xl relative animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="h-[60px] px-6 bg-[#202c33] flex items-center gap-6 text-[#e9edef] border-b border-[#222d34]">
                <X size={24} className="cursor-pointer" onClick={() => setShowSetup(false)} />
                <h2 className="text-lg font-bold">Network Calibration</h2>
            </div>
            
            <div className="p-8 space-y-10 overflow-y-auto flex-1 custom-scrollbar-dark">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">1</div>
                    <h3 className="text-[#e9edef] font-bold">Initialize Tunnel</h3>
                  </div>
                  <div className="bg-[#202c33] p-4 rounded-xl font-mono text-emerald-400 text-xs shadow-inner select-all">
                    ngrok http 8080
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">2</div>
                    <h3 className="text-[#e9edef] font-bold">Meta Configuration</h3>
                  </div>
                  <p className="text-[#8696a0] text-sm leading-relaxed">
                    Map your ngrok URL in the developers.facebook.com portal: <br/>
                    <span className="text-[#00a884] break-all font-mono text-xs">...ngrok-free.app/api/whatsapp/webhook</span>
                  </p>
                </div>

                <div className="space-y-4 bg-emerald-500/5 p-6 rounded-2xl border border-emerald-500/20">
                  <h4 className="text-[#00a884] text-xs font-black uppercase tracking-widest">Handshake Token</h4>
                  <div className="flex items-center justify-between">
                    <span className="text-[#e9edef] font-mono text-sm">chema_assistant_2026</span>
                    <Globe size={16} className="text-emerald-500/30" />
                  </div>
                </div>
            </div>
            
            <div className="p-8 bg-[#202c33] text-center border-t border-[#222d34]">
                <p className="text-[10px] text-[#8696a0] font-bold uppercase tracking-[2px]">Encrypted Payload Relay Active</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsApp;
