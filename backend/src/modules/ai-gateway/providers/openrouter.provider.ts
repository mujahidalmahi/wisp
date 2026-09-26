import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiCompletionRequest,
  AiCompletionResult,
  IAiProvider,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class OpenRouterProvider implements IAiProvider {
  readonly name = 'openrouter';

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const key = this.config.get<string>('OPENROUTER_API_KEY');
    return Boolean(key && !key.includes('your_openrouter'));
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const start = Date.now();
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    const model =
      this.config.get<string>('OPENROUTER_MODEL') || 'meta-llama/llama-3.1-8b-instruct:free';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/wisp-firetv',
        'X-Title': 'Wisp Fire TV Contextual Viewing',
      },
      body: JSON.stringify({
        model,
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxTokens ?? 450,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as any;
    return {
      providerName: `openrouter:${model}`,
      rawText: data.choices?.[0]?.message?.content || '{}',
      latencyMs: Date.now() - start,
    };
  }
}
