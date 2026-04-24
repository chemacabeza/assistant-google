import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Edit3, Search, RefreshCw, X, Send } from 'lucide-react';
import { api } from '../api/axios';

const Gmail = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [draft, setDraft] = useState({ from: 'chema@chemacabeza.dev', to: '', subject: '', body: '' });

  // Fetch emails
  const { data: messages, isLoading, refetch } = useQuery({
    queryKey: ['gmail_messages', searchTerm],
    queryFn: async () => {
      const res = await api.get('/api/gmail/messages', { params: { q: searchTerm, maxResults: 15 } });
      const messageList = res.data?.messages || []; 
      
      const detailedMessages = await Promise.all(
        messageList.map(async (msg) => {
           try {
              const detailRes = await api.get(`/api/gmail/messages/${msg.id}`);
              return detailRes.data;
           } catch (e) {
              console.error("Failed fetching detail for", msg.id);
              return msg;
           }
        })
      );
      
      return detailedMessages;
    }
  });

  // Mock template fetch specifically for composer
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.get('/api/templates')).data
  });

  const sendEmail = useMutation({
    mutationFn: async (payload) => {
      const fromHeader = payload.from ? `From: ${payload.from}\r\n` : '';
      const raw = btoa(
        fromHeader +
        `To: ${payload.to}\r\n` +
        `Subject: ${payload.subject}\r\n\r\n` +
        `${payload.body}`
      ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
      return api.post('/api/gmail/send', { raw });
    },
    onSuccess: () => {
      setIsComposing(false);
      setDraft({ from: 'chema@chemacabeza.dev', to: '', subject: '', body: '' });
      alert("Email sent successfully!");
    },
  });

  const handleSend = (e) => {
    e.preventDefault();
    sendEmail.mutate(draft);
  };

  const applyTemplate = (template) => {
    setDraft(prev => ({
      ...prev,
      body: prev.body + (prev.body ? '\n\n' : '') + template.content
    }));
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      
      {/* Header Panel */}
      <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-red-500">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Mail className="text-blue-600" /> Gmail Integration (Updated)
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage and draft your emails.</p>
        </div>
        <button 
          onClick={() => setIsComposing(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Edit3 size={18} /> Compose
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="relative w-full max-w-md">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
           <input 
             type="text" 
             value={searchTerm}
             onChange={e => setSearchTerm(e.target.value)}
             className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
             placeholder="Search emails..."
           />
        </div>
        <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">
          <RefreshCw size={18} className={isLoading ? "animate-spin text-blue-500" : ""} />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-0">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (!messages || messages.length === 0) ? (
          <div className="text-center text-gray-500 py-12">No recent emails found matching your query.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {messages.map((msg, idx) => {
              const headers = msg.payload?.headers || [];
              const subjectHeader = headers.find(h => h.name === 'Subject');
              const dateHeader = headers.find(h => h.name === 'Date');
              const subject = subjectHeader ? subjectHeader.value : '(No Subject)';
              const dateStr = dateHeader ? new Date(dateHeader.value).toLocaleString() : '';
              const snippet = msg.snippet || 'No snippet available';

              return (
              <div key={msg.id || idx} className="p-4 hover:bg-blue-50/50 cursor-pointer transition-colors flex items-start gap-4">
                 <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                   {msg.id ? msg.id.substring(0, 2) : '?'}
                 </div>
                 <div className="overflow-hidden flex-1 overflow-x-auto">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center w-full gap-2">
                       <div className="font-semibold text-gray-800 text-sm truncate">{subject}</div>
                       <div className="text-gray-400 text-xs whitespace-nowrap">{dateStr}</div>
                    </div>
                    <div className="text-gray-500 text-xs truncate mt-1" dangerouslySetInnerHTML={{ __html: snippet }}></div>
                 </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer Modal Overlay */}
      {isComposing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
             <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
               <h3 className="font-semibold text-gray-800">New Message</h3>
               <button onClick={() => setIsComposing(false)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
             </div>
             <form onSubmit={handleSend} className="flex flex-col flex-1 overflow-hidden">
                <div className="px-6 border-b border-gray-100 flex items-center bg-yellow-50">
                   <label className="text-xs font-bold text-red-600 w-24">FROM EMAIL</label>
                   <select 
                      className="flex-1 py-3 outline-none text-sm bg-transparent"
                      value={draft.from}
                      onChange={e => setDraft({...draft, from: e.target.value})}
                   >
                      <option value="chema@chemacabeza.dev">chema@chemacabeza.dev</option>
                      <option value="the.engineering.corner.314@gmail.com">the.engineering.corner.314@gmail.com</option>
                      <option value="raymondreddington600@gmail.com">raymondreddington600@gmail.com</option>
                      <option value="chemacabeza@gmail.com">chemacabeza@gmail.com</option>
                   </select>
                </div>
                <div className="px-6 border-b border-gray-100 flex items-center">
                   <label className="text-xs font-semibold text-gray-400 w-12">To</label>
                   <input 
                      required 
                      type="email" 
                      placeholder="Recipient" 
                      className="flex-1 py-3 outline-none text-sm" 
                      value={draft.to} 
                      onChange={e => setDraft({...draft, to: e.target.value})}
                   />
                </div>
                <div className="px-6 border-b border-gray-100">
                   <input 
                      required 
                      type="text" 
                      placeholder="Subject" 
                      className="w-full py-3 outline-none text-sm font-medium" 
                      value={draft.subject} 
                      onChange={e => setDraft({...draft, subject: e.target.value})}
                   />
                </div>
                <div className="flex-1 p-6 overflow-y-auto">
                   <textarea 
                      required 
                      placeholder="Type your message here..." 
                      className="w-full h-full min-h-[200px] outline-none text-sm resize-none"
                      value={draft.body} 
                      onChange={e => setDraft({...draft, body: e.target.value})}
                   />
                </div>
                
                {/* Template bar */}
                <div className="bg-blue-50/50 px-6 py-3 border-t border-gray-100 flex items-center gap-2 overflow-x-auto whitespace-nowrap">
                   <span className="text-xs font-semibold text-blue-800 mr-2 uppercase tracking-wide">Templates</span>
                   {templates?.map(t => (
                     <button type="button" key={t.id} onClick={() => applyTemplate(t)} className="text-xs bg-white border border-blue-200 text-blue-700 px-3 py-1.5 rounded-full hover:bg-blue-600 hover:text-white transition-colors">
                        {t.title}
                     </button>
                   ))}
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
                   <button type="button" onClick={() => setIsComposing(false)} className="px-5 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 transition-colors">Cancel</button>
                   <button type="submit" disabled={sendEmail.isPending} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                     {sendEmail.isPending ? "Sending..." : <><Send size={16}/> Send</>}
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Gmail;
