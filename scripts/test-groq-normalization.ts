// scripts/test-groq-normalization.ts
import { normalizeGroqResponse } from '../src/lib/llm/grok';

async function runGroqNormalizationTests() {
  console.log('====================================================');
  console.log('🧪 Testing Groq Output Normalization & Safety Rules');
  console.log('====================================================\n');

  // Test 1: Corrupted / Non-JSON output
  console.log('--- TEST 1: Completely unparseable non-JSON text ---');
  const t1 = normalizeGroqResponse('Sorry, the server had an internal glitch and could not generate JSON');
  console.log(`  Decision: ${t1.decision} | Intent: ${t1.intent} | Confidence: ${t1.confidence}`);
  if (t1.decision !== 'escalate' || t1.confidence > 0.4) {
    throw new Error('TEST 1 FAILED: Non-JSON output did not escalate with low confidence!');
  }
  console.log('  ✅ TEST 1 PASSED: Corrupt output defaulted to escalate with low confidence.\n');

  // Test 2: Missing decision field in JSON
  console.log('--- TEST 2: Valid JSON with missing decision field ---');
  const t2 = normalizeGroqResponse(JSON.stringify({
    intent: 'faq',
    reply: 'Here is some information about the clinic',
    confidence: 0.9,
  }));
  console.log(`  Decision: ${t2.decision} | Intent: ${t2.intent} | Confidence: ${t2.confidence}`);
  if (t2.decision !== 'escalate') {
    throw new Error('TEST 2 FAILED: Missing decision field was not escalated!');
  }
  console.log('  ✅ TEST 2 PASSED: Missing decision field safely forced to escalate.\n');

  // Test 3: Invalid decision field (e.g. "maybe" or "proceed")
  console.log('--- TEST 3: Invalid decision string ("maybe") ---');
  const t3 = normalizeGroqResponse(JSON.stringify({
    intent: 'faq',
    decision: 'maybe',
    reply_text: 'Maybe the clinic has this equipment',
    confidence: 0.95,
  }));
  console.log(`  Decision: ${t3.decision} | Intent: ${t3.intent} | Confidence: ${t3.confidence}`);
  if (t3.decision !== 'escalate') {
    throw new Error('TEST 3 FAILED: Invalid decision value bypassed decision validation!');
  }
  console.log('  ✅ TEST 3 PASSED: Invalid decision string strictly forced to escalate.\n');

  // Test 4: Low-confidence escalation rule (Groq provided confidence 0.4 with decision: "answer")
  console.log('--- TEST 4: Low-confidence threshold (< 0.6) with decision: "answer" ---');
  const t4 = normalizeGroqResponse(JSON.stringify({
    intent: 'faq',
    decision: 'answer',
    confidence: 0.45,
    reply_text: 'I think the fee might be 500 rupees but I am not certain',
  }));
  console.log(`  Decision: ${t4.decision} | Confidence: ${t4.confidence}`);
  if (t4.decision !== 'escalate') {
    throw new Error('TEST 4 FAILED: Low confidence (< 0.6) did not force decision to escalate!');
  }
  console.log('  ✅ TEST 4 PASSED: Low-confidence answer automatically converted to escalate.\n');

  // Test 5: Markdown codeblock wrapped JSON with alias "reply"
  console.log('--- TEST 5: Markdown codeblock wrapped JSON with key aliases ---');
  const t5 = normalizeGroqResponse('```json\n{"intent": "faq", "decision": "answer", "reply": "Clinic is open Monday to Saturday", "confidence": 0.95}\n```');
  console.log(`  Decision: ${t5.decision} | Reply text: "${t5.reply_text}"`);
  if (t5.decision !== 'answer' || t5.reply_text !== 'Clinic is open Monday to Saturday') {
    throw new Error('TEST 5 FAILED: Legitimate answer with key alias was not correctly normalized!');
  }
  console.log('  ✅ TEST 5 PASSED: Valid codeblock response normalized and preserved.\n');

  console.log('====================================================');
  console.log('🎉 ALL 5 GROQ NORMALIZATION & SAFETY TESTS PASSED!');
  console.log('====================================================');
}

runGroqNormalizationTests().catch((err) => {
  console.error('Groq normalization test failed:', err);
  process.exit(1);
});
