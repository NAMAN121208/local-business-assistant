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

  const backupKey = process.env.GROQ_API_KEY || process.env.XAI_API_KEY;
  const isGroqBackup = backupKey?.startsWith('gsk_') || Boolean(process.env.GROQ_API_KEY);
  const backupConfigured = Boolean(
    backupKey &&
    backupKey !== 'your_xai_grok_api_key_here' &&
    backupKey !== 'your_groq_api_key_here'
  );

  const supabaseConfigured = Boolean(
    process.env.SUPABASE_URL &&
    !process.env.SUPABASE_URL.includes('your-project-id') &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  );

  let supabaseConnected = false;
  let supabaseLatencyMs: number | null = null;
  let supabaseError: string | null = null;

  if (supabaseConfigured && process.env.USE_MEMORY_DB !== 'true') {
    try {
      const start = Date.now();
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL!;
      const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)!;
      const client = createClient(supabaseUrl, supabaseKey);

      const queryPromise = client.from('Business').select('id').limit(1);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Supabase ping timed out (2000ms)')), 2000)
      );

      const res: any = await Promise.race([queryPromise, timeoutPromise]);
      if (res?.error) {
        supabaseError = res.error.message;
      } else {
        supabaseConnected = true;
        supabaseLatencyMs = Date.now() - start;
      }
    } catch (err: any) {
      supabaseError = err.message || 'Supabase connectivity check failed';
    }
  }

  const ownerPasswordConfigured = Boolean(
    process.env.OWNER_PASSWORD && process.env.OWNER_PASSWORD.trim().length > 0
  );
  const sessionSecretConfigured = Boolean(
    process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length > 0
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
      geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
      backupConfigured,
      backupProvider: isGroqBackup ? 'groq' : 'grok',
      backupModel: isGroqBackup
        ? process.env.GROQ_MODEL || 'qwen/qwen3.8-27b'
        : process.env.XAI_MODEL || 'grok-2-latest',
      circuitBreakerEnabled: true,
      failoverEnabled: true,
    },
    database: {
      mode: supabaseConnected ? 'supabase_postgres' : 'in_memory_store',
      supabaseConfigured,
      supabaseConnected,
      supabaseLatencyMs,
      supabaseError,
    },
    ownerConsole: {
      ownerPasswordConfigured,
      sessionSecretConfigured,
      loginReady: ownerPasswordConfigured && sessionSecretConfigured,
      authMethod: 'signed_cookie_hmac_sha256',
    },
  });
}
