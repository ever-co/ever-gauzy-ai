/**
 * How Trigger.dev tasks call back into the Gauzy AI API. Tasks run on Trigger.dev workers, outside
 * the NestJS process, so they reach the platform over HTTP:
 *
 *   - `/api/ops/*` and `/api/crawler/*` act across tenants and take the service token
 *     (`SERVICE_API_TOKEN`, sent as `X-SERVICE-TOKEN`);
 *   - tenant endpoints (e.g. `/api/employee/job/application/process`) take a tenant API key
 *     (`GAUZY_AI_APP_ID` / `GAUZY_AI_API_KEY`, sent as `X-APP-ID` / `X-API-KEY`).
 *
 * Set these in the Trigger.dev environment variables, never in the repository. Every callback carries
 * `X-Scheduler: trigger-dev`; a deployment that switched the trigger-dev plugin off answers 409, so
 * schedules still deployed on Trigger.dev cannot duplicate the in-process jobs.
 */
export const apiUrl = (): string => (process.env.GAUZY_AI_API_URL || 'http://localhost:3005').replace(/\/+$/, '');

export function serviceHeaders(): Record<string, string> {
	const token = process.env.SERVICE_API_TOKEN;
	if (!token) {
		throw new Error('SERVICE_API_TOKEN is not set in the Trigger.dev environment');
	}
	return { 'Content-Type': 'application/json', 'X-SERVICE-TOKEN': token, 'X-Scheduler': 'trigger-dev' };
}

export function tenantHeaders(): Record<string, string> {
	const appId = process.env.GAUZY_AI_APP_ID;
	const apiKey = process.env.GAUZY_AI_API_KEY;
	if (!appId || !apiKey) {
		throw new Error('GAUZY_AI_APP_ID / GAUZY_AI_API_KEY (a tenant API key) are not set in the Trigger.dev environment');
	}
	return { 'Content-Type': 'application/json', 'X-APP-ID': appId, 'X-API-KEY': apiKey, 'X-Scheduler': 'trigger-dev' };
}

/** POSTs `body` to the API and returns the parsed JSON response (undefined for an empty body). */
export async function callApi<T = unknown>(
	path: string,
	body?: unknown,
	headers: Record<string, string> = serviceHeaders()
): Promise<T> {
	const response = await fetch(`${apiUrl()}${path}`, {
		method: 'POST',
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!response.ok) {
		throw new Error(`${path} returned ${response.status}: ${response.statusText}`);
	}
	const text = await response.text();
	return (text ? JSON.parse(text) : undefined) as T;
}
