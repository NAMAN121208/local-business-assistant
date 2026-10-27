'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  ShieldAlert,
  CheckCircle2,
  Send,
  Sparkles,
  Info,
  Clock,
  HelpCircle,
  Stethoscope,
} from 'lucide-react';

export default function ConversationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchThread = async () => {
    try {
      const res = await fetch(`/api/owner/conversations/${id}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json.escalation?.suggested_reply && !replyText) {
          setReplyText(json.escalation.suggested_reply);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThread();
    const interval = setInterval(fetchThread, 4000);
    return () => clearInterval(interval);
  }, [id]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch(`/api/owner/conversations/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText.trim() }),
      });
      if (res.ok) {
        setReplyText('');
        await fetchThread();
      }
    } finally {
      setSending(false);
    }
  };

  const handleResolve = async () => {
    if (resolving) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/owner/conversations/${id}/resolve`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchThread();
      }
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
        <div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin mx-auto mb-2"></div>
        <p className="text-sm text-slate-500">Loading conversation history...</p>
      </div>
    );
  }

  if (!data || !data.conversation) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
        <p className="text-slate-600">Conversation not found.</p>
        <Link href="/owner/inbox" className="text-teal-600 text-sm font-medium mt-2 inline-block">
          ← Back to Inbox
        </Link>
      </div>
    );
  }

  const { conversation, customer, messages = [], escalation } = data;
  const customerName = customer?.name || 'Anonymous Patient';
  const customerContact = customer?.contact || 'Web Chat';

  const lastCustomerQuery = Array.isArray(messages)
    ? [...messages].reverse().find((m: any) => m.sender === 'customer')?.text || ''
    : '';

  return (
    <div className="space-y-6">
      {/* Back button & Conversation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <Link
            href="/owner/inbox"
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">{customerName}</h1>
              <span className="text-xs text-slate-400">({customerContact})</span>
              {conversation.status === 'needs_human' && (
                <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-200 animate-pulse">
                  Needs Human Attention
                </span>
              )}
              {conversation.status === 'resolved' && (
                <span className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  Resolved
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Channel: <span className="font-mono uppercase">{conversation.channel}</span> • ID:{' '}
              <span className="font-mono">{conversation.id}</span>
            </p>
          </div>
        </div>

        {/* Status Actions */}
        <div className="flex items-center gap-2">
          {conversation.status !== 'resolved' ? (
            <button
              onClick={handleResolve}
              disabled={resolving}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {resolving ? 'Resolving...' : 'Mark as Resolved'}
            </button>
          ) : (
            <span className="text-xs text-slate-500 font-medium px-2 py-1 bg-slate-100 rounded">
              Thread Resolved
            </span>
          )}
        </div>
      </div>

      {/* Escalation Alert Card if present */}
      {escalation && (
        <div className="bg-rose-50/90 border border-rose-200 rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-rose-900">
                  Escalation Trigger: {escalation.reason}
                </h3>
                <span className="text-[10px] text-rose-600 font-mono" suppressHydrationWarning>
                  {mounted && escalation.created_at
                    ? new Date(escalation.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
                </span>
              </div>
              <p className="text-xs text-rose-800">
                <strong>AI Summary:</strong> {escalation.ai_summary}
              </p>
              {escalation.suggested_reply && (
                <p className="text-xs text-rose-700 italic bg-white/70 p-2 rounded-lg border border-rose-200/60 mt-1">
                  💡 <strong>Suggested Reply:</strong> &quot;{escalation.suggested_reply}&quot;
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full Thread Viewer */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
          Conversation Messages
        </h2>

        <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
          {Array.isArray(messages) &&
            messages.map((m: any) => {
              const isUser = m.sender === 'customer';
              const isOwner = m.sender === 'owner';
              const timeDisplay =
                mounted && m.created_at
                  ? new Date(m.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '';

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${
                    isOwner ? 'items-end' : isUser ? 'items-start' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed shadow-sm ${
                      isOwner
                        ? 'bg-emerald-900 text-white rounded-br-none'
                        : isUser
                        ? 'bg-slate-100 text-slate-900 rounded-bl-none border border-slate-200'
                        : 'bg-white text-slate-800 border-2 border-teal-500/70 rounded-bl-none'
                    }`}
                  >
                    {isOwner && (
                      <div className="text-[10px] font-semibold text-emerald-200 mb-1 flex items-center gap-1">
                        <Stethoscope className="w-3 h-3" /> Clinic Staff (Owner)
                      </div>
                    )}
                    {m.sender === 'bot' && (
                      <div className="text-[10px] font-semibold text-teal-700 mb-1 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Clinic Bot
                      </div>
                    )}
                    {m.text}
                  </div>

                  {/* Metadata inspection */}
                  <div className="flex items-center gap-2 mt-1 px-1 text-[10px] text-slate-400">
                    <span suppressHydrationWarning>{timeDisplay}</span>

                    {m.sender === 'bot' && (
                      <>
                        {m.intent && (
                          <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">
                            intent:{m.intent}
                          </span>
                        )}
                        {m.decision && (
                          <span
                            className={`font-semibold px-1 py-0.5 rounded ${
                              m.decision === 'answer'
                                ? 'bg-emerald-50 text-emerald-700'
                                : m.decision === 'act'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            decision:{m.decision}
                          </span>
                        )}
                        {m.provider && (
                          <span className="font-mono bg-teal-50 text-teal-700 px-1 py-0.5 rounded border border-teal-200">
                            {m.provider}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Owner Reply Form */}
        <form onSubmit={handleSendReply} className="pt-4 border-t border-slate-100 space-y-3">
          <label className="block text-xs font-semibold text-slate-700">
            Reply as Clinic Staff to Customer
          </label>
          <div className="flex gap-2">
            <textarea
              rows={2}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type or voice dictate your reply with Wispr Flow..."
              className="flex-1 text-sm border border-slate-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50/50"
            />
            <button
              type="submit"
              disabled={sending || !replyText.trim()}
              className="px-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Sending...' : 'Send'}</span>
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Customer chat updates live via polling.</span>
            {lastCustomerQuery && (
              <Link
                href={`/owner/unanswered?query=${encodeURIComponent(lastCustomerQuery)}`}
                className="text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 hover:underline"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Dictate permanent KB fix for this inquiry →
              </Link>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
