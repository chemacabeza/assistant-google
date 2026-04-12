import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Assistant from './pages/Assistant';
import Gmail from './pages/Gmail';
import Calendar from './pages/Calendar';
import Templates from './pages/Templates';
import Maps from './pages/Maps';

// Create a client for React Query
const queryClient = new QueryClient();



function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* Protected Routes Wrapper */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/assistant" element={<Assistant />} />
              
              {/* Feature routes */}
              <Route path="/gmail" element={<Gmail />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/maps" element={<Maps />} />
              <Route path="/settings" element={<div className="p-6">Settings coming soon</div>} />
              
            </Route>
          </Route>
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
