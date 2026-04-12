import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, Calendar, Mail } from 'lucide-react';
import { api } from '../api/axios';

const Assistant = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([
    { sender: 'assistant', text: "Hello! I'm your Google Assistant. Try asking me to 'show next meetings' or 'draft an email'.", data: null }
  ]);

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userMessage = query;
    setQuery('');
    setHistory(prev => [...prev, { sender: 'user', text: userMessage, data: null }]);
    setLoading(true);

    try {
      const res = await api.post('/api/assistant/ask', { query: userMessage });
      const intentData = res.data;
      
      let responseText = "Sorry, I couldn't process that.";
      if (intentData.response) {
         responseText = intentData.response;
      }

      setHistory(prev => [...prev, { sender: 'assistant', text: responseText, data: intentData }]);
    } catch (e) {
      setHistory(prev => [...prev, { sender: 'assistant', text: 'Sorry, I encountered an error reaching the backend.', data: null }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col pt-4">
      <div className="mb-6 flex flex-col items-center text-center">
         <div className="bg-blue-100 p-4 rounded-full mb-4">
            <Bot size={48} className="text-blue-600" />
         </div>
         <h1 className="text-3xl font-bold text-gray-800">How can I help you today?</h1>
      </div>

      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden mb-6">
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {history.map((msg, i) => (
            <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-5 py-4 shadow-sm ${
                msg.sender === 'user' 
                  ? 'bg-blue-600 text-white rounded-br-none whitespace-pre-wrap' 
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
              }`}>
                {msg.sender === 'user' ? (
                  msg.text
                ) : (
                  <div className="text-[15px] leading-relaxed">
                    <ReactMarkdown
                       components={{
                         p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
                         h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-2 text-gray-900" {...props} />,
                         h2: ({node, ...props}) => <h2 className="text-base font-bold mb-2 text-gray-900" {...props} />,
                         h3: ({node, ...props}) => <h3 className="text-sm font-bold mb-2 text-gray-900" {...props} />,
                         strong: ({node, ...props}) => <strong className="font-semibold text-gray-900" {...props} />,
                         ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
                         ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
                         li: ({node, ...props}) => <li className="pl-1" {...props} />,
                         hr: ({node, ...props}) => <hr className="my-4 border-gray-200" {...props} />,
                         a: ({node, ...props}) => <a className="text-blue-600 hover:underline font-medium" {...props} />
                       }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                )}
                {msg.data && msg.data.action === 'ERROR' && (
                  <div className="mt-3 text-xs bg-red-100 rounded p-2 overflow-x-auto text-red-900 border border-red-200">
                    <pre>{JSON.stringify(msg.data, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
               <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-bl-none px-5 py-3 flex gap-2">
                 <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                 <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                 <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
               </div>
            </div>
          )}
        </div>
        
        <div className="p-4 bg-white border-t border-gray-100">
          <form onSubmit={handleAsk} className="relative flex items-center">
            <input 
              type="text" 
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ask me anything..." 
              className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-full py-4 pl-6 pr-14 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner font-medium"
            />
            <button 
              type="submit" 
              disabled={loading || !query.trim()}
              className="absolute right-2 p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-full transition-colors flex items-center justify-center shadow-md"
            >
              <Send size={18} className="translate-x-[1px]" />
            </button>
          </form>
          <div className="mt-3 flex justify-center gap-4 text-xs text-gray-500 font-medium">
             <button className="flex items-center gap-1 hover:text-blue-600 transition-colors" onClick={() => setQuery("Show my next meetings")}><Calendar size={12}/> Show my next meetings</button>
             <button className="flex items-center gap-1 hover:text-blue-600 transition-colors" onClick={() => setQuery("Draft an email to X")}><Mail size={12}/> Draft an email</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Assistant;
