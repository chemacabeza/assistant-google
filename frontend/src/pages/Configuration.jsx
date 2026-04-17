import React, { useState, useEffect } from 'react';
import { Settings, Save, ExternalLink, Key, ToggleLeft, ToggleRight, Type, Shield, Map, Brain, Mail, Calendar, Users, MessageSquare, Loader2 } from 'lucide-react';
import { api } from '../api/axios';

const UI_STORAGE_KEY = 'assistant_ui_config';

const defaultConfig = {
  appName: 'Personal AI Assistant',
  emailInvitees: true,
  apiKeys: {
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    OPENAI_API_KEY: '',
    VITE_GOOGLE_MAPS_API_KEY: '',
    WHATSAPP_PHONE_NUMBER: '',
  },
};

const Configuration = () => {
  const [config, setConfig] = useState(defaultConfig);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [visibleKeys, setVisibleKeys] = useState({});

  // Load config on mount: UI settings from localStorage, API keys from backend .env
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // Load UI-only settings from localStorage
        let uiConfig = {};
        try {
          const stored = localStorage.getItem(UI_STORAGE_KEY);
          if (stored) uiConfig = JSON.parse(stored);
        } catch (e) { /* ignore */ }

        // Load API keys from backend .env file
        const res = await api.get('/api/config/env');
        const envKeys = res.data || {};

        setConfig({
          appName: uiConfig.appName || defaultConfig.appName,
          emailInvitees: uiConfig.emailInvitees !== undefined ? uiConfig.emailInvitees : defaultConfig.emailInvitees,
          apiKeys: {
            GOOGLE_CLIENT_ID: envKeys.GOOGLE_CLIENT_ID || '',
            GOOGLE_CLIENT_SECRET: envKeys.GOOGLE_CLIENT_SECRET || '',
            OPENAI_API_KEY: envKeys.OPENAI_API_KEY || '',
            VITE_GOOGLE_MAPS_API_KEY: envKeys.VITE_GOOGLE_MAPS_API_KEY || '',
            WHATSAPP_PHONE_NUMBER: envKeys.WHATSAPP_PHONE_NUMBER || '',
          },
        });
      } catch (e) {
        console.error('Failed to load configuration:', e);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg('');
    try {
      // Save UI settings to localStorage
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({
        appName: config.appName,
        emailInvitees: config.emailInvitees,
      }));

      // Save API keys to backend .env file
      const res = await api.post('/api/config/env', config.apiKeys);
      if (res.data?.success) {
        setSaved(true);
        setStatusMsg(res.data.message || 'Saved successfully');
        setTimeout(() => { setSaved(false); setStatusMsg(''); }, 4000);
      } else {
        setStatusMsg(res.data?.message || 'Save failed');
      }
    } catch (e) {
      console.error('Failed to save configuration:', e);
      setStatusMsg('Error saving configuration: ' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  const toggleKeyVisibility = (keyName) => {
    setVisibleKeys(prev => ({ ...prev, [keyName]: !prev[keyName] }));
  };

  const googleApis = [
    {
      name: 'Gmail API',
      description: 'Read, compose, and send emails from Gmail',
      icon: <Mail size={18} />,
      url: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
      color: 'text-red-500',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-100',
    },
    {
      name: 'Google Calendar API',
      description: 'Manage calendar events and schedules',
      icon: <Calendar size={18} />,
      url: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-100',
    },
    {
      name: 'People API',
      description: 'Access Google Contacts to resolve names to emails',
      icon: <Users size={18} />,
      url: 'https://console.cloud.google.com/apis/library/people.googleapis.com',
      color: 'text-green-500',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-100',
    },
    {
      name: 'Maps Directions API',
      description: 'Calculate driving routes and durations',
      icon: <Map size={18} />,
      url: 'https://console.cloud.google.com/apis/library/directions-backend.googleapis.com',
      color: 'text-amber-500',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-100',
    },
    {
      name: 'Maps JavaScript API',
      description: 'Render interactive maps in the browser',
      icon: <Map size={18} />,
      url: 'https://console.cloud.google.com/apis/library/maps-backend.googleapis.com',
      color: 'text-teal-500',
      bgColor: 'bg-teal-50',
      borderColor: 'border-teal-100',
    },
    {
      name: 'Places API',
      description: 'Autocomplete and place search functionality',
      icon: <Map size={18} />,
      url: 'https://console.cloud.google.com/apis/library/places-backend.googleapis.com',
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-100',
    },
  ];

  const apiKeyMeta = [
    { key: 'GOOGLE_CLIENT_ID', label: 'Google Client ID', icon: <Shield size={16} />, hint: 'OAuth 2.0 Client ID from Google Cloud Console' },
    { key: 'GOOGLE_CLIENT_SECRET', label: 'Google Client Secret', icon: <Shield size={16} />, hint: 'OAuth 2.0 Client Secret' },
    { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', icon: <Brain size={16} />, hint: 'Secret key from platform.openai.com' },
    { key: 'VITE_GOOGLE_MAPS_API_KEY', label: 'Google Maps API Key', icon: <Map size={16} />, hint: 'API key with Maps JavaScript & Directions APIs enabled' },
    { key: 'WHATSAPP_PHONE_NUMBER', label: 'WhatsApp Owner Phone', icon: <MessageSquare size={16} />, hint: 'Your phone number in international format (+33 652846353)' },
  ];

  return (
    <div className="min-h-full flex flex-col space-y-6 pb-8">

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-violet-50 p-3 rounded-lg text-violet-500">
            <Settings className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Configuration</h1>
            <p className="text-sm text-slate-500 mt-1">Manage your assistant's identity, behavior, and API connections</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all duration-300 ${
            saved
              ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
              : 'bg-violet-600 text-white hover:bg-violet-700 shadow-lg shadow-violet-500/30 hover:shadow-violet-500/40'
          }`}
          disabled={saving}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Configuration'}
        </button>
      </div>

      {/* Status Message */}
      {statusMsg && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
          saved ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          {statusMsg}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            <p className="text-sm text-slate-500">Loading configuration from .env...</p>
          </div>
        </div>
      ) : (
      <>
      {/* General Settings Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-slate-50/50">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <Type size={18} className="text-violet-500" />
            General Settings
          </h2>
        </div>
        <div className="p-6 space-y-6">

          {/* App Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Application Name</label>
            <input
              type="text"
              value={config.appName}
              onChange={(e) => setConfig(prev => ({ ...prev, appName: e.target.value }))}
              className="w-full max-w-md bg-slate-50 border border-gray-200 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              placeholder="Personal AI Assistant"
            />
            <p className="text-xs text-slate-400 mt-1.5">This name will be displayed in the sidebar header</p>
          </div>

          {/* Email Invitees Toggle */}
          <div className="flex items-center justify-between max-w-md p-4 bg-slate-50 rounded-lg border border-gray-100">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email Calendar Invitees</label>
              <p className="text-xs text-slate-400 mt-0.5">Automatically send invitation emails to event attendees</p>
            </div>
            <button
              onClick={() => setConfig(prev => ({ ...prev, emailInvitees: !prev.emailInvitees }))}
              className="transition-all duration-200"
            >
              {config.emailInvitees ? (
                <ToggleRight size={36} className="text-violet-500" />
              ) : (
                <ToggleLeft size={36} className="text-slate-300" />
              )}
            </button>
          </div>

        </div>
      </div>

      {/* API Keys Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <Key size={18} className="text-amber-500" />
            API Keys
          </h2>
          <span className="text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-medium">Synced with .env file</span>
        </div>
        <div className="p-6 space-y-5">
          {apiKeyMeta.map(({ key, label, icon, hint }) => (
            <div key={key}>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                {icon}
                {label}
                <code className="ml-1 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">{key}</code>
              </label>
              <div className="flex gap-2 max-w-2xl">
                <input
                  type={visibleKeys[key] ? 'text' : 'password'}
                  value={config.apiKeys[key]}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    apiKeys: { ...prev.apiKeys, [key]: e.target.value }
                  }))}
                  className="flex-1 bg-slate-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-mono text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  placeholder={`Enter your ${label}...`}
                />
                <button
                  onClick={() => toggleKeyVisibility(key)}
                  className="px-3 py-2 text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-gray-200"
                >
                  {visibleKeys[key] ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">{hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Enable Google APIs Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-slate-50/50">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <Shield size={18} className="text-blue-500" />
            Enable Google APIs
          </h2>
          <p className="text-xs text-slate-400 mt-1">Click each button to open the API in the Google Cloud Console and enable it for your project</p>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {googleApis.map((api) => (
            <a
              key={api.name}
              href={api.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`group flex items-start gap-3 p-4 rounded-xl border ${api.borderColor} ${api.bgColor} hover:shadow-md transition-all duration-200 hover:-translate-y-0.5`}
            >
              <div className={`p-2 rounded-lg bg-white shadow-sm ${api.color}`}>
                {api.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-gray-800">{api.name}</span>
                  <ExternalLink size={12} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{api.description}</p>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* External Links Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-slate-50/50">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <ExternalLink size={18} className="text-indigo-500" />
            External Resources
          </h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* OpenAI API Keys Link */}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-4 p-5 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="p-3 bg-white rounded-xl shadow-sm">
              <Brain size={24} className="text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800">OpenAI API Keys</span>
                <ExternalLink size={14} className="text-slate-400 group-hover:text-emerald-500 transition-colors" />
              </div>
              <p className="text-xs text-slate-500 mt-1">Create and manage your OpenAI API keys at platform.openai.com</p>
              <code className="inline-block mt-1.5 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-mono font-semibold">→ OPENAI_API_KEY</code>
            </div>
          </a>

          {/* Google Maps API Key Link */}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-4 p-5 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="p-3 bg-white rounded-xl shadow-sm">
              <Key size={24} className="text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800">Google Maps API Key</span>
                <ExternalLink size={14} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
              </div>
              <p className="text-xs text-slate-500 mt-1">Create an API key with Maps JavaScript, Directions & Places APIs enabled</p>
              <code className="inline-block mt-1.5 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-mono font-semibold">→ VITE_GOOGLE_MAPS_API_KEY</code>
            </div>
          </a>

          {/* Google OAuth Consent Screen */}
          <a
            href="https://console.cloud.google.com/apis/credentials/consent"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-4 p-5 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="p-3 bg-white rounded-xl shadow-sm">
              <Shield size={24} className="text-orange-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800">OAuth Consent Screen</span>
                <ExternalLink size={14} className="text-slate-400 group-hover:text-orange-500 transition-colors" />
              </div>
              <p className="text-xs text-slate-500 mt-1">Configure the OAuth consent screen and scopes for your app</p>
              <div className="flex gap-1.5 mt-1.5">
                <code className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-mono font-semibold">→ GOOGLE_CLIENT_ID</code>
                <code className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-mono font-semibold">→ GOOGLE_CLIENT_SECRET</code>
              </div>
            </div>
          </a>

          {/* Google Cloud Console Landing */}
          <a
            href="https://console.cloud.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-4 p-5 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="p-3 bg-white rounded-xl shadow-sm shrink-0">
              <MessageSquare size={24} className="text-violet-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800">Google Cloud Console</span>
                <ExternalLink size={14} className="text-slate-400 group-hover:text-violet-500 transition-colors" />
              </div>
              <p className="text-xs text-slate-500 mt-1 mb-2">Enable the following APIs in your Google Cloud project:</p>
              <div className="flex flex-wrap gap-1.5">
                <code className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-mono font-semibold">Gmail API</code>
                <code className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-mono font-semibold">Calendar API</code>
                <code className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-mono font-semibold">People API</code>
                <code className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-mono font-semibold">Directions API</code>
                <code className="text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-mono font-semibold">Maps JavaScript API</code>
                <code className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-mono font-semibold">Places API</code>
              </div>
            </div>
          </a>

        </div>
      </div>

      </>
      )}

    </div>
  );
};

export default Configuration;
