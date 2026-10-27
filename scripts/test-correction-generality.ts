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
  console.log('✅ Test B Passed: Service added, 30 mins & ₹800 verified, address hallucination reverted.\n');


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

  console.log('====================================================');
  console.log('🎉 ALL 3 GENERAL CORRECTION TESTS PASSED PERFECTLY!');
  console.log('====================================================');
}

testCorrectionGenerality().catch((err) => {
  console.error('Fatal error during generality test:', err);
  process.exit(1);
});
