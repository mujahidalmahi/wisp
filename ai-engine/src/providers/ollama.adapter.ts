import type { AiCompletionRequest, AiCompletionResult, IAiModelAdapter } from '../types/index.ts';

export class OllamaModelAdapter implements IAiModelAdapter {
  readonly name = 'ollama';
  private readonly baseUrl?: string;
  private readonly model: string;

  constructor(baseUrl?: string, model = 'llama3.2:3b') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const start = Date.now();
    const url = `${(this.baseUrl || 'http://localhost:11434').replace(/\/$/, '')}/api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
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
      providerName: `ollama:${this.model}`,
      rawText: data.message?.content || '{}',
      latencyMs: Date.now() - start,
    };
  }
}
