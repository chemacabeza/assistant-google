import React from 'react';
import { LayoutDashboard } from 'lucide-react';

const Dashboard = () => {
  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <div className="flex items-center gap-3 border-b border-gray-100 pb-6 mb-6">
        <LayoutDashboard className="text-blue-500 w-8 h-8" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">System Dashboard</h1>
          <p className="text-sm text-gray-500 text-slate-500 mt-1">Platform overview and general summary</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
            <h2 className="text-xl font-medium text-slate-800 mb-2">Welcome to ANTIGRAVITY</h2>
            <p className="text-slate-500">Navigate to the Assistant module on your left-hand sidebar to access the advanced AI conversation capabilities, or view your integrated tools directly.</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
