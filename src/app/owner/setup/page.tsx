'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Mic,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  History,
  FileText,
  ShieldCheck,
  Plus,
  Trash2,
} from 'lucide-react';
import { KnowledgeBaseContent } from '@/lib/db/types';

export default function VoiceSetupPage() {
  const [rawText, setRawText] = useState(
    'City Health Clinic is a neighbourhood family clinic in Indiranagar, Bengaluru. We are open Monday to Saturday from 9 AM to 1 PM and 4 PM to 8 PM. Closed on Sundays except emergencies. Emergency phone is 98765 99999. Consulting doctors are Dr. Sneha Rao for general medicine and Dr. Arvind Kumar for paediatrics. General consultation is 500 rupees, paediatric is 600 rupees, vital checkup is 350. Free cancellation up to 2 hours before appointment. Never prescribe medicines or give medical diagnosis over chat.'
  );

  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [content, setContent] = useState<KnowledgeBaseContent | null>(null);
  const [missingInfo, setMissingInfo] = useState<string[]>([]);
  const [provider, setProvider] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState('');
  const [versions, setVersions] = useState<any[]>([]);

  const fetchVersions = async () => {
    try {
      const res = await fetch('/api/owner/kb/versions');
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchVersions();
  }, []);

  const handleGenerate = async () => {
    if (!rawText.trim()) return;

    setLoading(true);
    setStatusMsg('');

    try {
      const res = await fetch('/api/owner/kb/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      });

      const data = await res.json();
      if (res.ok) {
        setContent(data.content);
        setMissingInfo(data.missingInfo || []);
        setProvider(data.provider || '');
        setStatusMsg('✅ Structured knowledge base extracted successfully. Review and approve below.');
      } else {
        setStatusMsg(`Error: ${data.error || 'Failed to extract knowledge base'}`);
      }
    } catch (err: any) {
      setStatusMsg('Network error while generating knowledge base.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!content) return;

    setApproving(true);
    try {
      const res = await fetch('/api/owner/kb/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          rawSourceText: rawText,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMsg(`🎉 Version ${data.version.version} successfully approved and set as ACTIVE!`);
        await fetchVersions();
      } else {
        setStatusMsg(`Error: ${data.error || 'Failed to approve version'}`);
      }
    } catch (err) {
      setStatusMsg('Failed to approve version.');
    } finally {
      setApproving(false);
    }
  };

  const handleResetDemo = async () => {
    if (resetting) return;
    setResetting(true);
    setStatusMsg('');
    try {
      const res = await fetch('/api/owner/kb/reset-demo', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setContent(data.version.content);
        setMissingInfo([]);
        setStatusMsg('✅ Seeded demo clinic knowledge base restored and activated!');
        await fetchVersions();
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-teal-600" />
            Voice-Dictated Knowledge Base Setup
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Section 7.1: Speak freely about your business with Wispr Flow. Antigravity converts your voice into structured, verified facts without hallucinating.
          </p>
        </div>

        <button
          onClick={handleResetDemo}
          disabled={resetting}
          className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 flex items-center gap-1.5 transition self-start sm:self-auto shadow-sm"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{resetting ? 'Restoring...' : 'Restore Demo Clinic'}</span>
        </button>
      </div>

      {/* Dictation Text Area Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Mic className="w-4 h-4 text-teal-600" />
            Voice Input Area (Wispr Flow)
          </label>
          <span className="text-[11px] bg-teal-50 text-teal-700 font-medium px-2 py-0.5 rounded-full border border-teal-200">
            Wispr Hotkey Ready
          </span>
        </div>

        <div className="p-3 bg-teal-50/70 border border-teal-200/60 rounded-xl text-xs text-teal-900 flex items-start gap-2">
          <Mic className="w-4 h-4 text-teal-700 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Wispr Flow Tip:</strong> Press your Wispr Flow hotkey and speak about your business: hours, services and prices, delivery or booking rules, holidays, and what the bot must never answer.
          </span>
        </div>

        <textarea
          rows={5}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Speak or type your clinic details..."
          className="w-full text-sm border border-slate-300 rounded-xl p-3.5 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50/50 leading-relaxed"
        />

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-slate-400">
            The LLM will parse this into structured entities and highlight any omitted details.
          </span>
          <button
            onClick={handleGenerate}
            disabled={loading || !rawText.trim()}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-sm transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>{loading ? 'Structuring with LLM...' : 'Generate Knowledge Base'}</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-4 bg-teal-50 border border-teal-200 text-teal-900 text-xs rounded-xl font-medium">
          {statusMsg}
        </div>
      )}

      {/* Missing Information Banner if any */}
      {missingInfo.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Omitted Information Detected in Voice Transcript:</span>
          </div>
          <p className="text-[11px] text-amber-800">
            Antigravity refuses to hallucinate facts you didn&apos;t mention. The following items remain blank:
          </p>
          <ul className="list-disc list-inside text-xs text-amber-900 space-y-0.5">
            {missingInfo.map((info, idx) => (
              <li key={idx}>{info}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Structured Editable Form */}
      {content && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Structured Knowledge Base Review
              </h2>
              <p className="text-xs text-slate-500">
                Extracted via: <span className="font-mono text-teal-700 font-semibold">{provider}</span>
              </p>
            </div>
            <button
              onClick={handleApprove}
              disabled={approving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{approving ? 'Activating...' : 'Approve & Save Version'}</span>
            </button>
          </div>

          {/* Facts Section */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Clinic Facts
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Clinic Name
                </label>
                <input
                  type="text"
                  value={content.facts.name || ''}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      facts: { ...content.facts, name: e.target.value },
                    })
                  }
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Primary Phone
                </label>
                <input
                  type="text"
                  value={content.facts.phone || ''}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      facts: { ...content.facts, phone: e.target.value },
                    })
                  }
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Emergency Phone
                </label>
                <input
                  type="text"
                  value={content.facts.emergency_phone || ''}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      facts: { ...content.facts, emergency_phone: e.target.value },
                    })
                  }
                  placeholder="e.g. +91 98765 99999"
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={content.facts.address || ''}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      facts: { ...content.facts, address: e.target.value },
                    })
                  }
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-slate-50"
                />
              </div>
            </div>
          </div>

          {/* Operating Hours Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Operating Hours
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday',
                'Sunday',
              ].map((day) => (
                <div key={day} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-700 block mb-1">{day}</span>
                  <input
                    type="text"
                    value={content.facts.hours?.[day] || ''}
                    onChange={(e) => {
                      const newHours = { ...content.facts.hours, [day]: e.target.value };
                      setContent({
                        ...content,
                        facts: { ...content.facts, hours: newHours },
                      });
                    }}
                    placeholder="e.g. 09:00 AM - 01:00 PM, 04:00 PM - 08:00 PM"
                    className="w-full text-[11px] border border-slate-300 rounded p-1.5 bg-white"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Services Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Services & Consultation Fees
            </h3>
            <div className="space-y-2">
              {content.services.map((srv, idx) => (
                <div
                  key={srv.id || idx}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3 text-xs"
                >
                  <input
                    type="text"
                    value={srv.name}
                    onChange={(e) => {
                      const next = [...content.services];
                      next[idx].name = e.target.value;
                      setContent({ ...content, services: next });
                    }}
                    className="flex-1 font-semibold border border-slate-300 rounded p-1.5 bg-white"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">Duration:</span>
                    <input
                      type="number"
                      value={srv.duration_mins}
                      onChange={(e) => {
                        const next = [...content.services];
                        next[idx].duration_mins = parseInt(e.target.value) || 30;
                        setContent({ ...content, services: next });
                      }}
                      className="w-16 border border-slate-300 rounded p-1.5 bg-white text-center"
                    />
                    <span className="text-slate-400">mins</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">₹</span>
                    <input
                      type="number"
                      value={srv.price || 0}
                      onChange={(e) => {
                        const next = [...content.services];
                        next[idx].price = parseInt(e.target.value) || 0;
                        setContent({ ...content, services: next });
                      }}
                      className="w-20 border border-slate-300 rounded p-1.5 bg-white text-right"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Safety Guardrails Display */}
          <div className="space-y-2 bg-rose-50/60 p-4 rounded-xl border border-rose-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-rose-600" />
              Locked Healthcare Safety Guardrails (never_answer)
            </h3>
            <ul className="list-disc list-inside text-xs text-rose-900 space-y-1">
              {content.never_answer.map((rule, idx) => (
                <li key={idx}>{rule}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Version History List */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <History className="w-4 h-4 text-teal-600" />
          Knowledge Base Version History
        </h2>

        {versions.length === 0 ? (
          <p className="text-xs text-slate-400">No versions recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {versions.map((ver) => (
              <div
                key={ver.id}
                className="py-3 flex items-center justify-between text-xs hover:bg-slate-50 transition px-2 rounded-lg"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 font-mono">v{ver.version}</span>
                    {ver.approved_by_owner ? (
                      <span className="bg-emerald-50 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                        Active & Approved
                      </span>
                    ) : (
                      <span className="bg-amber-50 text-amber-700 text-[10px] font-medium px-2 py-0.5 rounded-full">
                        Draft
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 truncate max-w-lg">
                    {ver.raw_source_text || 'Structured configuration'}
                  </p>
                </div>
                <span className="text-slate-400 text-[11px]" suppressHydrationWarning>
                  {ver.created_at
                    ? new Date(ver.created_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
