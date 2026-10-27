// scripts/test-failover-live.ts
import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

async function runLiveFailoverTest() {
  console.log('====================================================');
  console.log('🔄 Live Provider Failover & Fallback Verification');
  console.log('====================================================\n');

  const { processMessage } = await import('../src/lib/orchestrator');
  const { initKnowledgeBase } = await import('../src/lib/kb');
  const { DEMO_CLINIC_ID } = await import('../src/lib/kb/demo-clinic');
  const { db } = await import('../src/lib/db');

  await initKnowledgeBase();

  const originalGemini = process.env.GEMINI_API_KEY;
  const originalGroq = process.env.GROQ_API_KEY;

  try {
    // Stage 1: Healthy Primary (Gemini)
    console.log('--- STAGE 1: Normal Primary Provider (Gemini) ---');
    const res1 = await processMessage({
      businessId: DEMO_CLINIC_ID,
      conversationId: `failover_stage1_${Date.now()}`,
      text: 'Do you take health insurance or Mediclaim for consultations?',
    });
    console.log(`  Provider: ${res1.provider} | Decision: ${res1.decision}`);
    console.log(`  Reply: ${res1.text.slice(0, 100)}...`);
    if (res1.provider !== 'gemini') {
      throw new Error(`Expected provider 'gemini', got '${res1.provider}'`);
    }
    console.log('  ✅ Stage 1 Passed: Primary answered successfully.\n');

    // Stage 2: Break Gemini -> Failover to Groq
    console.log('--- STAGE 2: Broken Gemini Key -> Automatic Failover to Groq ---');
    process.env.GEMINI_API_KEY = 'invalid_broken_gemini_key_12345';
    const res2 = await processMessage({
      businessId: DEMO_CLINIC_ID,
      conversationId: `failover_stage2_${Date.now()}`,
      text: 'Can my elderly mother come along for the visit into the consultation room?',
    });
    console.log(`  Provider: ${res2.provider} | Decision: ${res2.decision}`);
    console.log(`  Reply: ${res2.text.slice(0, 100)}...`);
    if (res2.provider !== 'grok' && res2.provider !== 'groq') {
      throw new Error(`Expected failover provider 'grok'/'groq', got '${res2.provider}'`);
    }
    console.log('  ✅ Stage 2 Passed: Seamless automatic failover to Groq verified!\n');

    // Stage 3: Break Both Keys -> Graceful Safe Fallback & Escalation
    console.log('--- STAGE 3: Both Keys Broken -> Safe Fallback & Auto-Escalation ---');
    process.env.GROQ_API_KEY = 'invalid_broken_groq_key_12345';
    process.env.XAI_API_KEY = 'invalid_broken_xai_key_12345';
    const convId3 = `failover_stage3_${Date.now()}`;
    const res3 = await processMessage({
      businessId: DEMO_CLINIC_ID,
      conversationId: convId3,
      text: 'Can my elderly mother come along for the visit into the consultation room?',
    });
    console.log(`  Provider: ${res3.provider} | Decision: ${res3.decision}`);
    console.log(`  Reply: ${res3.text.slice(0, 100)}...`);
    if (res3.decision !== 'escalate') {
      throw new Error(`Expected decision 'escalate', got '${res3.decision}'`);
    }

    // Verify escalation was created in DB for this conversation
    const escalations = await db.getEscalations(convId3);
    const hasEsc = escalations.length > 0 && escalations[0].conversation_id === convId3;
    console.log(`  Escalation created in DB: ${hasEsc ? 'YES' : 'NO'}`);
    if (!hasEsc) {
      throw new Error('Safe fallback failed to record an open escalation in the database!');
    }
    console.log('  ✅ Stage 3 Passed: Safe fallback returned and escalation created in DB!\n');

    console.log('====================================================');
    console.log('🎉 ALL 3 FAILOVER STAGES PASSED CLEANLY!');
    console.log('====================================================');
  } finally {
    // Restore original keys
    process.env.GEMINI_API_KEY = originalGemini;
    process.env.GROQ_API_KEY = originalGroq;
  }
}

runLiveFailoverTest().catch((err) => {
  console.error('Failover test error:', err);
  process.exit(1);
});
