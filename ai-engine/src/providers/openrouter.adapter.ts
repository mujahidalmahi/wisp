import type { AiCompletionRequest, AiCompletionResult, IAiModelAdapter } from '../types/index.ts';
import { AiProviderHttpError } from './errors.ts';

export class OpenRouterModelAdapter implements IAiModelAdapter {
  readonly name = 'openrouter';
  readonly timeoutMs = 4000;
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(apiKey?: string, model = 'meta-llama/llama-3.1-8b-instruct:free') {
    this.apiKey = apiKey;
    this.model = model;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && !this.apiKey.includes('your_openrouter'));
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const start = Date.now();
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/wisp-firetv',
        'X-Title': 'Wisp Fire TV Contextual Viewing',
      },
      signal: req.signal,
      body: JSON.stringify({
        model: this.model,
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxTokens ?? 450,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new AiProviderHttpError('openrouter', response.status, await response.text());
    }

    const data = (await response.json()) as any;
    return {
      providerName: `openrouter:${this.model}`,
      rawText: data.choices?.[0]?.message?.content || '{}',
      latencyMs: Date.now() - start,
    };
  }
}
