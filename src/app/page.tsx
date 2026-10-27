'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  MapPin,
  Clock,
  PhoneCall,
  ShieldAlert,
  Calendar,
  CheckCircle2,
  Stethoscope,
  UserCheck,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'customer' | 'bot' | 'owner';
  text: string;
  decision?: 'answer' | 'act' | 'escalate';
  intent?: string;
  provider?: string;
  quickReplies?: string[];
  timestamp: string;
}

export default function CustomerChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>('');
  const [convStatus, setConvStatus] = useState<string>('open');
  const [quickReplies, setQuickReplies] = useState<string[]>([
    'What are your clinic timings?',
    'Book appointment tomorrow evening',
    'Where is the clinic located?',
    'What are the consultation fees?',
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Generate or load conversationId from sessionStorage
    let savedId = sessionStorage.getItem('lba_conv_id');
    if (!savedId) {
      savedId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      sessionStorage.setItem('lba_conv_id', savedId);
    }
    setConversationId(savedId);

    // Initial greeting
    setMessages([
      {
        id: 'msg_welcome',
        sender: 'bot',
        text: 'Namaste! Welcome to City Health Clinic (Indiranagar, Bengaluru). I can help you check doctor timings, book an appointment, or answer questions about our clinic services.\n\nHow can I help you today?',
        decision: 'answer',
        provider: 'system',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }, []);

  // Poll for owner replies every 4 seconds
  useEffect(() => {
    if (!conversationId) return;

    const pollMessages = async () => {
      try {
        const res = await fetch(`/api/chat?conversationId=${conversationId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status) setConvStatus(data.status);

          if (data.messages && Array.isArray(data.messages)) {
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id));
              const newMsgs = data.messages
                .filter((m: any) => !existingIds.has(m.id))
                .map((m: any) => ({
                  id: m.id,
                  sender: m.sender,
                  text: m.text,
                  decision: m.decision,
                  intent: m.intent,
                  provider: m.provider,
                  timestamp: new Date(m.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                }));

              if (newMsgs.length > 0) {
                return [...prev, ...newMsgs];
              }
              return prev;
            });
          }
        }
      } catch (e) {
        // quiet poll fail
      }
    };

    const interval = setInterval(pollMessages, 4000);
    return () => clearInterval(interval);
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'customer',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          conversationId,
        }),
      });

      const data = await res.json();

      const botMsg: ChatMessage = {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        text: data.text || 'Thank you. A staff member will respond to your query shortly.',
        decision: data.decision,
        intent: data.intent,
        provider: data.provider,
        quickReplies: data.quickReplies,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
      if (data.quickReplies && data.quickReplies.length > 0) {
        setQuickReplies(data.quickReplies);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot_err_${Date.now()}`,
          sender: 'bot',
          text: 'Sorry, I had trouble reaching our clinic server. Please call us directly at +91 98765 43210.',
          decision: 'escalate',
          provider: 'offline',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-white shadow-xl border-x border-slate-200">
      {/* Clinic Header */}
      <header className="bg-gradient-to-r from-teal-700 to-emerald-700 text-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-lg text-white border border-white/30">
              CH
            </div>
            <div>
              <h1 className="font-bold text-base sm:text-lg leading-tight">City Health Clinic</h1>
              <p className="text-xs text-teal-100 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
                Indiranagar, Bengaluru • Mon-Sat (9am-8pm)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="tel:+919876599999"
              className="flex items-center gap-1 bg-red-500/90 hover:bg-red-600 text-white text-xs px-2.5 py-1.5 rounded-full font-medium transition shadow-sm"
              title="Emergency Call"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Emergency</span>
            </a>
          </div>
        </div>

        {/* Quick Clinic Info Pills */}
        <div className="mt-2.5 pt-2 border-t border-teal-600/60 flex flex-wrap gap-2 text-xs text-teal-100">
          <span className="flex items-center gap-1 bg-teal-800/60 px-2 py-0.5 rounded">
            <Clock className="w-3 h-3 text-teal-300" /> 9am-1pm & 4pm-8pm
          </span>
          <span className="flex items-center gap-1 bg-teal-800/60 px-2 py-0.5 rounded">
            <MapPin className="w-3 h-3 text-teal-300" /> Opp. BDA Complex
          </span>
        </div>
      </header>

      {/* Safety Notice or Human Escalation Banner */}
      {convStatus === 'needs_human' ? (
        <div className="bg-amber-100 border-b border-amber-300 px-3 py-2 text-xs text-amber-900 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-amber-700 flex-shrink-0 animate-pulse" />
          <span>
            <strong>Clinic Staff Alerted:</strong> A member of Dr. Sneha Rao&apos;s team is reviewing your conversation and will reply directly here.
          </span>
        </div>
      ) : (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 text-[11px] text-amber-800 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
          <span>
            <strong>Clinic Logistics & Appointments Only.</strong> For medical emergencies, call +91 98765 99999.
          </span>
        </div>
      )}

      {/* Chat Messages Scroll Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/70">
        {messages.map((m) => {
          const isUser = m.sender === 'customer';
          const isOwner = m.sender === 'owner';

          return (
            <div
              key={m.id}
              className={`flex flex-col ${
                isUser ? 'items-end' : 'items-start'
              }`}
            >
              {/* Message Bubble */}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm whitespace-pre-wrap leading-relaxed ${
                  isUser
                    ? 'bg-teal-600 text-white rounded-br-none'
                    : isOwner
                    ? 'bg-emerald-900 text-white border-2 border-emerald-500 rounded-bl-none shadow-md'
                    : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-none'
                }`}
              >
                {isOwner && (
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-200 mb-1 pb-1 border-b border-emerald-700/60">
                    <Stethoscope className="w-3.5 h-3.5" />
                    <span>Clinic Team (Staff)</span>
                  </div>
                )}
                {m.text}
              </div>

              {/* Message Badges & Timestamps */}
              <div className="flex items-center gap-2 mt-1 px-1 text-[10px] text-slate-400">
                <span suppressHydrationWarning>{m.timestamp}</span>
                {isOwner && (
                  <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 font-medium">
                    Verified Clinic Staff
                  </span>
                )}
                {!isUser && !isOwner && (
                  <>
                    {m.decision === 'answer' && (
                      <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 flex items-center gap-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Answered
                      </span>
                    )}
                    {m.decision === 'act' && (
                      <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60 flex items-center gap-0.5">
                        <Calendar className="w-2.5 h-2.5" /> Booking
                      </span>
                    )}
                    {m.decision === 'escalate' && (
                      <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 flex items-center gap-0.5">
                        <ShieldAlert className="w-2.5 h-2.5" /> Escalated
                      </span>
                    )}
                    {m.provider && (
                      <span className="text-slate-500 font-mono text-[9px] bg-slate-100 px-1 py-0.5 rounded">
                        {m.provider}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-start">
            <div className="bg-white text-slate-500 border border-slate-200 rounded-2xl rounded-bl-none px-4 py-2 text-xs flex items-center gap-2 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce"></span>
              <span
                className="w-2 h-2 rounded-full bg-teal-500 animate-bounce"
                style={{ animationDelay: '0.2s' }}
              ></span>
              <span
                className="w-2 h-2 rounded-full bg-teal-500 animate-bounce"
                style={{ animationDelay: '0.4s' }}
              ></span>
              <span className="text-slate-400 ml-1">Checking clinic records...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Suggested Quick Replies */}
      {quickReplies.length > 0 && !loading && (
        <div className="px-3 py-2 bg-white border-t border-slate-100 flex gap-1.5 overflow-x-auto no-scrollbar">
          {quickReplies.map((qr, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(qr)}
              className="text-xs bg-slate-100 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 text-slate-700 px-3 py-1.5 rounded-full border border-slate-200 flex-shrink-0 transition"
            >
              {qr}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <footer className="p-3 bg-white border-t border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type or voice dictate your message..."
            className="flex-1 bg-slate-100 text-slate-900 border border-slate-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !inputText.trim()}
            className="w-10 h-10 rounded-full bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white flex items-center justify-center transition shadow-sm flex-shrink-0"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5 px-1">
          <span>Wispr Flow Dictation Ready</span>
          <a href="/owner/login" className="hover:text-teal-600 hover:underline">
            Owner Portal →
          </a>
        </div>
      </footer>
    </div>
  );
}
