// scripts/test-llm.ts
import fs from 'fs';
import path from 'path';

// Load .env or .env.local if present
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

const sampleRequest = {
  systemPrompt: `You are the front-desk AI assistant for City Health Clinic. Output valid JSON matching:
{
  "intent": "faq",
  "decision": "answer",
  "reply_text": "We accept cash, UPI, and all major cards.",
  "language": "en",
  "confidence": 0.95,
  "kb_refs": ["faq_payment"],
  "tool_calls": []
}`,
  messages: [{ role: 'user', content: 'What payment methods do you accept?' }],
};

async function testGemini(): Promise<boolean> {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('\n--- 1. Testing Gemini Provider ---');
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.log('⚠️ GEMINI_API_KEY is not set in environment or .env.local.');
    console.log('  To test live Gemini calls, add GEMINI_API_KEY=<your-key> to .env.local');
    return false;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: sampleRequest.systemPrompt },
          ...sampleRequest.messages,
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    const duration = Date.now() - start;
    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ Gemini API call rejected (${res.status}) [Latency: ${duration}ms]: ${errText}`);
      return false;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    console.log(`✅ [Provider: gemini] [Model: ${model}] [Latency: ${duration}ms] Response verified!`);
    console.log(`   Sample Reply: ${content?.slice(0, 120)}...`);
    return true;
  } catch (err: any) {
    console.error(`❌ Gemini network exception [Latency: ${Date.now() - start}ms]:`, err.message);
    return false;
  }
}

async function testGrok(): Promise<boolean> {
  const apiKey = process.env.XAI_API_KEY;
  console.log('\n--- 2. Testing Grok / xAI Provider ---');
  if (!apiKey || apiKey === 'your_xai_grok_api_key_here') {
    console.log('⚠️ XAI_API_KEY is not set in environment or .env.local.');
    console.log('  To test live Grok calls, add XAI_API_KEY=<your-key> to .env.local');
    return false;
  }

  const model = process.env.XAI_MODEL || 'grok-2-latest';
  const url = 'https://api.x.ai/v1/chat/completions';
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: sampleRequest.systemPrompt },
          ...sampleRequest.messages,
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    const duration = Date.now() - start;
    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ Grok API call rejected (${res.status}) [Latency: ${duration}ms]: ${errText}`);
      return false;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    console.log(`✅ [Provider: grok] [Model: ${model}] [Latency: ${duration}ms] Response verified!`);
    console.log(`   Sample Reply: ${content?.slice(0, 120)}...`);
    return true;
  } catch (err: any) {
    console.error(`❌ Grok network exception [Latency: ${Date.now() - start}ms]:`, err.message);
    return false;
  }
}

async function testRealLLMQueries(hasLLMKey: boolean) {
  console.log('\n--- 3. Testing Complex Queries That Require LLM Reasoning ---');
  const { processMessage } = await import('../src/lib/orchestrator');
  const { initKnowledgeBase } = await import('../src/lib/kb');
  const { DEMO_CLINIC_ID } = await import('../src/lib/kb/demo-clinic');

  await initKnowledgeBase();

  const complexQueries = [
    {
      q: 'Do you take health insurance or Mediclaim for consultations?',
      expectedIntent: 'faq',
    },
    {
      q: 'Can my elderly mother come along for the visit into the consultation room?',
      expectedIntent: 'faq',
    },
    {
      q: 'Is there parking nearby for a four wheeler car?',
      expectedIntent: 'faq',
    },
  ];

  for (const item of complexQueries) {
    console.log(`\n▶ Query: "${item.q}"`);
    const res = await processMessage({
      businessId: DEMO_CLINIC_ID,
      conversationId: `test_llm_query_${Date.now()}`,
      text: item.q,
    });

    console.log(`   [Provider]: ${res.provider}`);
    console.log(`   [Decision]: ${res.decision}`);
    console.log(`   [Reply Preview]: ${res.text.slice(0, 100)}...`);

    if (hasLLMKey) {
      if (
        res.provider === 'deterministic_guardrail' ||
        res.provider === 'deterministic_booking_engine'
      ) {
        throw new Error(
          `Test failed: Query "${item.q}" was handled by "${res.provider}" instead of a real LLM provider!`
        );
      }
    } else {
      console.log('   ℹ️ (No live API keys present; fallback/offline path used as expected)');
    }
  }
}

async function run() {
  console.log('====================================================');
  console.log('🤖 Local Business Assistant: Real LLM Test Suite');
  console.log('====================================================');

  const geminiOk = await testGemini();
  const grokOk = await testGrok();
  const hasLiveLLM = geminiOk || grokOk;

  await testRealLLMQueries(hasLiveLLM);

  console.log('\n====================================================');
  if (hasLiveLLM) {
    console.log('✅ Real LLM provider call test finished with ACTIVE API keys!');
  } else {
    console.log('ℹ️ LLM test finished. No external API keys were provided in this environment.');
    console.log('   Set GEMINI_API_KEY and/or XAI_API_KEY in .env.local to test live cloud endpoints.');
  }
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('Fatal error during LLM test:', err);
  process.exit(1);
});
