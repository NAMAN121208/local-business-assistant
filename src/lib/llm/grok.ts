// src/lib/llm/grok.ts
import { LLMOutput, LLMOutputSchema, LLMProvider, LLMRequest } from './types';

export class GrokProvider implements LLMProvider {
  name: 'grok' = 'grok';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.XAI_API_KEY || '';
    this.model = model || process.env.XAI_MODEL || 'grok-2-latest';
    this.baseUrl = 'https://api.x.ai/v1/chat/completions';
  }

  async generate(request: LLMRequest): Promise<LLMOutput> {
    if (!this.apiKey) {
      throw new Error('XAI_API_KEY is not set');
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
        const err = new Error(`Grok API error (${response.status}): ${errorText}`);
        (err as any).status = response.status;
        throw err;
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error('Grok returned an empty response');
      }

      let parsedJson: any;
      try {
        parsedJson = JSON.parse(rawContent);
      } catch (e: any) {
        throw new Error(`Failed to parse Grok output as JSON: ${rawContent}`);
      }

      const validated = LLMOutputSchema.safeParse(parsedJson);
      if (!validated.success) {
        throw new Error(`Grok response failed schema validation: ${validated.error.message}`);
      }

      return validated.data;
    } finally {
      clearTimeout(timeout);
    }
  }
}
