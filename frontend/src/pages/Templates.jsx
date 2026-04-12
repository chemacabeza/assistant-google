import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2, X, Tag } from 'lucide-react';
import { api } from '../api/axios';

const Templates = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showContactsDropdown, setShowContactsDropdown] = useState(false);
  const [modalData, setModalData] = useState({ id: null, title: '', content: '', category: 'General', targetEmail: '', sendDate: '', sendTime: '' });

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.get('/api/templates')).data,
    refetchInterval: 15000
  });

  const { data: contacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      try {
        return (await api.get('/api/contacts')).data;
      } catch (e) {
        console.error("Failed to fetch contacts", e);
        return [];
      }
    }
  });

  const saveTemplate = useMutation({
    mutationFn: async (payload) => {
      let sendAt = null;
      if (payload.sendDate && payload.sendTime) {
         sendAt = `${payload.sendDate}T${payload.sendTime}:00`;
      }
      
      const req = { ...payload, sendAt };
      if (req.id) return api.put(`/api/templates/${req.id}`, req);
      return api.post('/api/templates', req);
    },
    onSuccess: () => {
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    }
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id) => api.delete(`/api/templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] })
  });

  const openModal = (temp = { id: null, title: '', content: '', category: 'General', targetEmail: '', sendDate: '', sendTime: '' }) => {
    if (temp.sendAt) {
        temp.sendDate = temp.sendAt.split('T')[0];
        temp.sendTime = temp.sendAt.split('T')[1].substring(0, 5);
    }
    setModalData({ ...temp });
    setIsModalOpen(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    saveTemplate.mutate(modalData);
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="text-emerald-600" /> Scheduled Emails
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage and automate your scheduled email dispatches.</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> New Template
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        
        {isLoading ? (
          <div className="text-center py-12"><div className="animate-spin inline-block w-8 h-8 border-[3px] border-emerald-200 border-t-emerald-600 rounded-full"></div></div>
        ) : (!templates || templates.length === 0) ? (
          <div className="bg-white py-16 rounded-xl border border-dashed border-gray-300 text-center flex flex-col items-center">
             <div className="bg-emerald-50 p-4 rounded-full text-emerald-500 mb-4"><FileText size={32} /></div>
             <p className="text-gray-900 font-bold text-lg">No templates yet</p>
             <p className="text-gray-500 mt-1 mb-4 text-sm max-w-sm">Create standard responses like "Follow up", "Meeting confirmation", or "Invoice sent" to save time.</p>
             <button onClick={() => openModal()} className="font-semibold text-emerald-600 hover:text-emerald-800">Create your first template</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((temp) => (
              <div key={temp.id} className="bg-white rounded-xl border border-gray-200 hover:border-emerald-300 hover:shadow-md transition-all flex flex-col">
                <div className="p-5 flex-1">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-gray-900 text-lg truncate pr-2">{temp.title}</h3>
                    <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded text-nowrap ${temp.status === 'SENT' ? 'bg-indigo-50 text-indigo-700' : temp.status === 'FAILED' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                       {temp.status === 'SENT' ? 'Sent' : temp.status === 'FAILED' ? 'Failed' : 'Pending'}
                    </span>
                  </div>
                  {temp.targetEmail && <p className="text-xs font-semibold mb-2 text-gray-600">To: {temp.targetEmail}</p>}
                  {temp.sendAt && <p className="text-xs font-semibold mb-3 text-indigo-600">Scheduled: {new Date(temp.sendAt).toLocaleString()}</p>}
                  <p className="text-sm text-gray-600 line-clamp-4 leading-relaxed bg-gray-50 p-3 rounded" style={{ whiteSpace: 'pre-line' }}>{temp.content}</p>
                </div>
                <div className="border-t border-gray-100 flex divide-x divide-gray-100 bg-gray-50/50 rounded-b-xl overflow-hidden">
                  <button onClick={() => openModal(temp)} className="flex-1 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors">Edit</button>
                  <button onClick={() => { if(window.confirm('Delete this template?')) deleteTemplate.mutate(temp.id); }} className="flex-1 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors flex items-center justify-center gap-1">
                     <Trash2 size={16} className="mb-[1px]" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
             <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-emerald-50/50">
               <h3 className="font-bold text-gray-800 text-lg">{modalData.id ? 'Edit Template' : 'New Template'}</h3>
               <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
             </div>
             <form onSubmit={handleSave} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Title</label>
                  <input required type="text" placeholder="e.g., Follow up after meeting" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 outline-none" value={modalData.title} onChange={e => setModalData({...modalData, title: e.target.value})} />
                </div>
                <div className="relative">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Target Email</label>
                  <input 
                      required 
                      type="text" 
                      placeholder="recipient@example.com" 
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 outline-none" 
                      value={modalData.targetEmail} 
                      onChange={e => {
                         setModalData({...modalData, targetEmail: e.target.value});
                         setShowContactsDropdown(true);
                      }}
                      onFocus={() => setShowContactsDropdown(true)}
                      onBlur={() => setTimeout(() => setShowContactsDropdown(false), 200)}
                  />
                  {showContactsDropdown && contacts && contacts.length > 0 && modalData.targetEmail.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {contacts
                          .filter(c => 
                             c.name?.toLowerCase().includes(modalData.targetEmail.toLowerCase()) || 
                             c.email.toLowerCase().includes(modalData.targetEmail.toLowerCase())
                          )
                          .map((contact, idx) => (
                          <div 
                            key={idx} 
                            className="px-4 py-2 hover:bg-emerald-50 cursor-pointer border-b border-gray-50 last:border-0"
                            onClick={() => {
                               setModalData({...modalData, targetEmail: contact.email});
                               setShowContactsDropdown(false);
                            }}
                          >
                            <p className="font-semibold text-gray-800 text-sm">{contact.name || 'Unknown'}</p>
                            <p className="text-xs text-gray-500">{contact.email}</p>
                          </div>
                        ))}
                      </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Schedule Date</label>
                    <input required type="date" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 outline-none" value={modalData.sendDate} onChange={e => setModalData({...modalData, sendDate: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Schedule Time</label>
                    <input required type="time" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 outline-none" value={modalData.sendTime} onChange={e => setModalData({...modalData, sendTime: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Email Body</label>
                  <textarea required className="w-full border border-gray-300 rounded-lg px-4 py-2 h-32 focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm leading-relaxed" placeholder="Hello {{name}},&#10;&#10;Thanks for your time today..." value={modalData.content} onChange={e => setModalData({...modalData, content: e.target.value})}></textarea>
                </div>
                
                <div className="pt-2 flex justify-end gap-3">
                   <button type="submit" disabled={saveTemplate.isPending} className="w-full py-3 rounded-lg font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                     {saveTemplate.isPending ? 'Saving...' : 'Save Template'}
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Templates;
