// src/lib/llm/grok.ts
import { LLMOutput, LLMOutputSchema, LLMProvider, LLMRequest } from './types';

export function normalizeGroqResponse(rawContent: string): LLMOutput {
  if (!rawContent || !rawContent.trim()) {
    throw new Error('Groq returned an empty response');
  }

  let parsedJson: any;
  try {
    let cleaned = rawContent.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    parsedJson = JSON.parse(cleaned);
  } catch (e) {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsedJson = JSON.parse(jsonMatch[0]);
      } catch {}
    }
  }

  if (!parsedJson || typeof parsedJson !== 'object') {
    return {
      intent: 'unknown',
      decision: 'escalate',
      confidence: 0.3,
      reply_text: rawContent.trim(),
      language: 'en',
      kb_refs: [],
      tool_calls: [],
    };
  }

  if (Array.isArray(parsedJson) && parsedJson.length > 0) {
    parsedJson = parsedJson[0];
  }
  if (parsedJson.output && typeof parsedJson.output === 'object') {
    parsedJson = parsedJson.output;
  } else if (parsedJson.response && typeof parsedJson.response === 'object') {
    parsedJson = parsedJson.response;
  }

  // Standardize key aliases for reply text
  if (!parsedJson.reply_text) {
    parsedJson.reply_text =
      parsedJson.reply ||
      parsedJson.text ||
      parsedJson.message ||
      parsedJson.answer ||
      (typeof parsedJson === 'string' ? parsedJson : JSON.stringify(parsedJson));
  }

  // STRICT DECISION VALIDATION:
  // Must be one of 'answer' | 'act' | 'escalate'
  const validDecisions = ['answer', 'act', 'escalate'];
  let decision = parsedJson.decision;
  if (!validDecisions.includes(decision)) {
    // If decision is missing, corrupted or invalid, strictly default to escalate
    decision = 'escalate';
  }

  // STRICT CONFIDENCE VALIDATION:
  // Preserve low confidence numbers; do not artificially elevate to 0.95
  let confidence = typeof parsedJson.confidence === 'number'
    ? parsedJson.confidence
    : (decision === 'escalate' ? 0.3 : 0.85);

  // Low-Confidence Escalation Rule: If confidence < 0.6, force decision to escalate
  if (confidence < 0.6 && decision === 'answer') {
    decision = 'escalate';
  }

  const validIntents = [
    'faq',
    'booking_create',
    'booking_change_or_cancel',
    'availability_check',
    'greeting_or_smalltalk',
    'complaint',
    'sensitive_or_out_of_scope',
    'unknown',
  ];
  let intent = parsedJson.intent;
  if (!validIntents.includes(intent)) {
    intent = decision === 'escalate' ? 'unknown' : 'faq';
  }

  parsedJson.decision = decision;
  parsedJson.intent = intent;
  parsedJson.confidence = confidence;
  if (!parsedJson.language) parsedJson.language = 'en';
  if (!Array.isArray(parsedJson.kb_refs)) parsedJson.kb_refs = [];
  if (!Array.isArray(parsedJson.tool_calls)) parsedJson.tool_calls = [];

  const validated = LLMOutputSchema.safeParse(parsedJson);
  if (!validated.success) {
    return {
      intent: 'unknown',
      decision: 'escalate',
      reply_text: parsedJson.reply_text || rawContent,
      language: parsedJson.language || 'en',
      confidence: 0.3,
      kb_refs: [],
      tool_calls: [],
    };
  }

  return validated.data;
}

export class GroqProvider implements LLMProvider {
  name: 'groq' = 'groq';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.GROQ_API_KEY || process.env.XAI_API_KEY || '';
    this.baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.model = model || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
  }

  async generate(request: LLMRequest): Promise<LLMOutput> {
    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    const messages = [
      { role: 'system', content: request.systemPrompt },
      ...request.messages,
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7500);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          response_format: { type: 'json_object' },
          temperature: request.temperature ?? 0.1,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const err = new Error(`Groq API error (${response.status}): ${errorText}`);
        (err as any).status = response.status;
        throw err;
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error('Groq returned an empty response');
      }

      return normalizeGroqResponse(rawContent);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Groq request timed out after 7500ms');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// Export GrokProvider alias for backward compatibility
export const GrokProvider = GroqProvider;
