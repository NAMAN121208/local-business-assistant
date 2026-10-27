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
  console.log('\n--- 1. Testing Gemini Provider & Models Discovery ---');
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.log('⚠️ GEMINI_API_KEY is not set in environment or .env.local.');
    console.log('  To test live Gemini calls, add GEMINI_API_KEY=<your-key> to .env.local');
    return false;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  // Step 1: Call Gemini's models endpoint to discover available models in user's account
  console.log('  [Models Endpoint]: Querying Google Generative Language models API...');
  let availableModels: string[] = [];
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: 'GET' }
    );
    if (!listRes.ok) {
      const err = await listRes.text();
      console.error(`❌ Failed to query Gemini models endpoint (${listRes.status}): ${err}`);
      return false;
    }
    const listData = await listRes.json();
    availableModels = (listData.models || []).map((m: any) =>
      (m.name || '').replace(/^models\//, '')
    );
    console.log(
      `  [Models Endpoint]: Account has ${availableModels.length} models available (e.g. ${availableModels.slice(0, 5).join(', ')}...)`
    );

    const modelExists = availableModels.some(
      (m) => m === model || m.toLowerCase() === model.toLowerCase()
    );
    if (!modelExists) {
      console.error(
        `❌ ERROR: Configured model "${model}" was NOT found in your Gemini account!`
      );
      console.error(
        `   Please change GEMINI_MODEL in .env.local to one of: ${availableModels.slice(0, 8).join(', ')}`
      );
      return false;
    }
    console.log(`  [Model Verified]: "${model}" exists and is accessible in your Google account.`);
  } catch (err: any) {
    console.error(`❌ Network error contacting Gemini models list:`, err.message);
    return false;
  }

  // Step 2: Execute live generation call
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
  const apiKey = process.env.GROQ_API_KEY || process.env.XAI_API_KEY;
  const isGroq = apiKey?.startsWith('gsk_') || Boolean(process.env.GROQ_API_KEY);
  const providerLabel = isGroq ? 'Groq (LPU Inference)' : 'Grok (xAI)';
  console.log(`\n--- 2. Testing Backup Provider (${providerLabel}) & Models Discovery ---`);
  if (!apiKey || apiKey === 'your_xai_grok_api_key_here' || apiKey === 'your_groq_api_key_here') {
    console.log('⚠️ GROQ_API_KEY or XAI_API_KEY is not set in environment or .env.local.');
    console.log('  To test live backup calls, add GROQ_API_KEY=<your-key> to .env.local');
    return false;
  }

  const model = isGroq
    ? process.env.GROQ_MODEL || 'qwen/qwen3.8-27b'
    : process.env.XAI_MODEL || 'grok-2-latest';

  const modelsUrl = isGroq
    ? 'https://api.groq.com/openai/v1/models'
    : 'https://api.x.ai/v1/models';

  // Step 1: Call models endpoint
  console.log(`  [Models Endpoint]: Querying ${providerLabel} models endpoint...`);
  try {
    const listRes = await fetch(modelsUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!listRes.ok) {
      const err = await listRes.text();
      console.error(`❌ Failed to query ${providerLabel} models endpoint (${listRes.status}): ${err}`);
      return false;
    }
    const listData = await listRes.json();
    const availableModels = (listData.data || []).map((m: any) => m.id);
    console.log(`  [Models Endpoint]: Account has models: ${availableModels.slice(0, 8).join(', ')}...`);

    const modelExists = availableModels.some((m: string) => m === model);
    if (!modelExists) {
      console.error(
        `❌ ERROR: Configured model "${model}" was NOT found in your ${providerLabel} account!`
      );
      console.error(
        `   Please change model in .env.local to one of: ${availableModels.join(', ')}`
      );
      return false;
    }
    console.log(`  [Model Verified]: "${model}" exists and is accessible in your ${providerLabel} account.`);
  } catch (err: any) {
    console.error(`❌ Network error contacting ${providerLabel} models list:`, err.message);
    return false;
  }

  // Step 2: Execute live generation call
  const url = isGroq
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.x.ai/v1/chat/completions';
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
      console.error(`❌ ${providerLabel} API call rejected (${res.status}) [Latency: ${duration}ms]: ${errText}`);
      return false;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    console.log(`✅ [Provider: ${isGroq ? 'groq' : 'grok'}] [Model: ${model}] [Latency: ${duration}ms] Response verified!`);
    console.log(`   Sample Reply: ${content?.slice(0, 120)}...`);
    return true;
  } catch (err: any) {
    console.error(`❌ ${providerLabel} network exception [Latency: ${Date.now() - start}ms]:`, err.message);
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
