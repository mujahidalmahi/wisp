import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiCompletionRequest,
  AiCompletionResult,
  IAiProvider,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class OllamaProvider implements IAiProvider {
  readonly name = 'ollama';

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('OLLAMA_BASE_URL'));
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const start = Date.now();
    const baseUrl = this.config.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434';
    const model = this.config.get<string>('OLLAMA_MODEL') || 'llama3.2:3b';

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as any;
    return {
      providerName: `ollama:${model}`,
      rawText: data.message?.content || '{}',
      latencyMs: Date.now() - start,
    };
  }
}
