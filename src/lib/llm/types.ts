// src/lib/llm/types.ts
import { z } from 'zod';

export const LLMOutputSchema = z.object({
  intent: z.enum([
    'faq',
    'booking_create',
    'booking_change_or_cancel',
    'availability_check',
    'greeting_or_smalltalk',
    'complaint',
    'sensitive_or_out_of_scope',
    'unknown',
  ]),
  decision: z.enum(['answer', 'act', 'escalate']),
  reply_text: z.string(),
  language: z.string().default('en'),
  confidence: z.number().min(0).max(1).default(1.0),
  kb_refs: z.array(z.string()).default([]),
  tool_calls: z
    .array(
      z.object({
        tool: z.string(),
        params: z.record(z.any()).default({}),
      })
    )
    .default([]),
});

export type LLMOutput = z.infer<typeof LLMOutputSchema>;

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface LLMRequest {
  systemPrompt: string;
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
}

export interface LLMResult extends LLMOutput {
  provider: 'gemini' | 'grok' | 'fallback' | 'kb_direct' | string;
}

export interface LLMProvider {
  name: 'gemini' | 'grok';
  generate(request: LLMRequest): Promise<LLMOutput>;
}
