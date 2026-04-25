import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Plus, Trash2, Mail, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../api/axios';

const LinkedAccountsManager = () => {
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { data: accounts, isLoading, refetch } = useQuery({
    queryKey: ['linked_accounts'],
    queryFn: async () => {
      const res = await api.get('/api/accounts');
      return res.data || [];
    }
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    
    setAdding(true);
    setErrorMsg('');
    try {
      await api.post('/api/accounts', {
        email: newEmail.trim(),
        name: newName.trim() || 'Custom Account'
      });
      setNewEmail('');
      setNewName('');
      refetch();
    } catch (e) {
      setErrorMsg(e.response?.data || 'Failed to add account');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to remove this linked account?')) return;
    try {
      await api.delete(`/api/accounts/${id}`);
      refetch();
    } catch (e) {
      console.error('Failed to delete account', e);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-5 border-b border-gray-100 bg-slate-50/50 flex items-center justify-between">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2">
          <Users size={18} className="text-indigo-500" />
          Linked Email Accounts
        </h2>
        <span className="text-xs text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full font-medium">Dynamically Synced</span>
      </div>
      
      <div className="p-6 space-y-6">
        <p className="text-sm text-slate-500">
          These email accounts will appear in dropdowns across the application (Gmail, Google Drive, Templates) allowing you to dynamically switch contexts.
        </p>

        {/* Add New Account Form */}
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-medium text-gray-500 mb-1">Email Address</label>
            <input 
              type="email" 
              required
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="e.g., secondary@gmail.com"
              className="w-full bg-slate-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs font-medium text-gray-500 mb-1">Display Name (Optional)</label>
            <input 
              type="text" 
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g., Work Email"
              className="w-full bg-slate-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button 
            type="submit" 
            disabled={adding}
            className="w-full sm:w-auto flex justify-center items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add Account
          </button>
        </form>

        {errorMsg && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
            <AlertCircle size={16} /> {errorMsg}
          </div>
        )}

        {/* Accounts List */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Configured Accounts</label>
          <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-100">
            {isLoading ? (
              <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-indigo-500" /></div>
            ) : accounts?.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No linked accounts found.</div>
            ) : (
              accounts?.map(acc => (
                <div key={acc.id} className="p-4 bg-white hover:bg-slate-50 transition-colors flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                      <Mail size={14} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{acc.email}</div>
                      <div className="text-xs text-slate-500">{acc.name}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(acc.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    title="Remove Account"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default LinkedAccountsManager;
