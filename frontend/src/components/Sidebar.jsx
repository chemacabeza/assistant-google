import React from 'react';
import { NavLink } from 'react-router-dom';
import { Mail, Calendar, Settings, Bot, BookTemplate, MapPin, LayoutDashboard, Cog } from 'lucide-react';

const Sidebar = () => {
  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Assistant', path: '/assistant', icon: <Bot size={20} /> },
    { name: 'Gmail', path: '/gmail', icon: <Mail size={20} /> },
    { name: 'Calendar', path: '/calendar', icon: <Calendar size={20} /> },
    { name: 'Custom Answers', path: '/templates', icon: <BookTemplate size={20} /> },
    { name: 'Maps', path: '/maps', icon: <MapPin size={20} /> },
    { name: 'Settings', path: '/settings', icon: <Settings size={20} /> },
    { name: 'Configuration', path: '/configuration', icon: <Cog size={20} /> },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-full shrink-0">
      <div className="p-6">
        <h2 className="text-xl font-bold tracking-wider text-blue-400 flex items-center gap-2">
          <Bot /> Chema's AI Assistant
        </h2>
      </div>
      <nav className="flex-1 px-4 mt-4 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`
            }
          >
            {item.icon}
            <span className="font-medium">{item.name}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
        Assistant Suite v1.0
      </div>
    </aside>
  );
};

export default Sidebar;
