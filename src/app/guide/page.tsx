'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Stethoscope,
  Copy,
  Check,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  ExternalLink,
  MessageSquare,
  Lock,
} from 'lucide-react';

export default function GuidePage() {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const sampleMessages = [
    {
      category: 'FAQ (English)',
      text: 'What are your clinic timings and where are you located?',
      description: 'Answers OPD hours (Mon-Sat 9am-1pm & 4pm-8pm) and Indiranagar landmark from KB.',
    },
    {
      category: 'FAQ (Hinglish)',
      text: 'clinic ke timings kya hai aur Dr. Sneha ki consultation fee kitni hai?',
      description: 'Understands mixed Hinglish and quotes exact consultation fee (₹500).',
    },
    {
      category: 'Natural Booking (Hinglish)',
      text: 'kal subah doctor milega kya?',
      description: 'Computes tomorrow morning slots deterministically in code in Asia/Kolkata timezone.',
    },
    {
      category: 'Regional Booking (Kanglish)',
      text: 'naale beligge doctor appointment ideya?',
      description: 'Understands Kannada/Kanglish relative date (naale) and proposes morning slots.',
    },
    {
      category: 'Safety Guardrail (Medical Advice)',
      text: 'mere bachhe ko 102 bukhar hai kaunsi dawa du?',
      description: 'Triggers strict safety guardrail: declines medical advice, shares 24/7 emergency line, escalates.',
    },
    {
      category: 'Voice Correction Candidate (Unknown)',
      text: 'Do you offer MRI and CT scan facilities at the clinic?',
      description: 'Topic not in KB: bot escalates, flags to owner console where owner dictates a fix by voice.',
    },
  ];

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header Banner */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-600 flex items-center justify-center text-white shadow-md">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Judge & Evaluator Guide
              </h1>
              <p className="text-xs font-semibold text-teal-600 tracking-wide uppercase">
                Local Business Assistant • Wispr Challenge (Track 1)
              </p>
            </div>
          </div>

          {/* 5-Line Project Explanation */}
          <div className="p-4 bg-slate-100 rounded-2xl border border-slate-200 text-sm text-slate-700 leading-relaxed space-y-2">
            <p>
              <strong>1. What it is:</strong> A voice-first AI front desk for neighbourhood businesses, demoed on City Health Clinic in Indiranagar, Bengaluru.
            </p>
            <p>
              <strong>2. Core Customer Capability:</strong> Handles multilingual inquiries, checks availability, and books appointments deterministically.
            </p>
            <p>
              <strong>3. Uncompromising Safety:</strong> Never gives clinical advice or diagnoses; sensitive medical queries escalate instantly to human staff.
            </p>
            <p>
              <strong>4. Wispr Flow Voice Loop:</strong> Business owners speak into text fields to generate knowledge bases and correct bot mistakes in seconds.
            </p>
            <p>
              <strong>5. Production Ready:</strong> Built with Next.js App Router, dual LLM failover (Gemini + Grok), and zero-leak auth.
            </p>
          </div>
        </div>

        {/* 6 Sample Messages for Judges */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-teal-600" />
              6 Sample Queries to Try in Customer Chat
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Click any query to copy it directly to your clipboard, then test it in the chat interface.
            </p>
          </div>

          <div className="space-y-4">
            {sampleMessages.map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl border border-slate-200 hover:border-teal-300 transition-all bg-slate-50/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60">
                    {item.category}
                  </span>
                  <button
                    onClick={() => handleCopy(item.text, idx)}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-teal-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs transition"
                  >
                    {copiedIdx === idx ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-sm font-semibold text-slate-900 font-mono bg-white p-2.5 rounded-xl border border-slate-200/80">
                  &quot;{item.text}&quot;
                </p>

                <p className="text-xs text-slate-500">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-sm transition shadow-sm"
            >
              <span>Open Customer Chat Now</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* How to Reach Owner Console */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
            <Lock className="w-5 h-5 text-amber-600" />
            <span>How to Access the Owner Console</span>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            The clinic management console is protected at <code className="bg-slate-100 px-2 py-0.5 rounded text-teal-700 font-mono text-xs">/owner</code> with HMAC-SHA256 signed session cookies.
          </p>

          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1.5">
            <p className="font-bold flex items-center gap-1">
              <ShieldAlert className="w-4 h-4 text-amber-700" />
              Credentials Note for Judges:
            </p>
            <p>
              Owner Console Password: Configured via <code className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-amber-300 text-teal-800">OWNER_PASSWORD</code> in deployment environment variables. Enter your configured password at the login screen to access the <strong>Inbox</strong>, <strong>Voice KB Setup</strong>, <strong>Unanswered Questions</strong>, and <strong>Daily Summary</strong>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link
              href="/owner"
              className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-center font-bold text-sm transition"
            >
              Go to Owner Console (/owner)
            </Link>
            <Link
              href="/api/health"
              target="_blank"
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-center font-semibold text-sm transition flex items-center justify-center gap-1.5"
            >
              <span>Inspect /api/health</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
