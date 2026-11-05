/*

// TODO: switch to below packages:
// "node-lambda" and "@vendia/serverless-express"
// See https://github.com/brettstack/serverless-express
// SEE https://github.com/brettstack/serverless-express/blob/mainline/UPGRADE.md FOR HOW TO UPGRADE !!!

import tracer from './utils/tracer';
import { ValidationPipe } from '@nestjs/common';
import { APIGatewayProxyHandler, Context } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Server } from 'http';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ExpressAdapter } from '@nestjs/platform-express';
import { createServer, proxy } from 'aws-serverless-express';
import { eventContext } from 'aws-serverless-express/middleware';
import express from 'express';

let cachedServer: Server;

process.on('unhandledRejection', (reason) => {
	// tslint:disable-next-line:no-console
	console.error(reason);
});

process.on('uncaughtException', (reason) => {
	// tslint:disable-next-line:no-console
	console.error(reason);
});

const bootstrapServer = async (): Promise<Server> => {
	if (process.env.OTEL_ENABLED) {
		// Start tracing using Signoz first
		await tracer.start();
		console.log('Tracing started');
	} else {
		console.log('Tracing not enabled');
	}

	const expressApp = express();
	const adapter = new ExpressAdapter(expressApp);
	const app = await NestFactory.create(AppModule, adapter);

	// Starts listening for shutdown hooks
	app.enableShutdownHooks();

	app.use(eventContext());
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

	await app.init();
	return createServer(expressApp);
};

export const handler: APIGatewayProxyHandler = async (
	event: any,
	context: Context
) => {
	if (!cachedServer) {
		cachedServer = await bootstrapServer();
	}
	return proxy(cachedServer, event, context, 'PROMISE').promise;
};

*/
