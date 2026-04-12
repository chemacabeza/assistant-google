import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Mail, Calendar as CalendarIcon, Loader2, ArrowRight } from 'lucide-react';
import { api } from '../api/axios';

const Dashboard = () => {
  const [emails, setEmails] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        
        // 1. Fetch Calendar Events
        const eventsRes = await api.get('/api/calendar/events?maxResults=3');
        if (eventsRes.data && eventsRes.data.items) {
          setEvents(eventsRes.data.items);
        }

        // 2. Fetch Recent Emails (Map through IDs for details)
        const msgRes = await api.get('/api/gmail/messages?maxResults=3');
        if (msgRes.data && msgRes.data.messages) {
          const emailPromises = msgRes.data.messages.map(async (msgStub) => {
            try {
              const detailRes = await api.get(`/api/gmail/messages/${msgStub.id}`);
              const d = detailRes.data;
              const headers = d.payload?.headers || [];
              let subject = '(No Subject)';
              let from = 'Unknown Sender';
              
              headers.forEach(h => {
                if (h.name.toLowerCase() === 'subject') subject = h.value;
                if (h.name.toLowerCase() === 'from') {
                  // Clean up standard email format "Name <email@dest.com>"
                  from = h.value.split('<')[0].trim();
                }
              });
              
              return { id: d.id, subject, from, snippet: d.snippet };
            } catch (e) {
              return null;
            }
          });
          
          let fullEmails = await Promise.all(emailPromises);
          // Filter out failed stubs
          setEmails(fullEmails.filter(e => e !== null));
        }
      } catch (err) {
        console.error("Failed to load dashboard sync:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  return (
    <div className="h-full flex flex-col space-y-6">
      
      {/* Header Context */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-blue-50 p-3 rounded-lg text-blue-500">
            <LayoutDashboard className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">System Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Platform overview and communication summary</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 max-h-full">
        
        {/* Emails Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center gap-3 bg-slate-50/50">
            <Mail className="text-slate-600" size={20} />
            <h2 className="font-semibold text-gray-700">Recent Inbox Activity</h2>
          </div>
          
          <div className="p-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p>Syncing Gmail...</p>
              </div>
            ) : emails.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No recent emails found.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {emails.map(email => (
                  <div key={email.id} className="p-5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between mb-1">
                      <span className="font-medium text-gray-800 truncate pr-4">{email.from}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-1 line-clamp-1">{email.subject}</h3>
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{email.snippet}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Calendar Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center gap-3 bg-slate-50/50">
            <CalendarIcon className="text-slate-600" size={20} />
            <h2 className="font-semibold text-gray-700">Upcoming Schedule</h2>
          </div>

          <div className="p-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p>Syncing Calendar...</p>
              </div>
            ) : events.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No upcoming meetings.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {events.map((event, idx) => {
                  const startTime = event.start?.dateTime ? new Date(event.start.dateTime) : (event.start?.date ? new Date(event.start.date) : null);
                  return (
                    <div key={event.id || idx} className="p-5 hover:bg-slate-50 transition-colors flex items-start gap-4">
                      <div className="flex flex-col items-center justify-center bg-blue-50 border border-blue-100 rounded-lg p-2 min-w-[60px] text-blue-600">
                        <span className="text-xs uppercase font-bold tracking-wider">{startTime ? startTime.toLocaleString('default', { month: 'short' }) : 'All'}</span>
                        <span className="text-xl font-bold leading-none my-0.5">{startTime ? startTime.getDate() : 'Day'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-800 line-clamp-1 mb-1">{event.summary || 'Busy'}</h3>
                        {startTime && (
                          <div className="flex items-center text-xs text-slate-500 gap-1.5">
                            <span>{startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            {event.location && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                <span className="truncate">{event.location}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    
    </div>
  );
};

export default Dashboard;
