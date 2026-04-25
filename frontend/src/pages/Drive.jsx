import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, Plus, Home, HardDrive, Monitor, Users, Clock, Star, 
  AlertOctagon, Trash2, Cloud, Settings, HelpCircle, Grid, 
  List, Info, MoreVertical, Folder, FileText, Image as ImageIcon,
  ChevronDown
} from 'lucide-react';
import { api } from '../api/axios';
import { Link } from 'react-router-dom';

const Drive = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmail, setSelectedEmail] = useState('');
  const [folderPath, setFolderPath] = useState([{ id: 'root', name: 'My Drive' }]);

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

  // Reset folder path when email changes
  React.useEffect(() => {
    setFolderPath([{ id: 'root', name: 'My Drive' }]);
  }, [selectedEmail]);

  const currentFolderId = folderPath[folderPath.length - 1].id;

  const { data: files, isLoading } = useQuery({
    queryKey: ['drive_files', searchTerm, selectedEmail, currentFolderId],
    queryFn: async () => {
      let q = `'${selectedEmail}' in owners and '${currentFolderId}' in parents and trashed=false`;
      if (searchTerm) {
         q = `name contains '${searchTerm}' and ${q}`;
      }
      // Fetch up to 50 items for a good representation
      const res = await api.get('/api/drive/files', { params: { q, maxResults: 50 } });
      return res.data?.files || [];
    }
  });

  const formatSize = (bytes) => {
    if (!bytes) return '-';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const getIcon = (mimeType) => {
    if (mimeType === 'application/vnd.google-apps.folder') return <Folder size={20} className="fill-slate-400 text-slate-400" />;
    if (mimeType?.startsWith('image/')) return <ImageIcon size={20} className="text-red-400" />;
    return <FileText size={20} className="text-blue-400" />;
  };

  const handleItemClick = (file) => {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      setFolderPath(prev => [...prev, { id: file.id, name: file.name }]);
      setSearchTerm('');
    } else {
      // Future: handle file click (preview, etc.)
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#1f1f1f] text-[#e3e3e3] font-sans overflow-hidden">
      
      {/* Sidebar */}
      <aside className="w-[256px] flex flex-col pt-2 px-3 shrink-0">
        
        {/* Drive Logo Area */}
        <div className="flex items-center gap-2 pl-3 mb-6 h-12">
          <img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Drive" className="w-8 h-8" />
          <span className="text-[22px] font-medium text-white tracking-tight">Drive</span>
        </div>

        {/* New Button */}
        <button className="flex items-center gap-3 bg-[#c2e7ff] text-[#001d35] hover:bg-[#b0dcf8] hover:shadow-md transition-all rounded-2xl py-[18px] px-5 w-fit mb-4">
          <Plus size={24} />
          <span className="font-medium text-[15px]">New</span>
        </button>

        {/* Navigation */}
        <nav className="flex-1 space-y-[2px] overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-4 px-4 py-[10px] rounded-full hover:bg-[#28292a] cursor-pointer text-[#c4c7c5]">
             <Home size={20} />
             <span className="text-sm font-medium">Home</span>
          </div>
          <div className="flex items-center gap-4 px-4 py-[10px] rounded-full bg-[#004a77] text-[#c2e7ff] cursor-pointer">
             <HardDrive size={20} className="fill-current" />
             <span className="text-sm font-medium">My Drive</span>
          </div>
          <div className="flex items-center gap-4 px-4 py-[10px] rounded-full hover:bg-[#28292a] cursor-pointer text-[#c4c7c5]">
             <Monitor size={20} />
             <span className="text-sm font-medium">Computers</span>
          </div>
          
          <div className="h-4"></div> {/* Spacer */}

          <div className="flex items-center gap-4 px-4 py-[10px] rounded-full hover:bg-[#28292a] cursor-pointer text-[#c4c7c5]">
             <Users size={20} />
             <span className="text-sm font-medium">Shared with me</span>
          </div>
          <div className="flex items-center gap-4 px-4 py-[10px] rounded-full hover:bg-[#28292a] cursor-pointer text-[#c4c7c5]">
             <Clock size={20} />
             <span className="text-sm font-medium">Recent</span>
          </div>
          <div className="flex items-center gap-4 px-4 py-[10px] rounded-full hover:bg-[#28292a] cursor-pointer text-[#c4c7c5]">
             <Star size={20} />
             <span className="text-sm font-medium">Starred</span>
          </div>

          <div className="h-4"></div> {/* Spacer */}

          <div className="flex items-center gap-4 px-4 py-[10px] rounded-full hover:bg-[#28292a] cursor-pointer text-[#c4c7c5]">
             <AlertOctagon size={20} />
             <span className="text-sm font-medium">Spam</span>
          </div>
          <div className="flex items-center gap-4 px-4 py-[10px] rounded-full hover:bg-[#28292a] cursor-pointer text-[#c4c7c5]">
             <Trash2 size={20} />
             <span className="text-sm font-medium">Bin</span>
          </div>
          <div className="flex items-center gap-4 px-4 py-[10px] rounded-full hover:bg-[#28292a] cursor-pointer text-[#c4c7c5]">
             <Cloud size={20} />
             <span className="text-sm font-medium">Storage</span>
          </div>
          
          <div className="px-5 mt-2">
            <div className="w-full bg-[#444746] rounded-full h-1 mt-2">
              <div className="bg-[#c2e7ff] h-1 rounded-full" style={{ width: '5%' }}></div>
            </div>
            <p className="text-xs mt-2 text-[#c4c7c5]">172.91 GB of 32 TB used</p>
            <button className="mt-3 border border-[#747775] text-[#c2e7ff] hover:bg-[#28292a] rounded-full px-4 py-2 text-sm font-medium transition-colors">
              Get more storage
            </button>
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
                placeholder="Search in Drive" 
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
            
            {/* Custom: Back to Assistant */}
            <Link to="/dashboard" className="ml-2 mr-2 p-1.5 border border-[#444746] rounded-full text-xs font-semibold hover:bg-[#28292a] text-[#c2e7ff] flex items-center gap-1">
               Exit
            </Link>
          </div>
        </header>

        {/* Content View */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden bg-[#131314]">
          
          {/* Prominent Active Account Dropdown */}
          <div className="flex items-center gap-3 mb-4 bg-[#28292a] p-3 rounded-xl border border-[#444746] w-fit">
            <label className="text-sm font-medium text-[#e3e3e3] flex items-center gap-2">
               <Users size={18} className="text-[#c2e7ff]" />
               Viewing Drive for:
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

          <div className="text-[24px] text-white flex items-center gap-2 mb-4">
            {folderPath.length > 1 ? (
              <div className="flex items-center gap-1 text-[#e3e3e3]">
                {folderPath.map((folder, index) => (
                  <React.Fragment key={folder.id}>
                    {index > 0 && <span className="text-[#747775] text-lg mx-1">›</span>}
                    <button 
                      onClick={() => setFolderPath(prev => prev.slice(0, index + 1))}
                      className="hover:bg-[#28292a] px-2 py-1 rounded transition-colors truncate max-w-[200px] font-medium flex items-center"
                    >
                      {folder.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <h1 className="flex items-center gap-2 font-medium">My Drive <ChevronDown size={20} className="mt-1" /></h1>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-6">
            <button className="border border-[#747775] text-[#e3e3e3] hover:bg-[#28292a] rounded-lg px-4 py-1.5 text-sm font-medium flex items-center gap-2">Type <ChevronDown size={16}/></button>
            <button className="border border-[#747775] text-[#e3e3e3] hover:bg-[#28292a] rounded-lg px-4 py-1.5 text-sm font-medium flex items-center gap-2">People <ChevronDown size={16}/></button>
            <button className="border border-[#747775] text-[#e3e3e3] hover:bg-[#28292a] rounded-lg px-4 py-1.5 text-sm font-medium flex items-center gap-2">Modified <ChevronDown size={16}/></button>
            <div className="flex-1"></div>
            <div className="flex border border-[#747775] rounded-full overflow-hidden">
               <button className="bg-[#c2e7ff] text-[#001d35] p-1.5 px-3"><List size={18}/></button>
               <button className="hover:bg-[#28292a] p-1.5 px-3 text-[#c4c7c5]"><Grid size={18}/></button>
            </div>
            <button className="p-2 hover:bg-[#28292a] rounded-full text-[#c4c7c5]"><Info size={20}/></button>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-[1fr_200px_150px_100px_40px] gap-4 px-4 py-2 border-b border-[#444746] text-sm font-medium text-[#c4c7c5] mb-2">
            <div className="flex items-center gap-2 hover:bg-[#28292a] w-fit px-2 py-1 -ml-2 rounded cursor-pointer">Name <ChevronDown size={16}/></div>
            <div>Owner</div>
            <div>Date modified</div>
            <div>File size</div>
            <div></div>
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {isLoading ? (
               <div className="flex justify-center p-12">
                 <div className="animate-spin w-8 h-8 border-4 border-[#c2e7ff] border-t-transparent rounded-full"></div>
               </div>
            ) : (!files || files.length === 0) ? (
               <div className="text-center p-12 text-[#c4c7c5]">No files or folders found.</div>
            ) : (
               files.map((file) => {
                 const isMe = file.owners?.[0]?.me;
                 const ownerName = isMe ? 'me' : (file.owners?.[0]?.displayName || 'Unknown');
                 const ownerPic = file.owners?.[0]?.photoLink;

                 return (
                   <div 
                     key={file.id} 
                     onClick={() => handleItemClick(file)}
                     className="grid grid-cols-[1fr_200px_150px_100px_40px] gap-4 px-4 py-2.5 border-b border-[#444746]/50 hover:bg-[#28292a] rounded-full items-center text-sm cursor-pointer group"
                   >
                     <div className="flex items-center gap-4 overflow-hidden pr-4">
                       {getIcon(file.mimeType)}
                       <span className="truncate text-[#e3e3e3] font-medium">{file.name}</span>
                     </div>
                     <div className="flex items-center gap-2">
                       {ownerPic ? (
                         <img src={ownerPic} alt="" className="w-6 h-6 rounded-full" />
                       ) : (
                         <div className="w-6 h-6 rounded-full bg-blue-800 text-white flex items-center justify-center text-xs">
                           {ownerName.charAt(0).toUpperCase()}
                         </div>
                       )}
                       <span className="text-[#c4c7c5] truncate">{ownerName}</span>
                     </div>
                     <div className="text-[#c4c7c5] whitespace-nowrap">{formatDate(file.modifiedTime)}</div>
                     <div className="text-[#c4c7c5]">{formatSize(file.size)}</div>
                     <div className="text-[#c4c7c5] opacity-0 group-hover:opacity-100 transition-opacity flex justify-end pr-2">
                       <MoreVertical size={18} />
                     </div>
                   </div>
                 );
               })
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

export default Drive;
