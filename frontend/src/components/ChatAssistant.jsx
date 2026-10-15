import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, LoaderCircle, MessageCircle, Send, X } from 'lucide-react';
import api from '../api/axios';
import { formatINR } from '../utils/currency';

const suggestions = ['Trending events', 'Find music events this weekend', 'Show my bookings'];

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi, I can help find events, check your bookings, or answer ticket questions.' },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const sendMessage = async (value = draft) => {
    const content = value.trim();
    if (!content || sending) return;
    const history = messages.slice(-8).map(({ role, content: message }) => ({ role, content: message }));
    setMessages((current) => [...current, { role: 'user', content }]);
    setDraft('');
    setSending(true);
    try {
      const response = await api.post('/chat', { message: content, history });
      setMessages((current) => [...current, {
        role: 'assistant',
        content: response.data.response,
        events: response.data.events,
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        role: 'assistant',
        content: error.response?.data?.detail || 'I could not reach the assistant. Please try again.',
      }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && <section aria-label="SmartEvent assistant" className="mb-3 flex h-[min(70vh,520px)] w-[min(92vw,370px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-slate-950 px-4 py-3 text-white">
          <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-emerald-300" /><h2 className="text-sm font-bold">Event assistant</h2></div>
          <button type="button" aria-label="Close assistant" onClick={() => setOpen(false)} className="rounded p-1 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
          {messages.map((message, index) => <div key={`${index}-${message.role}`} className={message.role === 'user' ? 'ml-8 rounded-lg bg-blue-700 px-3 py-2 text-sm text-white' : 'mr-5 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800'}>
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.events?.length > 0 && <ul className="mt-2 divide-y divide-slate-200">
              {message.events.map((event) => <li key={event.id} className="py-2 first:pt-1 last:pb-0">
                <Link to={`/events/${event.id}`} className="font-semibold text-blue-800 hover:underline">{event.title}</Link>
                <p className="mt-0.5 text-xs text-slate-500">{event.location} · {formatINR(event.ticket_price)}</p>
              </li>)}
            </ul>}
          </div>)}
          {sending && <div role="status" className="flex items-center gap-2 px-2 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Thinking...</div>}
        </div>
        {messages.length < 3 && <div className="flex flex-wrap gap-2 px-3 pb-3">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => sendMessage(suggestion)} className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-blue-500 hover:text-blue-700">{suggestion}</button>)}</div>}
        <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }} className="flex items-center gap-2 border-t border-slate-200 p-3">
          <label htmlFor="assistant-message" className="sr-only">Ask about events or tickets</label>
          <input id="assistant-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} placeholder="Ask about events or tickets" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          <button type="submit" disabled={!draft.trim() || sending} aria-label="Send message" className="rounded-lg bg-blue-700 p-2 text-white hover:bg-blue-800 disabled:opacity-50"><Send className="h-4 w-4" /></button>
        </form>
      </section>}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close event assistant' : 'Open event assistant'} title="Event assistant" className="ml-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:bg-emerald-700">
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
}