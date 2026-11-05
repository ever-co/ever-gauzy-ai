import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import config, { ConfigurationService } from '@packages/config';
import openai from '@packages/config/openai';
import { PromptService } from './prompt.service';

/** The prompt registry (Langfuse, with the built-in catalog as fallback). */
@Module({
	imports: [ConfigModule.forRoot({ load: [config, openai] })],
	providers: [ConfigurationService, PromptService],
	exports: [PromptService],
})
export class PromptsModule {}
