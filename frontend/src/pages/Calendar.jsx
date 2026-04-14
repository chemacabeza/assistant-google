import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon, MapPin, Clock, Plus, X } from 'lucide-react';
import { api } from '../api/axios';

const Calendar = () => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [eventData, setEventData] = useState({ summary: '', description: '', startDate: '', startTime: '', endDate: '', endTime: '' });

  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ['calendar_events'],
    queryFn: async () => {
      const res = await api.get('/api/calendar/events', { params: { maxResults: 10 } });
      return res.data?.items || [];
    }
  });

  const createEvent = useMutation({
    mutationFn: async (payload) => {
      const formatDT = (d, t) => `${d}T${t}:00Z`; // UTC for simplicity
      const req = {
        summary: payload.summary,
        description: payload.description,
        start: { dateTime: formatDT(payload.startDate, payload.startTime) },
        end: { dateTime: formatDT(payload.endDate, payload.endTime) }
      };
      return api.post('/api/calendar/events', req);
    },
    onSuccess: () => {
      setIsCreating(false);
      queryClient.invalidateQueries({ queryKey: ['calendar_events'] });
      alert("Event created!");
    }
  });

  const handleCreate = (e) => {
    e.preventDefault();
    createEvent.mutate(eventData);
  };

  const getEventTime = (event) => {
    if (event.start?.dateTime) {
      const d = new Date(event.start.dateTime);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
    if (event.start?.date) {
      return event.start.date + ' (All day)';
    }
    return 'Unknown Time';
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <CalendarIcon className="text-indigo-600" /> Google Calendar
          </h1>
          <p className="text-sm text-gray-500 mt-1">Your upcoming events and agenda.</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> New Event
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <h2 className="font-bold text-slate-400 uppercase tracking-widest text-xs mb-4">Upcoming Schedule</h2>
        
        {isLoading ? (
          <div className="text-center py-12"><div className="animate-spin inline-block w-8 h-8 border-[3px] border-indigo-200 border-t-indigo-600 rounded-full"></div></div>
        ) : (!events || events.length === 0) ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">No upcoming events scheduled.</div>
        ) : (
          <div className="space-y-4">
            {events.map((event, idx) => (
              <div key={event.id || idx} className="bg-white p-5 rounded-xl border border-gray-200 hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-indigo-500">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{event.summary || '(No title)'}</h3>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                    <span className="flex items-center gap-1.5"><Clock size={14} className="text-indigo-400" /> {getEventTime(event)}</span>
                    {event.location && <span className="flex items-center gap-1.5"><MapPin size={14} className="text-red-400" /> {event.location}</span>}
                  </div>
                </div>
                <div className="flex flex-col md:flex-row gap-2 self-start md:self-center">
                  <button 
                    onClick={() => {
                        const targetEmail = window.prompt("Send calendar invite to:", "jleehille@gmail.com");
                        if (!targetEmail) return;

                        const formatToUTC = (dateStr) => {
                            if (!dateStr) return '';
                            return new Date(dateStr).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
                        };

                        const dtstamp = formatToUTC(new Date().toISOString());
                        const dtstart = formatToUTC(event.start?.dateTime || event.start?.date);
                        const dtend = formatToUTC(event.end?.dateTime || event.end?.date || event.start?.dateTime || event.start?.date);
                        
                        const icsBody = [
                            "BEGIN:VCALENDAR",
                            "VERSION:2.0",
                            "PRODID:-//Google Assistant Workspace//EN",
                            "METHOD:REQUEST",
                            "BEGIN:VEVENT",
                            `UID:${event.id || Date.now()}`,
                            `DTSTAMP:${dtstamp}`,
                            `DTSTART:${dtstart}`,
                            `DTEND:${dtend}`,
                            `SUMMARY:${event.summary || 'Meeting'}`,
                            `LOCATION:${event.location || ''}`,
                            `ORGANIZER;CN=chemacabeza:mailto:chemacabeza@gmail.com`,
                            `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${targetEmail}`,
                            "CLASS:PUBLIC",
                            "STATUS:CONFIRMED",
                            "SEQUENCE:0",
                            "END:VEVENT",
                            "END:VCALENDAR"
                        ].join("\r\n");

                        const boundary = "alt_boundary_" + Date.now();
                        let str = `To: ${targetEmail}\r\n`;
                        str += `Subject: Invitation: ${event.summary || 'Meeting'}\r\n`;
                        str += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
                        str += `--${boundary}\r\n`;
                        str += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`;
                        str += `Hi,\n\nYou have been invited to "${event.summary || 'an event'}".\nLink: ${event.htmlLink || ''}\n\nThanks!\r\n\r\n`;
                        str += `--${boundary}\r\n`;
                        str += `Content-Type: text/calendar; method=REQUEST; charset="UTF-8"\r\n\r\n`;
                        str += icsBody + "\r\n\r\n";
                        str += `--${boundary}--`;

                        const b64 = btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                        
                        api.post('/api/gmail/send', { raw: b64 })
                           .then(() => alert('Calendar invite sent successfully!'))
                           .catch(e => alert('Failed to send invite: ' + e));
                    }}
                    className="text-xs font-semibold text-white bg-indigo-600 px-3 py-1.5 rounded flex-shrink-0 hover:bg-indigo-700 transition-colors"
                  >
                    Send Invite
                  </button>
                  {event.htmlLink && (
                    <a href={event.htmlLink} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded flex-shrink-0 hover:bg-indigo-100 transition-colors text-center">
                      View in Calendar
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
             <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
               <h3 className="font-bold text-gray-800 text-lg">Create New Event</h3>
               <button onClick={() => setIsCreating(false)} className="text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 p-1 rounded-full transition-colors"><X size={20} /></button>
             </div>
             <form onSubmit={handleCreate} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Event Title</label>
                  <input required type="text" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" value={eventData.summary} onChange={e => setEventData({...eventData, summary: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                  <textarea className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" rows="2" value={eventData.description} onChange={e => setEventData({...eventData, description: e.target.value})}></textarea>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Start Date</label>
                    <input required type="date" className="w-full border border-gray-300 rounded-lg px-4 py-2" value={eventData.startDate} onChange={e => setEventData({...eventData, startDate: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Start Time (UTC)</label>
                    <input required type="time" className="w-full border border-gray-300 rounded-lg px-4 py-2" value={eventData.startTime} onChange={e => setEventData({...eventData, startTime: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">End Date</label>
                    <input required type="date" className="w-full border border-gray-300 rounded-lg px-4 py-2" value={eventData.endDate} onChange={e => setEventData({...eventData, endDate: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">End Time (UTC)</label>
                    <input required type="time" className="w-full border border-gray-300 rounded-lg px-4 py-2" value={eventData.endTime} onChange={e => setEventData({...eventData, endTime: e.target.value})} />
                  </div>
                </div>
                
                <div className="pt-4 flex justify-end gap-3">
                   <button type="button" onClick={() => setIsCreating(false)} className="px-5 py-2 font-semibold text-gray-600 hover:text-gray-800">Cancel</button>
                   <button type="submit" disabled={createEvent.isPending} className="px-6 py-2 rounded-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">Create</button>
                </div>
             </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Calendar;
