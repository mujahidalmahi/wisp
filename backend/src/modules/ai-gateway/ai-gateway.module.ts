import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { AiGatewayController } from './ai-gateway.controller';
import { AiGatewayService } from './ai-gateway.service';
import { GroqProvider } from './providers/groq.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { OllamaProvider } from './providers/ollama.provider';

@Module({
  imports: [ContextModule],
  controllers: [AiGatewayController],
  providers: [
    AiGatewayService,
    GroqProvider,
    GeminiProvider,
    OpenRouterProvider,
    OllamaProvider,
  ],
  exports: [AiGatewayService],
})
export class AiGatewayModule {}
