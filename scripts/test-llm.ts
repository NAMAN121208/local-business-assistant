// scripts/test-llm.mjs
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
  systemPrompt: `You are a helpful assistant. Output valid JSON matching:
{
  "intent": "greeting_or_smalltalk",
  "decision": "answer",
  "reply_text": "Hello! How can I help you today?",
  "language": "en",
  "confidence": 1.0,
  "kb_refs": [],
  "tool_calls": []
}`,
  messages: [{ role: 'user', content: 'Hi there' }],
};

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('\n--- Testing Gemini Provider ---');
  if (!apiKey) {
    console.log('⚠️ GEMINI_API_KEY is not set in environment.');
    return;
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
      console.error(`❌ Gemini call failed (${res.status}) [${duration}ms]:`, errText);
    } else {
      const data = await res.json();
      console.log(`✅ Gemini call succeeded in ${duration}ms using model "${model}"!`);
      console.log('Response:', data.choices?.[0]?.message?.content);
    }
  } catch (err) {
    console.error(`❌ Gemini exception [${Date.now() - start}ms]:`, err.message);
  }
}

async function testGrok() {
  const apiKey = process.env.XAI_API_KEY;
  console.log('\n--- Testing Grok / xAI Provider ---');
  if (!apiKey) {
    console.log('⚠️ XAI_API_KEY is not set in environment.');
    return;
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
      console.error(`❌ Grok call failed (${res.status}) [${duration}ms]:`, errText);
    } else {
      const data = await res.json();
      console.log(`✅ Grok call succeeded in ${duration}ms using model "${model}"!`);
      console.log('Response:', data.choices?.[0]?.message?.content);
    }
  } catch (err) {
    console.error(`❌ Grok exception [${Date.now() - start}ms]:`, err.message);
  }
}

async function run() {
  console.log('🔍 Running direct provider checks...');
  await testGemini();
  await testGrok();
  console.log('\nDirect provider check completed.');
}

run();
