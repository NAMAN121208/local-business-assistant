'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  HelpCircle,
  Sparkles,
  Mic,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  PlayCircle,
  RefreshCw,
  PlusCircle,
  MinusCircle,
  FileDiff,
} from 'lucide-react';

interface EscalationItem {
  id: string;
  conversationId: string;
  reason: string;
  aiSummary: string;
  lastCustomerMessage: string;
  lastBotReply: string;
  createdAt: string;
}

function UnansweredQuestionsContent() {
  const searchParams = useSearchParams();
  const prefilledQuery = searchParams.get('query') || '';

  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState(prefilledQuery);
  const [correctionText, setCorrectionText] = useState(
    'If someone asks about Sunday, we are closed except for emergencies, and the emergency number is the same as the clinic number.'
  );
  const [loadingList, setLoadingList] = useState(true);
  const [correcting, setCorrecting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [replaying, setReplaying] = useState(false);

  // Result state
  const [diffResult, setDiffResult] = useState<any>(null);
  const [approvedVersion, setApprovedVersion] = useState<any>(null);
  const [replayResult, setReplayResult] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const fetchEscalations = async () => {
    try {
      const res = await fetch('/api/owner/escalations');
      if (res.ok) {
        const data = await res.json();
        setEscalations(data.escalations || []);
        if (!selectedQuestion && data.escalations.length > 0) {
          setSelectedQuestion(data.escalations[0].lastCustomerMessage);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchEscalations();
  }, []);

  const handleComputeDiff = async () => {
    if (!correctionText.trim()) return;

    setCorrecting(true);
    setStatusMessage('');
    setDiffResult(null);
    setApprovedVersion(null);
    setReplayResult(null);

    try {
      const res = await fetch('/api/owner/kb/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correctionText,
          customerMessage: selectedQuestion,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setDiffResult(data);
      } else {
        setStatusMessage(`Error: ${data.error || 'Failed to process correction'}`);
      }
    } catch (err: any) {
      setStatusMessage('Network error while processing correction.');
    } finally {
      setCorrecting(false);
    }
  };

  const handleApprove = async () => {
    if (!diffResult?.updatedContent) return;

    setApproving(true);
    try {
      const res = await fetch('/api/owner/kb/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: diffResult.updatedContent,
          rawSourceText: `Owner correction: "${correctionText}"`,
          changelog: diffResult.differences,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setApprovedVersion(data.version);
        setStatusMessage(`✅ Knowledge Base Version ${data.version.version} is now LIVE!`);
      } else {
        setStatusMessage(`Error: ${data.error || 'Failed to approve version'}`);
      }
    } catch (err: any) {
      setStatusMessage('Network error while approving.');
    } finally {
      setApproving(false);
    }
  };

  const handleReplay = async () => {
    if (!selectedQuestion) return;

    setReplaying(true);
    try {
      const res = await fetch('/api/owner/kb/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageText: selectedQuestion,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setReplayResult(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReplaying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-teal-600" />
          Voice-Dictated Correction Loop
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          The core Wispr demo: Review questions the bot escalated or couldn&apos;t answer, dictate a correction by voice, verify the diff, and replay the answer.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Unanswered Questions Queue */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center justify-between">
            <span>Unanswered / Escalated Inquiries</span>
            <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
              {escalations.length} items
            </span>
          </h2>

          {loadingList ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading escalations...</div>
          ) : escalations.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No open escalations currently. You can type any sample inquiry below.
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {escalations.map((esc) => {
                const isSelected = selectedQuestion === esc.lastCustomerMessage;
                return (
                  <button
                    key={esc.id}
                    onClick={() => {
                      setSelectedQuestion(esc.lastCustomerMessage);
                      setDiffResult(null);
                      setApprovedVersion(null);
                      setReplayResult(null);
                    }}
                    className={`w-full text-left p-3 rounded-xl border text-xs transition ${
                      isSelected
                        ? 'bg-teal-50 border-teal-500 shadow-sm'
                        : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-semibold text-slate-900 line-clamp-2">
                      &quot;{esc.lastCustomerMessage || 'No text'}&quot;
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                      <span className="text-amber-700 font-medium truncate max-w-[150px]">
                        {esc.reason}
                      </span>
                      <span>
                        {new Date(esc.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Custom Question Input */}
          <div className="pt-3 border-t border-slate-100">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Target Question to Fix:
            </label>
            <input
              type="text"
              value={selectedQuestion}
              onChange={(e) => setSelectedQuestion(e.target.value)}
              placeholder="e.g. Aaj shop khula hai kya?"
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Right Column: Wispr Voice Correction & Diff Workflow */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dictation Box */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Mic className="w-4 h-4 text-teal-600" />
                Dictate Knowledge Base Fix (Wispr Flow)
              </label>
              <span className="text-[11px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full font-medium">
                Hold Hotkey & Speak
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Press your Wispr Flow hotkey and dictate the business update naturally. Antigravity will extract the precise fact changes without inventing anything else.
            </p>

            <textarea
              rows={3}
              value={correctionText}
              onChange={(e) => setCorrectionText(e.target.value)}
              placeholder="Dictate your fix... e.g.: If someone asks about Sunday, we are closed except for emergencies, and the emergency number is the same as the clinic number."
              className="w-full text-sm border border-slate-300 rounded-xl p-3.5 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50/50"
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400">
                Safety rules in code prevent accidental removal of medical guardrails.
              </span>
              <button
                onClick={handleComputeDiff}
                disabled={correcting || !correctionText.trim()}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{correcting ? 'Analyzing with LLM...' : 'Generate Field-Level Diff'}</span>
              </button>
            </div>
          </div>

          {/* Status Alert */}
          {statusMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium">
              {statusMessage}
            </div>
          )}

          {/* Diff Result Card */}
          {diffResult && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileDiff className="w-4 h-4 text-teal-600" />
                  Proposed Knowledge Base Diff (Before vs After)
                </h3>
                <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  Generated by: {diffResult.provider}
                </span>
              </div>

              {diffResult.differences.length === 0 ? (
                <div className="p-4 bg-slate-50 text-slate-500 text-xs rounded-xl text-center">
                  No structural differences detected from this dictation.
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {diffResult.differences.map((diff: any, idx: number) => {
                    const isAdded = diff.changeType === 'added';
                    const isRemoved = diff.changeType === 'removed';

                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border text-xs flex items-start gap-3 ${
                          diff.isSafetyRelated
                            ? 'bg-amber-50/80 border-amber-300'
                            : isAdded
                            ? 'bg-emerald-50/60 border-emerald-200'
                            : isRemoved
                            ? 'bg-rose-50/60 border-rose-200'
                            : 'bg-blue-50/60 border-blue-200'
                        }`}
                      >
                        {isAdded && <PlusCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />}
                        {isRemoved && <MinusCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />}
                        {!isAdded && !isRemoved && <RefreshCw className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />}

                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-900">{diff.description}</span>
                            {diff.isSafetyRelated && (
                              <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                                Safety Guardrail Verified
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-slate-600">
                            {diff.before && <span className="line-through text-rose-700 mr-2">{String(diff.before)}</span>}
                            {diff.after && <span className="text-emerald-800 font-semibold">{String(diff.after)}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action: Approve */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-500">
                  Approving creates an immutable version and applies it immediately to customer chat.
                </span>
                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{approving ? 'Activating...' : 'Approve & Activate Version'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Replay Verification Card */}
          {approvedVersion && (
            <div className="bg-emerald-900 text-white rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    Knowledge Base Version {approvedVersion.version} is Live!
                  </h3>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    Click below to replay &quot;{selectedQuestion}&quot; through the live bot and view the corrected response.
                  </p>
                </div>
                <button
                  onClick={handleReplay}
                  disabled={replaying}
                  className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-slate-900 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md transition disabled:opacity-50"
                >
                  <PlayCircle className="w-4 h-4 text-slate-900" />
                  <span>{replaying ? 'Replaying...' : 'Replay This Question Now'}</span>
                </button>
              </div>

              {replayResult && (
                <div className="mt-4 p-4 bg-emerald-950/80 rounded-xl border border-emerald-700 space-y-2">
                  <div className="text-[10px] uppercase font-bold text-emerald-300 flex items-center justify-between">
                    <span>New Live Bot Output:</span>
                    <span className="font-mono text-emerald-400">
                      decision: {replayResult.decision} • provider: {replayResult.provider}
                    </span>
                  </div>
                  <p className="text-sm text-emerald-50 whitespace-pre-wrap leading-relaxed">
                    {replayResult.replyText}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UnansweredQuestionsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm text-slate-400">Loading workspace...</div>}>
      <UnansweredQuestionsContent />
    </Suspense>
  );
}
