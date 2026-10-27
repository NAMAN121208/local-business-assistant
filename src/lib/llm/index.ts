// src/lib/llm/index.ts
import { GeminiProvider } from './gemini';
import { GrokProvider } from './grok';
import { LLMMessage, LLMOutput, LLMProvider, LLMRequest, LLMResult, ToolDefinition } from './types';

export * from './types';
export * from './gemini';
export * from './grok';

interface CircuitState {
  consecutiveFailures: number;
  disabledUntil: number;
}

const circuitStates: Record<'gemini' | 'grok', CircuitState> = {
  gemini: { consecutiveFailures: 0, disabledUntil: 0 },
  grok: { consecutiveFailures: 0, disabledUntil: 0 },
};

function isProviderAvailable(providerName: 'gemini' | 'grok'): boolean {
  const state = circuitStates[providerName];
  if (state.disabledUntil > Date.now()) {
    console.warn(`[LLM CircuitBreaker] Provider ${providerName} is temporarily tripped until ${new Date(state.disabledUntil).toISOString()}`);
    return false;
  }
  return true;
}

function recordSuccess(providerName: 'gemini' | 'grok') {
  const state = circuitStates[providerName];
  state.consecutiveFailures = 0;
  state.disabledUntil = 0;
}

function recordFailure(providerName: 'gemini' | 'grok') {
  const state = circuitStates[providerName];
  state.consecutiveFailures += 1;
  if (state.consecutiveFailures >= 3) {
    state.disabledUntil = Date.now() + 60000; // 60 seconds
    console.warn(`[LLM CircuitBreaker] Tripped 3 failures for ${providerName}. Disabled for 60s.`);
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callProviderWithRetry(provider: LLMProvider, request: LLMRequest): Promise<LLMOutput> {
  try {
    const result = await provider.generate(request);
    recordSuccess(provider.name);
    return result;
  } catch (firstErr: any) {
    console.warn(`[LLM Failover] ${provider.name} failed first attempt: ${firstErr.message}. Retrying once after backoff...`);
    await sleep(600);
    try {
      const result = await provider.generate(request);
      recordSuccess(provider.name);
      return result;
    } catch (secondErr: any) {
      recordFailure(provider.name);
      throw secondErr;
    }
  }
}

/**
 * Main LLM invocation function
 * Takes systemPrompt, messages, tool definitions and handles:
 * - Primary vs Backup provider
 * - Retry once with backoff on 429/5xx/timeout/schema failure
 * - Automatic failover to secondary provider
 * - Circuit breaker (3 failures -> skip 60s)
 * - Safe fallback if both providers fail
 */
export async function callLLM(params: {
  systemPrompt: string;
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
}): Promise<LLMResult> {
  const primaryName = (process.env.PRIMARY_PROVIDER || 'gemini').toLowerCase() === 'grok' ? 'grok' : 'gemini';
  const secondaryName = primaryName === 'gemini' ? 'grok' : 'gemini';

  const providers: Record<'gemini' | 'grok', LLMProvider> = {
    gemini: new GeminiProvider(),
    grok: new GrokProvider(),
  };

  const order: Array<'gemini' | 'grok'> = [primaryName, secondaryName];

  for (const name of order) {
    if (!isProviderAvailable(name)) {
      continue;
    }

    try {
      const output = await callProviderWithRetry(providers[name], params);
      return {
        ...output,
        provider: name,
      };
    } catch (err: any) {
      console.error(`[LLM Failover] Provider ${name} failed:`, err.message);
      // continue to next provider
    }
  }

  // Safe fallback if both failed or no providers were available
  console.error('[LLM Failover] All LLM providers failed or are unavailable. Returning safe fallback.');
  return {
    intent: 'unknown',
    decision: 'escalate',
    reply_text:
      'Thank you for reaching out to City Health Clinic. Our automated assistant is currently experiencing high load. A staff member has been alerted and will assist you shortly.',
    language: 'en',
    confidence: 0.1,
    kb_refs: [],
    tool_calls: [],
    provider: 'fallback',
  };
}
