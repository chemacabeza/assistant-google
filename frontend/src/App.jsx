import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Assistant from './pages/Assistant';
import Gmail from './pages/Gmail';
import Drive from './pages/Drive';
import Photos from './pages/Photos';
import Calendar from './pages/Calendar';
import Templates from './pages/Templates';
import Maps from './pages/Maps';
import WhatsApp from './pages/WhatsApp';
import Configuration from './pages/Configuration';
import Settings from './pages/Settings';

// Create a client for React Query
const queryClient = new QueryClient();



function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* Protected Routes Wrapper */}
          {/* WhatsApp: full-screen, no sidebar/topbar — mirrors web.whatsapp.com */}
          <Route element={<ProtectedRoute />}>
            <Route path="/whatsapp" element={
              <div style={{ width:'100vw', height:'100vh', overflow:'hidden' }}>
                <WhatsApp />
              </div>
            } />
            <Route path="/drive" element={
              <div style={{ width:'100vw', height:'100vh', overflow:'hidden', backgroundColor: '#131314', color: '#e3e3e3', fontFamily: 'Inter, Roboto, sans-serif' }}>
                <Drive />
              </div>
            } />
            <Route path="/photos" element={
              <div style={{ width:'100vw', height:'100vh', overflow:'hidden', backgroundColor: '#131314', color: '#e3e3e3', fontFamily: 'Inter, Roboto, sans-serif' }}>
                <Photos />
              </div>
            } />
          </Route>

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
              <Route path="/settings" element={<Settings />} />
              <Route path="/configuration" element={<Configuration />} />
              
            </Route>
          </Route>
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
