import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  User,
  Mail,
  Calendar,
  Clock,
  Shield,
  LogOut,
  Activity,
  Loader2,
  ChevronRight,
  FileText,
  Trash2,
  Send,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { api } from '../api/axios';

const Settings = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    loadProfile();
    loadAuditLogs();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await api.get('/api/auth/profile');
      setProfile(res.data);
    } catch (e) {
      console.error('Failed to load profile:', e);
    } finally {
      setLoadingProfile(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const res = await api.get('/api/audit');
      setAuditLogs(res.data || []);
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await api.post('/api/auth/logout');
      navigate('/login');
    } catch (e) {
      console.error('Logout failed:', e);
      // Even if the call fails, redirect to login
      navigate('/login');
    }
  };

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'CREATE_EVENT': return <Calendar size={14} className="text-emerald-500" />;
      case 'UPDATE_EVENT': return <RefreshCw size={14} className="text-blue-500" />;
      case 'DELETE_EVENT': return <Trash2 size={14} className="text-red-500" />;
      case 'SEND_EMAIL': return <Send size={14} className="text-violet-500" />;
      default: return <Activity size={14} className="text-slate-400" />;
    }
  };

  const getActionLabel = (actionType) => {
    switch (actionType) {
      case 'CREATE_EVENT': return 'Created Event';
      case 'UPDATE_EVENT': return 'Updated Event';
      case 'DELETE_EVENT': return 'Deleted Event';
      case 'SEND_EMAIL': return 'Sent Email';
      default: return actionType.replace(/_/g, ' ');
    }
  };

  const getActionBadgeColor = (actionType) => {
    switch (actionType) {
      case 'CREATE_EVENT': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'UPDATE_EVENT': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'DELETE_EVENT': return 'bg-red-50 text-red-700 border-red-200';
      case 'SEND_EMAIL': return 'bg-violet-50 text-violet-700 border-violet-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const formatTimestamp = (ts) => {
    try {
      const date = new Date(ts);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      let relative;
      if (diffMins < 1) relative = 'Just now';
      else if (diffMins < 60) relative = `${diffMins}m ago`;
      else if (diffHours < 24) relative = `${diffHours}h ago`;
      else if (diffDays < 7) relative = `${diffDays}d ago`;
      else relative = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const full = date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      return { relative, full };
    } catch {
      return { relative: ts, full: ts };
    }
  };

  const formatMemberSince = (ts) => {
    try {
      return new Date(ts).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div className="min-h-full flex flex-col space-y-6 pb-8">

      {/* Page Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 p-3 rounded-lg text-slate-600">
            <SettingsIcon className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
            <p className="text-sm text-slate-500 mt-1">Your profile, activity history, and session management</p>
          </div>
        </div>
      </div>

      {/* User Profile Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-slate-50/50">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <User size={18} className="text-blue-500" />
            User Profile
          </h2>
        </div>
        <div className="p-6">
          {loadingProfile ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="ml-3 text-sm text-slate-500">Loading profile...</span>
            </div>
          ) : profile ? (
            <div className="flex items-start gap-6">
              {/* Avatar */}
              <div className="shrink-0">
                {profile.picture ? (
                  <img
                    src={profile.picture}
                    alt={profile.name}
                    className="w-20 h-20 rounded-2xl shadow-md border-2 border-white ring-2 ring-blue-100"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                    <span className="text-2xl font-bold text-white">
                      {profile.name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
              </div>

              {/* Profile Info */}
              <div className="flex-1 space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-800">{profile.name}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Google Account</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-gray-100">
                    <Mail size={16} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400 font-medium">Email</p>
                      <p className="text-sm font-medium text-gray-700 truncate">{profile.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-gray-100">
                    <Clock size={16} className="text-slate-400 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Member Since</p>
                      <p className="text-sm font-medium text-gray-700">
                        {formatMemberSince(profile.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-gray-100">
                    <Shield size={16} className="text-slate-400 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Authentication</p>
                      <p className="text-sm font-medium text-gray-700">Google OAuth 2.0</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-gray-100">
                    <Activity size={16} className="text-slate-400 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Total Actions</p>
                      <p className="text-sm font-medium text-gray-700">
                        {loadingLogs ? '...' : `${auditLogs.length} recorded`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
              <AlertCircle size={18} className="text-amber-500" />
              <p className="text-sm text-amber-700">Unable to load profile information.</p>
            </div>
          )}
        </div>
      </div>

      {/* Activity Log Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <FileText size={18} className="text-emerald-500" />
            Activity Log
          </h2>
          <div className="flex items-center gap-3">
            {!loadingLogs && (
              <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full font-medium">
                {auditLogs.length} {auditLogs.length === 1 ? 'entry' : 'entries'}
              </span>
            )}
            <button
              onClick={() => { setLoadingLogs(true); loadAuditLogs(); }}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>
        </div>
        <div className="p-6">
          {loadingLogs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <span className="ml-3 text-sm text-slate-500">Loading activity log...</span>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="text-center py-12">
              <Activity size={40} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-500 font-medium">No activity recorded yet</p>
              <p className="text-xs text-slate-400 mt-1">Actions like creating events, updating events, and sending emails will appear here</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {auditLogs.map((log) => {
                const ts = formatTimestamp(log.timestamp);
                return (
                  <div
                    key={log.id}
                    className="group flex items-center gap-4 p-3.5 rounded-xl hover:bg-slate-50 transition-all duration-150 border border-transparent hover:border-gray-100"
                  >
                    {/* Icon */}
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                      {getActionIcon(log.actionType)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getActionBadgeColor(log.actionType)}`}>
                          {getActionLabel(log.actionType)}
                        </span>
                      </div>
                      {log.details && (
                        <p className="text-xs text-slate-400 mt-1 truncate">{log.details}</p>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium text-slate-500">{ts.relative}</p>
                      <p className="text-[10px] text-slate-300 mt-0.5">{ts.full}</p>
                    </div>

                    <ChevronRight size={14} className="shrink-0 text-slate-200 group-hover:text-slate-400 transition-colors" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Session Management / Logout Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-slate-50/50">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <Shield size={18} className="text-red-500" />
            Session Management
          </h2>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between p-5 bg-gradient-to-r from-red-50 to-orange-50 rounded-xl border border-red-100">
            <div>
              <h3 className="font-semibold text-gray-800">Sign Out</h3>
              <p className="text-sm text-slate-500 mt-1">
                End your current session and return to the login page.
                Your data remains safe and accessible upon next login.
              </p>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 transition-all duration-200 shadow-lg shadow-red-500/20 hover:shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loggingOut ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <LogOut size={16} />
              )}
              {loggingOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Settings;
