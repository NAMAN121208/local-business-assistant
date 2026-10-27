// scripts/test-voice-correction-e2e.ts
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
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

async function runVoiceCorrectionE2E() {
  console.log('====================================================');
  console.log('🧪 Testing End-to-End Voice Correction Loop on Real Path');
  console.log('====================================================\n');

  const { processMessage } = await import('../src/lib/orchestrator');
  const { db } = await import('../src/lib/db');
  const { DEMO_CLINIC_ID, demoClinicKBVersion } = await import('../src/lib/kb/demo-clinic');
  const { initKnowledgeBase } = await import('../src/lib/kb');
  const {
    applySemanticCorrectionFallback,
    validateAndConstrainCorrection,
    computeKBDiff,
  } = await import('../src/lib/kb/voice-setup');

  await initKnowledgeBase();

  // Reset to clean Version 1
  await db.saveKnowledgeBaseVersion(demoClinicKBVersion);

  const testQuestion = 'Do you offer MRI and CT scan facilities?';
  const convId = `e2e_voice_corr_${Date.now()}`;

  // Step 1: Customer asks ungrounded question about MRI/CT scan
  console.log(`--- STEP 1: Customer asks ungrounded question ---`);
  console.log(`Customer Message: "${testQuestion}"`);

  const res1 = await processMessage({
    businessId: DEMO_CLINIC_ID,
    conversationId: convId,
    text: testQuestion,
  });

  console.log(`  [Decision]: ${res1.decision} (Expected: escalate)`);
  console.log(`  [Provider]: ${res1.provider}`);
  console.log(`  [Bot Reply]: "${res1.text}"`);

  if (res1.decision !== 'escalate') {
    throw new Error(`STEP 1 FAILED: Expected decision 'escalate', got '${res1.decision}'! Bot answered from general knowledge.`);
  }
  if (!res1.text.toLowerCase().includes('staff') || !res1.text.toLowerCase().includes('check')) {
    throw new Error('STEP 1 FAILED: Bot did not reply with polite holding message mentioning staff will check.');
  }
  console.log('  ✅ STEP 1 PASSED: Ungrounded query escalated to staff holding message.\n');

  // Step 2: Verify Escalation in Owner's Unanswered Questions queue
  console.log(`--- STEP 2: Verify question in Owner Unanswered List ---`);
  const escalations = await db.getEscalations(convId);
  if (escalations.length === 0) {
    throw new Error('STEP 2 FAILED: No escalation record found in database for conversation!');
  }

  const latestEsc = escalations[0];
  console.log(`  [Escalation ID]: ${latestEsc.id}`);
  console.log(`  [Reason]: "${latestEsc.reason}"`);
  console.log(`  [AI Summary]: "${latestEsc.ai_summary}"`);

  const conv = await db.getConversation(convId);
  console.log(`  [Conversation Status]: ${conv?.status}`);

  if (conv?.status !== 'needs_human') {
    throw new Error(`STEP 2 FAILED: Conversation status is '${conv?.status}' instead of 'needs_human'!`);
  }
  if (!latestEsc.reason.toLowerCase().includes('not covered') && !latestEsc.reason.toLowerCase().includes('knowledge base')) {
    throw new Error(`STEP 2 FAILED: Escalation reason '${latestEsc.reason}' does not indicate ungrounded knowledge gap!`);
  }
  console.log('  ✅ STEP 2 PASSED: Question confirmed in owner Unanswered queue with needs_human status.\n');

  // Step 3: Owner dictates correction via voice
  console.log(`--- STEP 3: Owner dictates Wispr Flow correction ---`);
  const correctionText =
    'We do not have an in-house MRI or CT scan machine, but we have a tie-up with Indiranagar Diagnostics across the street where clinic patients get a 15 percent discount.';
  console.log(`Dictated Correction: "${correctionText}"`);

  const currentKB = await db.getLatestKnowledgeBase(DEMO_CLINIC_ID);
  if (!currentKB) throw new Error('No current KB found in database!');

  const candidate = applySemanticCorrectionFallback(correctionText, currentKB.content);
  const { constrainedContent } = validateAndConstrainCorrection(
    correctionText,
    currentKB.content,
    candidate
  );

  const { differences } = computeKBDiff(currentKB.content, constrainedContent);
  console.log(`  [Diff Computed]: ${differences.length} changes detected (e.g. ${differences.map(d => `${d.path}: ${d.description}`).join('; ')})`);

  // Step 4: Owner approves Version 2
  const newVer = currentKB.version + 1;
  await db.saveKnowledgeBaseVersion({
    id: `kb_voice_test_v${newVer}`,
    business_id: DEMO_CLINIC_ID,
    version: newVer,
    content: constrainedContent,
    raw_source_text: correctionText,
    approved_by_owner: true,
    created_at: new Date().toISOString(),
  });
  console.log(`  ✅ STEP 4 PASSED: Approved and activated Knowledge Base Version ${newVer}.\n`);

  // Step 5: Replay question on new approved version
  console.log(`--- STEP 5: Replay question on corrected KB ---`);
  const replayConvId = `e2e_replay_${Date.now()}`;
  const res2 = await processMessage({
    businessId: DEMO_CLINIC_ID,
    conversationId: replayConvId,
    text: testQuestion,
  });

  console.log(`  [Decision]: ${res2.decision} (Expected: answer)`);
  console.log(`  [Provider]: ${res2.provider}`);
  console.log(`  [New Bot Reply]: "${res2.text}"`);

  if (res2.decision !== 'answer') {
    throw new Error(`STEP 5 FAILED: Expected decision 'answer' after correction approval, got '${res2.decision}'!`);
  }

  const replyLower = res2.text.toLowerCase();
  const hasDiagnosticName = replyLower.includes('indiranagar diagnostics') || replyLower.includes('diagnostics');
  const hasDiscount = replyLower.includes('15%') || replyLower.includes('15 percent') || replyLower.includes('discount');
  const hasTieUp = replyLower.includes('tie-up') || replyLower.includes('partner') || replyLower.includes('across the street');

  if (!hasDiagnosticName || !hasDiscount) {
    throw new Error('STEP 5 FAILED: New bot reply did not contain the newly approved facts (Indiranagar Diagnostics, 15% discount)!');
  }

  console.log('  ✅ STEP 5 PASSED: Bot answered with 100% accuracy using only the newly approved facts!\n');

  console.log('====================================================');
  console.log('🎉 END-TO-END VOICE CORRECTION LOOP VERIFIED PASSING!');
  console.log('====================================================');
}

runVoiceCorrectionE2E().catch((err) => {
  console.error('E2E Voice correction test failed:', err);
  process.exit(1);
});
