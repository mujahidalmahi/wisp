import type { AiCompletionRequest, AiCompletionResult, IAiModelAdapter } from '../types/index.ts';

export class GeminiModelAdapter implements IAiModelAdapter {
  readonly name = 'gemini';
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(apiKey?: string, model = 'gemini-2.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && !this.apiKey.includes('your_gemini'));
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const start = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: req.userPrompt }] }],
        generationConfig: {
          temperature: req.temperature ?? 0.3,
          maxOutputTokens: req.maxTokens ?? 450,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as any;
    return {
      providerName: `gemini:${this.model}`,
      rawText: data.candidates?.[0]?.content?.parts?.[0]?.text || '{}',
      latencyMs: Date.now() - start,
    };
  }
}
