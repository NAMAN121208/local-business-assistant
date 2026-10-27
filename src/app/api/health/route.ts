// src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import { getClinicNow } from '@/lib/booking';
import { DEMO_CLINIC_ID, demoClinicBusiness } from '@/lib/kb/demo-clinic';

export async function GET() {
  const now = getClinicNow('Asia/Kolkata');

  const geminiConfigured = Boolean(
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
  );

  const grokConfigured = Boolean(
    process.env.XAI_API_KEY &&
    process.env.XAI_API_KEY !== 'your_xai_grok_api_key_here'
  );

  const supabaseConfigured = Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_URL !== 'https://your-project-id.supabase.co' &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  );

  return NextResponse.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    clinicTimezone: 'Asia/Kolkata',
    clinicNow: `${now.dateStr} ${now.timeStr}`,
    demoClinic: {
      id: DEMO_CLINIC_ID,
      name: demoClinicBusiness.name,
      location: 'Indiranagar, Bengaluru',
    },
    llm: {
      primaryProvider: process.env.PRIMARY_PROVIDER || 'gemini',
      geminiConfigured,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      grokConfigured,
      grokModel: process.env.XAI_MODEL || 'grok-2-latest',
      circuitBreakerEnabled: true,
      failoverEnabled: true,
    },
    database: {
      mode: supabaseConfigured ? 'supabase_postgres' : 'in_memory_store',
      supabaseConfigured,
    },
    ownerConsole: {
      protected: true,
      authMethod: 'signed_cookie_hmac_sha256',
      voiceSetupSupported: true,
    },
  });
}
