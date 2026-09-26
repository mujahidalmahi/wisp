import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiCompletionRequest,
  AiCompletionResult,
  IAiProvider,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class GeminiProvider implements IAiProvider {
  readonly name = 'gemini';

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const key = this.config.get<string>('GEMINI_API_KEY');
    return Boolean(key && !key.includes('your_gemini'));
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const start = Date.now();
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    const model = this.config.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return {
      providerName: `gemini:${model}`,
      rawText,
      latencyMs: Date.now() - start,
    };
  }
}
