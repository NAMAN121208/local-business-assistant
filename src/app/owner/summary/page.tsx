'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Calendar,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  CalendarCheck,
  XCircle,
  HelpCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface MetricItem {
  intent?: string;
  question?: string;
  count: number;
}

interface SummaryData {
  id: string;
  business_id: string;
  date: string;
  metrics: {
    totalConversations: number;
    bookingsCreated: number;
    bookingsCancelled: number;
    openEscalations: number;
    autoResolvedCount: number;
    autoResolvedPercent: number;
    escalatedCount: number;
    escalatedPercent: number;
    topIntents: MetricItem[];
    topQuestions: MetricItem[];
  };
  highlights: string;
  unanswered_questions: Array<{
    conversationId: string;
    question: string;
    reason: string;
    createdAt: string;
  }>;
  created_at: string;
}

export default function OwnerSummaryPage() {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [history, setHistory] = useState<SummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchSummary = async (date: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/owner/summary?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary(selectedDate);
  }, [selectedDate]);

  const handleGenerateNow = async () => {
    try {
      setGenerating(true);
      const res = await fetch('/api/owner/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const m = summary?.metrics;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-teal-600" />
            Daily Summary & Analytics
          </h1>
          <p className="text-sm text-slate-500">
            Computed in code from clinic database records (Asia/Kolkata timezone)
          </p>
        </div>

        {/* Date Selector & Generate Action */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm"
            />
          </div>

          <button
            onClick={handleGenerateNow}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Computing...' : 'Generate Now'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center shadow-sm">
          <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Computing clinic metrics for {selectedDate}...</p>
        </div>
      ) : summary ? (
        <>
          {/* Executive Highlights Card */}
          <div className="bg-gradient-to-r from-teal-900 to-slate-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
            <div className="relative z-10 space-y-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                Verified Daily Highlights • {summary.date}
              </span>
              <p className="text-base sm:text-lg text-slate-100 leading-relaxed font-normal">
                {summary.highlights}
              </p>
            </div>
            <div className="absolute right-0 bottom-0 translate-x-8 translate-y-8 w-48 h-48 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />
          </div>

          {/* Metric KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Conversations
              </span>
              <div className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                {m?.totalConversations || 0}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Total active threads today</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Bookings Created
              </span>
              <div className="text-2xl sm:text-3xl font-bold text-teal-600 mt-1 flex items-center gap-2">
                <CalendarCheck className="w-6 h-6" />
                {m?.bookingsCreated || 0}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {m?.bookingsCancelled || 0} cancelled by patients/owner
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Auto-Resolved
              </span>
              <div className="text-2xl sm:text-3xl font-bold text-emerald-600 mt-1 flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6" />
                {m?.autoResolvedPercent || 0}%
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {m?.autoResolvedCount || 0} without human intervention
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Open Escalations
              </span>
              <div className="text-2xl sm:text-3xl font-bold text-amber-600 mt-1 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6" />
                {m?.openEscalations || 0}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {m?.escalatedPercent || 0}% required doctor/staff review
              </p>
            </div>
          </div>

          {/* Top Questions & Unanswered Questions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Customer Questions */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-teal-600" />
                Top Questions Asked
              </h2>
              {m?.topQuestions && m.topQuestions.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {m.topQuestions.map((q, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between text-sm">
                      <span className="text-slate-700 font-medium truncate pr-4">{q.question}</span>
                      <span className="bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded text-xs">
                        {q.count}×
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-sm py-4">No recurring questions recorded for this date.</p>
              )}
            </div>

            {/* Unanswered Questions (Candidates for Voice KB Correction) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-amber-500" />
                  Unanswered / Escalated Questions
                </h2>
                <span className="text-xs font-semibold text-slate-400">
                  {summary.unanswered_questions.length} candidates
                </span>
              </div>

              {summary.unanswered_questions.length > 0 ? (
                <div className="space-y-3">
                  {summary.unanswered_questions.slice(0, 4).map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-1.5"
                    >
                      <div className="text-sm font-semibold text-slate-900">
                        &quot;{item.question}&quot;
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-amber-800">{item.reason}</span>
                        <Link
                          href={`/owner/unanswered?question=${encodeURIComponent(item.question)}`}
                          className="text-teal-700 hover:text-teal-800 font-bold flex items-center gap-1"
                        >
                          Dictate fix <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-sm py-4">
                  All customer queries on this date were answered automatically.
                </p>
              )}
            </div>
          </div>

          {/* Past 7 Days History Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Calendar className="w-5 h-5 text-teal-600" />
                Previous 7 Days History
              </h2>
            </div>
            {history.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Conversations</th>
                      <th className="px-6 py-3">Bookings</th>
                      <th className="px-6 py-3">Escalations</th>
                      <th className="px-6 py-3">Auto-Resolved</th>
                      <th className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-3.5 font-bold text-slate-900">{row.date}</td>
                        <td className="px-6 py-3.5">{row.metrics.totalConversations}</td>
                        <td className="px-6 py-3.5 text-teal-700 font-medium">
                          {row.metrics.bookingsCreated}
                        </td>
                        <td className="px-6 py-3.5 text-amber-700 font-medium">
                          {row.metrics.openEscalations}
                        </td>
                        <td className="px-6 py-3.5">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            {row.metrics.autoResolvedPercent}%
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <button
                            onClick={() => setSelectedDate(row.date)}
                            className="text-xs font-bold text-teal-600 hover:text-teal-700 hover:underline"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">
                No past summaries generated yet. Click &quot;Generate Now&quot; above to save today&apos;s summary.
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
