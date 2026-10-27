// scripts/test-correction-generality.ts
import { db } from '../src/lib/db';
import { DEMO_CLINIC_ID, demoClinicKBContent } from '../src/lib/kb/demo-clinic';
import {
  applySemanticCorrectionFallback,
  computeKBDiff,
  validateAndConstrainCorrection,
} from '../src/lib/kb/voice-setup';
import { processMessage } from '../src/lib/orchestrator';
import { initKnowledgeBase } from '../src/lib/kb';

async function testCorrectionGenerality() {
  console.log('====================================================');
  console.log('🧪 Testing Correction Loop Generality (Zero Hardcoding)');
  console.log('====================================================\n');

  await initKnowledgeBase();

  const originalKB = await db.getLatestKnowledgeBase(DEMO_CLINIC_ID);
  if (!originalKB) throw new Error('Demo clinic KB not initialized!');

  // Test Correction A: "Saturday we now close at 6 pm"
  console.log('--- TEST A: "Saturday we now close at 6 pm" ---');
  const correctionA = 'Saturday we now close at 6 pm';
  const candidateA = applySemanticCorrectionFallback(correctionA, originalKB.content);
  // Introduce an intentional hallucination to test invariance: Monday hours changed
  candidateA.facts.hours['Monday'] = 'Closed';
  const { constrainedContent: constrainedA, rejectedModifications: rejA } =
    validateAndConstrainCorrection(correctionA, originalKB.content, candidateA);

  const diffA = computeKBDiff(originalKB.content, constrainedA);
  console.log('Computed Diff:');
  diffA.differences.forEach((d) => console.log(`  [${d.changeType.toUpperCase()}] ${d.path}: ${d.description}`));
  console.log('Reverted Hallucinations:', rejA);

  if (constrainedA.facts.hours.Saturday !== '09:00 AM - 01:00 PM, 04:00 PM - 06:00 PM') {
    throw new Error(`Test A Failed: Saturday hours were not updated to 6 PM! Got: ${constrainedA.facts.hours.Saturday}`);
  }
  if (constrainedA.facts.hours.Monday !== originalKB.content.facts.hours.Monday) {
    throw new Error('Test A Failed: Unrelated Monday hours change was not reverted!');
  }

  // Save KB v2 and replay
  await db.saveKnowledgeBaseVersion({
    id: `kb_test_v2_${Date.now()}`,
    business_id: DEMO_CLINIC_ID,
    version: 2,
    content: constrainedA,
    raw_source_text: correctionA,
    approved_by_owner: true,
    created_at: new Date().toISOString(),
  });

  const replayA = await processMessage({
    businessId: DEMO_CLINIC_ID,
    conversationId: `replay_a_${Date.now()}`,
    text: 'What are your Saturday hours?',
  });
  console.log(`Replay Answer: "${replayA.text}"`);
  if (!replayA.text.includes('06:00 PM') && !replayA.text.includes('6:00 PM') && !replayA.text.includes('6 PM')) {
    throw new Error(`Test A Failed: Replay answer did not mention 6:00 PM! Got: "${replayA.text}"`);
  }
  console.log('✅ Test A Passed: Saturday hours updated, replay verified, unrelated Monday change reverted.\n');


  // Test Correction B: "We added a dental cleaning service, 30 minutes, 800 rupees"
  console.log('--- TEST B: "We added a dental cleaning service, 30 minutes, 800 rupees" ---');
  const correctionB = 'We added a dental cleaning service, 30 minutes, 800 rupees';
  const candidateB = applySemanticCorrectionFallback(correctionB, constrainedA);
  // Introduce an intentional hallucination: address changed
  candidateB.facts.address = 'Random Street 99';
  const { constrainedContent: constrainedB, rejectedModifications: rejB } =
    validateAndConstrainCorrection(correctionB, constrainedA, candidateB);

  const diffB = computeKBDiff(constrainedA, constrainedB);
  console.log('Computed Diff:');
  diffB.differences.forEach((d) => console.log(`  [${d.changeType.toUpperCase()}] ${d.path}: ${d.description}`));
  console.log('Reverted Hallucinations:', rejB);

  const addedService = constrainedB.services.find((s) => s.name.toLowerCase().includes('dental'));
  if (!addedService) throw new Error('Test B Failed: Dental cleaning service was not added to services array!');
  if (addedService.duration_mins !== 30 || addedService.price !== 800) {
    throw new Error(`Test B Failed: Duration or price mismatch: ${JSON.stringify(addedService)}`);
  }
  if (constrainedB.facts.address !== originalKB.content.facts.address) {
    throw new Error('Test B Failed: Hallucinated address change was not reverted!');
  }

  // Save KB v3 and replay
  await db.saveKnowledgeBaseVersion({
    id: `kb_test_v3_${Date.now()}`,
    business_id: DEMO_CLINIC_ID,
    version: 3,
    content: constrainedB,
    raw_source_text: correctionB,
    approved_by_owner: true,
    created_at: new Date().toISOString(),
  });

  const replayB = await processMessage({
    businessId: DEMO_CLINIC_ID,
    conversationId: `replay_b_${Date.now()}`,
    text: 'Do you offer dental cleaning and what is the fee?',
  });
  console.log(`Replay Answer: "${replayB.text}"`);
  if (!replayB.text.includes('Dental Cleaning') || !replayB.text.includes('800')) {
    throw new Error(`Test B Failed: Replay answer did not mention Dental Cleaning and ₹800! Got: "${replayB.text}"`);
  }

  // End-to-End Booking of the newly added service
  console.log('  [End-to-End Booking Flow for Newly Added Service: Dental Cleaning]');
  const dentalConvId = `dental_booking_test_${Date.now()}`;
  const bookStep1 = await processMessage({
    businessId: DEMO_CLINIC_ID,
    conversationId: dentalConvId,
    text: 'Can I book an appointment for dental cleaning tomorrow morning?',
  });
  console.log(`  Step 1 Slot Inquiry Reply: "${bookStep1.text}"`);
  if (bookStep1.decision !== 'act' || !bookStep1.text.includes('Dental Cleaning')) {
    throw new Error(`Test B Failed: Booking Step 1 did not act on Dental Cleaning! Got: "${bookStep1.text}"`);
  }

  const bookStep2 = await processMessage({
    businessId: DEMO_CLINIC_ID,
    conversationId: dentalConvId,
    text: 'Yes please confirm 10:00 AM',
  });
  console.log(`  Step 2 Confirmation Reply: "${bookStep2.text}"`);
  if (bookStep2.decision !== 'act' || !bookStep2.text.includes('Dental Cleaning') || !bookStep2.text.includes('BK_')) {
    throw new Error(`Test B Failed: Booking Step 2 did not confirm Dental Cleaning with booking ID! Got: "${bookStep2.text}"`);
  }
  console.log('  ✅ End-to-End Booking Passed: Customer successfully booked newly added Dental Cleaning service in DB!');
  console.log('✅ Test B Passed: Service added, 30 mins & ₹800 verified, address hallucination reverted, booked end-to-end.\n');


  // Test Correction C: "Never discuss pricing over chat, ask them to call"
  console.log('--- TEST C: "Never discuss pricing over chat, ask them to call" ---');
  const correctionC = 'Never discuss pricing over chat, ask them to call';
  const candidateC = applySemanticCorrectionFallback(correctionC, constrainedB);
  // Attempt to delete medical safety rule in candidate
  candidateC.never_answer = candidateC.never_answer.filter((r) => !r.toLowerCase().includes('diagnosis'));
  const { constrainedContent: constrainedC, rejectedModifications: rejC } =
    validateAndConstrainCorrection(correctionC, constrainedB, candidateC);

  const diffC = computeKBDiff(constrainedB, constrainedC);
  console.log('Computed Diff:');
  diffC.differences.forEach((d) => console.log(`  [${d.changeType.toUpperCase()}] ${d.path}: ${d.description}`));
  console.log('Protected Guardrails:', rejC);

  // Check never_answer has new pricing prohibition
  const hasPricingRule = constrainedC.never_answer.some((r) => r.toLowerCase().includes('pricing'));
  if (!hasPricingRule) throw new Error('Test C Failed: Pricing guardrail was not added to never_answer!');

  // Check original medical safety rule was protected
  const hasDiagnosisRule = constrainedC.never_answer.some((r) => r.toLowerCase().includes('diagnosis'));
  if (!hasDiagnosisRule) throw new Error('Test C Failed: Critical medical safety rule was erroneously deleted!');

  // Save KB v4 and replay
  await db.saveKnowledgeBaseVersion({
    id: `kb_test_v4_${Date.now()}`,
    business_id: DEMO_CLINIC_ID,
    version: 4,
    content: constrainedC,
    raw_source_text: correctionC,
    approved_by_owner: true,
    created_at: new Date().toISOString(),
  });

  const replayC = await processMessage({
    businessId: DEMO_CLINIC_ID,
    conversationId: `replay_c_${Date.now()}`,
    text: 'What are your treatment and procedure charges?',
  });
  console.log(`Replay Answer: "${replayC.text}"`);
  if (!replayC.text.toLowerCase().includes('do not discuss procedure pricing') && !replayC.text.toLowerCase().includes('call')) {
    throw new Error(`Test C Failed: Replay did not refuse pricing or ask to call! Got: "${replayC.text}"`);
  }
  console.log('✅ Test C Passed: Pricing prohibition enforced, medical safety preserved, call prompt returned.\n');

  // Test D: Live LLM End-to-End Correction Generation (Only runs when keys are present)
  console.log('--- TEST D: Live LLM Correction Generation (Cloud Provider) ---');
  const hasLiveLLMKeys = Boolean(
    (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') ||
    (process.env.XAI_API_KEY && process.env.XAI_API_KEY !== 'your_xai_grok_api_key_here')
  );

  if (hasLiveLLMKeys) {
    console.log('  [Live LLM]: External API keys detected. Calling live LLM endpoint for correction...');
    const { callLLM } = await import('../src/lib/llm');
    const { KnowledgeBaseContentSchema } = await import('../src/lib/kb/voice-setup');

    const liveCorrectionText = 'We added a Physiotherapy consultation, 45 minutes, 1200 rupees';
    const systemPrompt = `You are a knowledge-engineering assistant updating an existing business knowledge base for City Health Clinic.
Update ONLY the services array and FAQs for the new service mentioned. Output valid JSON matching the schema.
CURRENT KB: ${JSON.stringify(constrainedC)}`;

    const liveRes = await callLLM({
      systemPrompt,
      messages: [{ role: 'user', content: `Owner Correction: "${liveCorrectionText}"` }],
      temperature: 0.1,
    });

    console.log(`  [Live LLM Provider]: ${liveRes.provider}`);
    const parsed = JSON.parse(liveRes.reply_text);
    const validated = KnowledgeBaseContentSchema.parse(parsed);
    const { constrainedContent: liveConstrained } = validateAndConstrainCorrection(
      liveCorrectionText,
      constrainedC,
      validated
    );
    const hasPhysio = liveConstrained.services.some((s) => s.name.toLowerCase().includes('physio'));
    if (!hasPhysio) throw new Error('Live LLM correction failed: Physiotherapy was not added to services!');
    console.log('✅ Test D Passed: Live LLM successfully generated structured KB update with Physiotherapy!');
  } else {
    console.log('ℹ️ Test D (Live LLM Provider Call): SKIPPED — No live GEMINI_API_KEY or XAI_API_KEY present.');
    console.log('  (Tests A, B, and C used the deterministic applySemanticCorrectionFallback parser.)');
    console.log('  To test live LLM parsing, set GEMINI_API_KEY in .env.local and re-run.');
  }

  console.log('\n====================================================');
  console.log('🎉 CORRECTION GENERALITY SUITE COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
}

testCorrectionGenerality().catch((err) => {
  console.error('Fatal error during generality test:', err);
  process.exit(1);
});
