import type { AiCompletionRequest, AiCompletionResult, IAiModelAdapter } from '../types/index.ts';
import { AiProviderHttpError } from './errors.ts';

export class GroqModelAdapter implements IAiModelAdapter {
  readonly name = 'groq';
  readonly timeoutMs = 2000;
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(apiKey?: string, model = 'llama-3.3-70b-versatile') {
    this.apiKey = apiKey;
    this.model = model;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && !this.apiKey.includes('your_groq'));
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const start = Date.now();
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: req.signal,
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxTokens ?? 450,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new AiProviderHttpError('groq', response.status, await response.text());
    }

    const data = (await response.json()) as any;
    return {
      providerName: `groq:${this.model}`,
      rawText: data.choices?.[0]?.message?.content || '{}',
      latencyMs: Date.now() - start,
    };
  }
}
