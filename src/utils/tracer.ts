'use strict';

// The tracer is the first import of main.ts, before AppModule's ConfigModule loads `.env`: load it
// here so settings supplied only through `.env` (local development) also configure tracing.
import 'dotenv/config';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { LangfuseExporter } from 'langfuse-vercel';

/**
 * OpenTelemetry tracing. Two independent destinations:
 *
 *   - OTEL_ENABLED=true: every span (auto-instrumented HTTP, database, …) goes to the OTLP endpoint
 *     (`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, default SigNoz cloud; `OTEL_EXPORTER_OTLP_HEADERS` for
 *     the ingestion key).
 *   - Langfuse configured (`LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY`, unless
 *     `LANGFUSE_TRACING_ENABLED=false`): the AI SDK's generation spans (`experimental_telemetry`)
 *     are exported to Langfuse, where `promptTelemetry()` links them to the prompt version used.
 *
 * The SDK is started when at least one destination is on; the AI SDK records telemetry only then.
 */
let serviceName = 'Ever Gauzy AI API';
if (process.env.CLOUD_PROVIDER) {
	const providerName = process.env.CLOUD_PROVIDER.toUpperCase();
	console.log('Tracing Cloud Provider: ' + providerName);
	serviceName = serviceName + ' (' + providerName + ')';
}

const otelEnabled = process.env.OTEL_ENABLED === 'true' || process.env.OTEL_ENABLED === '1';
// the plugin switch applies here too: the tracer runs before Nest, so it reads the list itself
const disabledPlugins = (process.env.GAUZY_AI_PLUGINS_DISABLED ?? '')
	.split(',')
	.map((name) => name.trim().toLowerCase())
	.filter(Boolean);
const langfuseEnabled =
	process.env.LANGFUSE_TRACING_ENABLED !== 'false' &&
	!disabledPlugins.includes('langfuse') &&
	!!process.env.LANGFUSE_PUBLIC_KEY &&
	!!process.env.LANGFUSE_SECRET_KEY;

const spanProcessors: SpanProcessor[] = [];
if (otelEnabled) {
	const url = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'https://ingest.us.signoz.cloud:443/v1/traces';
	console.log('Tracing URL: ' + url);
	spanProcessors.push(new BatchSpanProcessor(new OTLPTraceExporter({ url })));
}
if (langfuseEnabled) {
	console.log('Tracing: AI generations exported to Langfuse (' + (process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com') + ')');
	spanProcessors.push(
		new BatchSpanProcessor(
			new LangfuseExporter({
				publicKey: process.env.LANGFUSE_PUBLIC_KEY,
				secretKey: process.env.LANGFUSE_SECRET_KEY,
				baseUrl: process.env.LANGFUSE_HOST || undefined,
			})
		)
	);
}

const sdk = new NodeSDK({
	spanProcessors,
	// auto-instrumentation of HTTP / database / … only for the full OTLP destination
	instrumentations: otelEnabled ? [getNodeAutoInstrumentations()] : [],
	resource: resourceFromAttributes({
		[ATTR_SERVICE_NAME]: serviceName,
	}),
});

const tracingEnabled = spanProcessors.length > 0;
if (tracingEnabled) {
	sdk.start();
	console.log('Tracing SDK Started (' + serviceName + ')');
} else {
	console.log('Tracing SDK Not Enabled');
}

/**
 * Flushes and stops the tracing SDK. Called from the application's shutdown hook (after HTTP has
 * drained) rather than from a SIGTERM handler of its own, which used to exit the process while
 * requests were still being served.
 */
export async function shutdownTracing(): Promise<void> {
	if (!tracingEnabled) return;
	try {
		await sdk.shutdown();
		console.log('Tracing terminated');
	} catch (error) {
		console.log('Error terminating tracing', error);
	}
}

export default sdk;
