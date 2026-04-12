import React from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { LogOut } from 'lucide-react';

const Topbar = () => {
  const { user, logout } = useAuthStore();

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6">
      <div className="font-semibold text-gray-800 text-lg">
        Assistant Dashboard
      </div>
      
      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">{user.name}</span>
            {user.picture && (
              <img src={user.picture} alt="Profile" className="w-8 h-8 rounded-full border border-gray-200" />
            )}
            <button 
              onClick={logout}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors ml-2"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Topbar;
