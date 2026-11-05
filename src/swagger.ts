import tracer from './utils/tracer';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
	if (process.env.OTEL_ENABLED) {
		// Start tracing using Signoz first
		await tracer.start();
		console.log('Tracing started');
	} else {
		console.log('Tracing not enabled');
	}

	const app = await NestFactory.create(AppModule);

	const options = new DocumentBuilder()
		.setTitle('Gauzy AI')
		.setDescription('Ever® Gauzy AI™ — Open Business Services and Intelligence Platform: APIs and services that gather, analyze and act on business data for the Ever Gauzy ecosystem')
		.setVersion('1.0')
		.addTag('ai')
		.addBearerAuth()
		.build();

	const document = SwaggerModule.createDocument(app, options);
	SwaggerModule.setup('swg', app, document);

	await app.listen(3006);
}

bootstrap();
