'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Inbox,
  Clock,
  User,
  ShieldAlert,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  Filter,
} from 'lucide-react';

interface ConversationSummary {
  id: string;
  status: 'open' | 'resolved' | 'needs_human';
  channel: string;
  createdAt: string;
  updatedAt: string;
  customer?: {
    id?: string;
    name?: string;
    contact?: string;
  };
  lastMessage?: {
    text?: string;
    sender?: string;
    createdAt?: string;
  } | null;
  latestDecision?: string;
  latestIntent?: string;
  provider?: string;
}

export default function OwnerInboxPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [filter, setFilter] = useState<'all' | 'needs_human' | 'open' | 'resolved'>('all');
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchConversations = async () => {
    try {
      const url =
        filter === 'all'
          ? '/api/owner/conversations'
          : `/api/owner/conversations?status=${filter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
      } else {
        setConversations([]);
      }
    } catch (e) {
      console.error('Fetch conversations error:', e);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchConversations();
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  return (
    <div className="space-y-6">
      {/* Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Inbox className="w-6 h-6 text-teal-600" />
            Customer Conversation Inbox
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review live chats, monitor decisions made by the bot, and intervene when human review is needed.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl shadow-sm border border-slate-200 self-start sm:self-auto">
          {(['all', 'needs_human', 'open', 'resolved'] as const).map((status) => {
            const label =
              status === 'all'
                ? 'All'
                : status === 'needs_human'
                ? 'Needs Human'
                : status === 'open'
                ? 'Open'
                : 'Resolved';
            const isActive = filter === status;
            return (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversations List */}
      {loading && conversations.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
          <div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-slate-500">Loading conversation threads...</p>
        </div>
      ) : conversations.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
          <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No conversations in this view</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
            {filter === 'needs_human'
              ? 'Great news! No customer chats currently require human attention.'
              : 'Incoming customer chats from the web portal will appear here automatically.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
          {conversations.map((conv) => {
            const customerName = conv.customer?.name || 'Anonymous Patient';
            const customerContact = conv.customer?.contact || 'Web Chat';
            const lastMsgText = conv.lastMessage?.text || 'No messages yet';
            const updatedAtStr = conv.updatedAt || conv.createdAt;
            const timeDisplay =
              mounted && updatedAtStr
                ? new Date(updatedAtStr).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';

            return (
              <Link
                key={conv.id}
                href={`/owner/inbox/${conv.id}`}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition group"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                      <User className="w-4 h-4 text-slate-400" />
                      {customerName}
                    </span>
                    <span className="text-xs text-slate-400">({customerContact})</span>

                    {/* Status Badge */}
                    {conv.status === 'needs_human' && (
                      <span className="bg-rose-50 text-rose-700 border border-rose-200/80 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                        <ShieldAlert className="w-3 h-3" /> Needs Human
                      </span>
                    )}
                    {conv.status === 'open' && (
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        Open
                      </span>
                    )}
                    {conv.status === 'resolved' && (
                      <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
                        Resolved
                      </span>
                    )}

                    {/* Intent & Provider Badges */}
                    {conv.latestIntent && (
                      <span className="bg-slate-100 text-slate-600 font-mono text-[10px] px-2 py-0.5 rounded">
                        {conv.latestIntent}
                      </span>
                    )}
                    {conv.provider && (
                      <span className="bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-mono px-1.5 py-0.5 rounded">
                        {conv.provider}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-slate-600 truncate max-w-2xl">{lastMsgText}</p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-400 flex-shrink-0">
                  <span className="flex items-center gap-1" suppressHydrationWarning>
                    <Clock className="w-3.5 h-3.5" />
                    {timeDisplay}
                  </span>
                  <span className="text-teal-600 group-hover:translate-x-1 transition font-medium flex items-center gap-1">
                    View Thread <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
