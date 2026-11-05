import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import config, { ConfigurationService } from '@packages/config';
import openai from '@packages/config/openai';
import { AiService } from './ai.service';
import { AiScoringService } from './ai-scoring.service';
import { OpenAIService } from './openai/openai.service';
import { ImageAnalyzeController } from './image-analyze.controller';
import { ImageAnalyzeService } from './image-analyze.service';
import { PromptsModule } from '@packages/prompts/prompts.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			load: [config, openai],
		}),
		TypeOrmModule.forFeature([]),
		PromptsModule,
	],
	controllers: [
		ImageAnalyzeController
	],
	providers: [
		ConfigurationService,
		AiService,
		AiScoringService,
		OpenAIService,
		ImageAnalyzeService
	],
	exports: [
		AiService,
		AiScoringService,
		OpenAIService
	],
})
export class AiModule { }
