import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, Image as ImageIcon, Settings, HelpCircle, 
  ChevronDown, Filter, Grid, List, MoreVertical, Users 
} from 'lucide-react';
import { api } from '../api/axios';
import { Link } from 'react-router-dom';

const Photos = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmail, setSelectedEmail] = useState('');

  const { data: accountsData } = useQuery({
    queryKey: ['linked_accounts'],
    queryFn: async () => {
      const res = await api.get('/api/accounts');
      return res.data || [];
    }
  });

  React.useEffect(() => {
    if (accountsData?.length > 0 && !selectedEmail) {
      setSelectedEmail(accountsData[0].email);
    }
  }, [accountsData, selectedEmail]);

  const [activeSession, setActiveSession] = useState(null);
  const [sessionError, setSessionError] = useState(null);

  // Poll session status if activeSession exists but mediaItemsSet is false
  const { data: sessionStatus } = useQuery({
    queryKey: ['photos_session_status', activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.id) return null;
      const res = await api.get(`/api/photos/session/${activeSession.id}`);
      return res.data;
    },
    enabled: !!activeSession?.id && !activeSession?.mediaItemsSet,
    refetchInterval: (query) => query.state?.data?.mediaItemsSet ? false : 3000,
  });

  React.useEffect(() => {
    if (sessionStatus?.mediaItemsSet) {
       setActiveSession(prev => ({...prev, mediaItemsSet: true}));
    }
  }, [sessionStatus]);

  const { data: mediaItems, isLoading, isError, error } = useQuery({
    queryKey: ['photos_media', activeSession?.id],
    queryFn: async () => {
      const res = await api.get('/api/photos/media', { params: { sessionId: activeSession.id, pageSize: 50 } });
      return res.data?.mediaItems || [];
    },
    enabled: !!activeSession?.id && !!activeSession?.mediaItemsSet,
    retry: false
  });

  const handleCreateSession = async () => {
    try {
      setSessionError(null);
      const res = await api.post('/api/photos/session');
      const sessionData = res.data;
      setActiveSession({ id: sessionData.id, mediaItemsSet: false });
      window.open(sessionData.pickerUri + '/autoclose', '_blank');
    } catch (e) {
      console.error("Failed to create session", e);
      setSessionError(e);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout');
      // Jump directly to the OAuth provider to bypass the intermediary login screen
      window.location.href = '/oauth2/authorization/google';
    } catch (e) {
      console.error('Logout failed', e);
      window.location.href = '/oauth2/authorization/google';
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#1f1f1f] text-[#e3e3e3] font-sans overflow-hidden">
      
      {/* Sidebar */}
      <aside className="w-[256px] flex flex-col pt-2 px-3 shrink-0">
        
        {/* Photos Logo Area */}
        <div className="flex items-center gap-2 pl-3 mb-6 h-12 mt-2">
          <ImageIcon size={32} className="text-[#a8c7fa]" />
          <span className="text-[22px] font-medium text-white tracking-tight">Photos</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-[2px] overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-4 px-4 py-[10px] rounded-full bg-[#004a77] text-[#c2e7ff] cursor-pointer">
             <ImageIcon size={20} className="fill-current" />
             <span className="text-sm font-medium">Photos</span>
          </div>
          <div className="flex items-center gap-4 px-4 py-[10px] rounded-full hover:bg-[#28292a] cursor-pointer text-[#c4c7c5]">
             <Search size={20} />
             <span className="text-sm font-medium">Explore</span>
          </div>
          <div className="flex items-center gap-4 px-4 py-[10px] rounded-full hover:bg-[#28292a] cursor-pointer text-[#c4c7c5]">
             <Users size={20} />
             <span className="text-sm font-medium">Sharing</span>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col bg-[#131314] rounded-tl-[24px] mt-2 mr-2 overflow-hidden shadow-inner relative border border-[#444746]/40">
        
        {/* Top Navbar */}
        <header className="h-[64px] flex items-center justify-between px-4 shrink-0 bg-[#1f1f1f] border-b border-[#1f1f1f]">
          
          {/* Search Bar */}
          <div className="flex-1 max-w-[720px] ml-2">
            <div className="bg-[#28292a] hover:bg-[#303134] focus-within:bg-[#303134] focus-within:shadow-md transition-colors rounded-full flex items-center px-4 py-2.5">
              <Search size={24} className="text-[#c4c7c5] mr-3" />
              <input 
                type="text" 
                placeholder="Search your photos" 
                className="bg-transparent border-none outline-none text-[#e3e3e3] w-full text-[16px] placeholder-[#c4c7c5]"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Right Icons */}
          <div className="flex items-center gap-2 ml-4">
            <div className="p-2 hover:bg-[#28292a] rounded-full cursor-pointer transition-colors text-[#c4c7c5]"><Settings size={24} /></div>
            <div className="p-2 hover:bg-[#28292a] rounded-full cursor-pointer transition-colors text-[#c4c7c5]"><HelpCircle size={24} /></div>
            <Link to="/dashboard" className="ml-2 mr-2 p-1.5 border border-[#444746] rounded-full text-xs font-semibold hover:bg-[#28292a] text-[#c2e7ff] flex items-center gap-1">
               Exit
            </Link>
          </div>
        </header>

        {/* Content View */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden bg-[#131314]">
          
          {/* Active Account Dropdown */}
          <div className="flex items-center gap-3 mb-4 bg-[#28292a] p-3 rounded-xl border border-[#444746] w-fit">
            <label className="text-sm font-medium text-[#e3e3e3] flex items-center gap-2">
               <Users size={18} className="text-[#c2e7ff]" />
               Viewing Photos for:
            </label>
            <select 
              className="bg-[#131314] border border-[#747775] rounded-lg px-3 py-1.5 text-sm text-[#e3e3e3] outline-none cursor-pointer hover:bg-[#303134] transition-colors w-[300px]"
              value={selectedEmail}
              onChange={e => setSelectedEmail(e.target.value)}
            >
              {accountsData?.length > 0 ? (
                accountsData.map(acc => (
                  <option key={acc.id} value={acc.email}>{acc.email}</option>
                ))
              ) : (
                <option value="chema@chemacabeza.dev">chema@chemacabeza.dev</option>
              )}
            </select>
          </div>

          <div className="flex items-center justify-between mb-6">
            <h1 className="text-[24px] text-white flex items-center gap-2">
              Photos <ChevronDown size={20} className="mt-1" />
            </h1>
            <div className="flex items-center gap-3">
              <div className="flex border border-[#747775] rounded-full overflow-hidden">
                 <button className="bg-[#c2e7ff] text-[#001d35] p-1.5 px-3"><Grid size={18}/></button>
                 <button className="hover:bg-[#28292a] p-1.5 px-3 text-[#c4c7c5]"><List size={18}/></button>
              </div>
            </div>
          </div>

          {/* Photo Grid */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {sessionError || isError ? (
               <div className="text-center p-12 text-[#ff8a8a] bg-[#28292a] rounded-xl border border-[#444746] m-4">
                 <p className="font-semibold text-lg mb-2">Authorization Error</p>
                 <p className="text-[#e3e3e3] mb-4">The Google Photos API rejected the request. You likely need to re-authenticate to grant the new permissions.</p>
                 <p className="text-sm text-[#c4c7c5] mb-6">Error details: {(sessionError || error)?.response?.data?.message || (sessionError || error)?.message || 'Unknown error'}</p>
                 <button onClick={handleLogout} className="bg-[#c2e7ff] text-[#001d35] px-6 py-2 rounded-full font-medium hover:bg-[#b0dcf8] transition-colors">
                   Log Out & Re-Authenticate
                 </button>
               </div>
            ) : !activeSession ? (
               <div className="flex flex-col items-center justify-center h-full p-12">
                  <ImageIcon size={64} className="text-[#444746] mb-6" />
                  <h2 className="text-2xl font-medium text-white mb-2">Select Photos to View</h2>
                  <p className="text-[#c4c7c5] mb-8 text-center max-w-md">
                    Due to Google's privacy policies, you must explicitly select which photos the assistant can access using the official Google Picker.
                  </p>
                  <button 
                    onClick={handleCreateSession}
                    className="bg-[#c2e7ff] text-[#001d35] px-8 py-3 rounded-full font-medium hover:bg-[#b0dcf8] transition-colors shadow-lg"
                  >
                    Select Photos from Google
                  </button>
               </div>
            ) : !activeSession.mediaItemsSet ? (
               <div className="flex flex-col items-center justify-center h-full p-12">
                  <div className="animate-spin w-12 h-12 border-4 border-[#c2e7ff] border-t-transparent rounded-full mb-6"></div>
                  <h2 className="text-xl font-medium text-white mb-2">Waiting for selection...</h2>
                  <p className="text-[#c4c7c5]">Please complete your photo selection in the popup window.</p>
               </div>
            ) : isLoading ? (
               <div className="flex justify-center p-12">
                 <div className="animate-spin w-8 h-8 border-4 border-[#c2e7ff] border-t-transparent rounded-full"></div>
               </div>
            ) : (!mediaItems || mediaItems.length === 0) ? (
               <div className="text-center p-12 text-[#c4c7c5]">
                  <p className="font-medium text-lg text-white mb-2">No photos returned.</p>
                  <p className="text-sm">You did not select any photos in the picker, or there was an error retrieving them.</p>
                  <button onClick={() => setActiveSession(null)} className="mt-6 text-[#c2e7ff] hover:underline">Try Again</button>
               </div>
            ) : (
               <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                 {mediaItems.map((item) => (
                   <div key={item.id} className="aspect-square relative group cursor-pointer overflow-hidden rounded-lg bg-[#28292a]">
                     <img 
                       src={`${item.baseUrl}=w500-h500-c`} 
                       alt={item.filename || 'Photo'} 
                       className="w-full h-full object-cover transition-transform group-hover:scale-105"
                     />
                     <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                     <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical size={20} className="text-white drop-shadow-md" />
                     </div>
                   </div>
                 ))}
               </div>
            )}
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #444746;
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #747775;
        }
      `}} />
    </div>
  );
};

export default Photos;
