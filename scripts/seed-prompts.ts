/**
 * Seeds the prompt catalog into the Langfuse project given by LANGFUSE_HOST / LANGFUSE_PUBLIC_KEY /
 * LANGFUSE_SECRET_KEY (from the environment or .env):
 *
 *   yarn prompts:seed            # create the prompts that are missing, update the ones whose
 *                                # production text differs from the catalog
 *   yarn prompts:seed --check    # only report (exit 1 when something would change)
 *
 * Each change creates a new prompt version labelled `production`, so what runs is always visible
 * and revertible in Langfuse. Prompts edited in Langfuse are not overwritten unless their
 * production text differs from the catalog, which is the point of running this after a code
 * change to the catalog; the catalog itself stays the fallback when Langfuse is unavailable.
 */
import 'dotenv/config';
import { Langfuse } from 'langfuse';
import { PROMPT_CATALOG } from '../packages/prompts/src/catalog';

const checkOnly = process.argv.includes('--check');
/** The SDK surfaces a missing prompt as an error carrying the API's 404 / "not found" message. */
const isNotFound = (error: unknown): boolean => {
	const status = (error as { status?: number; response?: { status?: number } })?.status ?? (error as { response?: { status?: number } })?.response?.status;
	return status === 404 || /not found|404/i.test(String((error as Error)?.message ?? ''));
};
const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
const secretKey = process.env.LANGFUSE_SECRET_KEY;
const baseUrl = process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com';
if (!publicKey || !secretKey) {
	console.error('LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required (see .env.sample)');
	process.exit(2);
}

async function main(): Promise<void> {
	const langfuse = new Langfuse({ publicKey, secretKey, baseUrl });
	let changes = 0;
	try {
		for (const definition of PROMPT_CATALOG) {
			let current: string | undefined;
			let version: number | undefined;
			try {
				const existing = await langfuse.getPrompt(definition.name, undefined, { cacheTtlSeconds: 0 });
				current = typeof existing.prompt === 'string' ? existing.prompt : JSON.stringify(existing.prompt);
				version = existing.version;
			} catch (error) {
				if (!isNotFound(error)) {
					// an outage or a bad key is not "missing": never report drift or publish blindly on it
					throw new Error(`Could not read prompt "${definition.name}" from Langfuse: ${error.message}`);
				}
				current = undefined; // confirmed: not in Langfuse yet
			}
			if (current === definition.prompt) {
				console.log(`= ${definition.name}: production v${version} matches the catalog`);
				continue;
			}
			changes++;
			if (checkOnly) {
				console.log(`! ${definition.name}: ${current === undefined ? 'missing in Langfuse' : `production v${version} differs from the catalog`}`);
				continue;
			}
			const created = await langfuse.createPrompt({
				name: definition.name,
				type: 'text',
				prompt: definition.prompt,
				labels: ['production'],
				tags: ['gauzy-ai', definition.usedBy],
				commitMessage: `${current === undefined ? 'Seeded' : 'Updated'} from the Gauzy AI prompt catalog: ${definition.description}`,
				config: { variables: definition.variables, usedBy: definition.usedBy },
			});
			console.log(`+ ${definition.name}: ${current === undefined ? 'created' : 'updated'} as production v${created.version}`);
		}
	} finally {
		await langfuse.shutdownAsync();
	}
	if (checkOnly && changes > 0) {
		console.log(`${changes} prompt(s) would change; run \`yarn prompts:seed\` to apply`);
		process.exit(1);
	}
	console.log(checkOnly ? 'Langfuse matches the catalog' : `Done: ${changes} prompt(s) created or updated`);
}

main().catch((error) => {
	console.error(`prompts:seed failed: ${error.message}`);
	process.exit(1);
});
