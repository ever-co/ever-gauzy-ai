import { NestFactory } from '@nestjs/core';
import { SchemaModule } from './schema.module';
import tracer from './utils/tracer';

async function bootstrap() {
	if (process.env.OTEL_ENABLED) {
		// Start tracing using Signoz first
		await tracer.start();
		console.log('Tracing started');
	} else {
		console.log('Tracing not enabled');
	}

	const app = await NestFactory.create(SchemaModule);
	await app.init();
}

bootstrap();
