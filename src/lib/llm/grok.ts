// src/lib/llm/grok.ts
import { LLMOutput, LLMOutputSchema, LLMProvider, LLMRequest } from './types';

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
    const timeout = setTimeout(() => controller.abort(), 15000);

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

      let parsed: any;
      try {
        parsed = JSON.parse(rawContent);
      } catch (e) {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          parsed = {
            intent: 'unknown',
            decision: 'answer',
            confidence: 0.5,
            text: rawContent,
            kb_refs: [],
            tool_calls: [],
          };
        }
      }

      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error(`Failed to parse Groq output as JSON: ${rawContent}`);
      }

      const validated = LLMOutputSchema.safeParse(parsed);
      if (!validated.success) {
        throw new Error(`Groq response failed schema validation: ${validated.error.message}`);
      }

      return validated.data;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Groq request timed out after 15000ms');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// Export GrokProvider alias for backward compatibility
export const GrokProvider = GroqProvider;
