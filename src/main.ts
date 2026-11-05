import tracer from './utils/tracer';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AuthGuard } from '@packages/auth/auth.guard';

/**
 * Node ends the process on an unhandled promise rejection. For a long-running API that is the wrong
 * default: a background job's failure must be logged, not take every request down with it.
 */
process.on('unhandledRejection', (reason) => {
	console.error('Unhandled promise rejection (process kept alive):', reason instanceof Error ? reason.stack ?? reason.message : reason);
});

async function bootstrap() {
	if (process.env.OTEL_ENABLED) {
		// Start tracing using Signoz first
		tracer.start();
		console.log('Tracing started');
	} else {
		console.log('Tracing not enabled');
	}

	const app = await NestFactory.create(AppModule, {
		logger: ['log', 'error', 'warn', 'debug', 'verbose'],
	});

	// Starts listening for shutdown hooks
	app.enableShutdownHooks();

	// This will lock all routes and make them accessible by authenticated users only.
	const reflector = app.get(Reflector);
	app.useGlobalGuards(new AuthGuard(reflector));

	//
	app.useGlobalPipes(new ValidationPipe({ forbidUnknownValues: true }));

	app.enableCors();

	const globalPrefix = 'api';

	// NOTE: somehow below mess up Auth in GraphQL! So we keep it commented out for now
	// app.setGlobalPrefix(globalPrefix);

	const options = new DocumentBuilder()
		.setTitle('Gauzy AI API')
		.setDescription('Ever® Gauzy AI™ — Open Business Services and Intelligence Platform: APIs and services that gather, analyze and act on business data for the Ever Gauzy ecosystem')
		.setVersion('1.0')
		.addTag('ai')
		.addBearerAuth()
		.build();

	const document = SwaggerModule.createDocument(app, options);
	SwaggerModule.setup('swg', app, document);

	const host = '0.0.0.0';
	const port = 3005;

	console.log(`Configured Host: ${host}`);
	console.log(`Configured Port: ${port}`);

	console.log(`Swagger UI available at http://${host}:${port}/swg`);

	await app.listen(port, host, async () => {
		const message = `Listening at http://${host}:${port}/${globalPrefix}`;
		console.log(message);
	});
}

// A failed start (port in use, database unreachable, bad configuration) must end the process with a
// non-zero status so the orchestrator restarts it — the rejection handler above is for background
// work after the API is up, never for the bootstrap itself.
bootstrap().catch((error) => {
	console.error('Fatal: the API failed to start', error instanceof Error ? error.stack ?? error.message : error);
	process.exit(1);
});
