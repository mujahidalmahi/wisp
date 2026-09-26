import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiCompletionRequest,
  AiCompletionResult,
  IAiProvider,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class GroqProvider implements IAiProvider {
  readonly name = 'groq';

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const key = this.config.get<string>('GROQ_API_KEY');
    return Boolean(key && !key.includes('your_groq'));
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const start = Date.now();
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    const model = this.config.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
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
      throw new Error(`Groq HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as any;
    return {
      providerName: `groq:${model}`,
      rawText: data.choices?.[0]?.message?.content || '{}',
      latencyMs: Date.now() - start,
    };
  }
}
