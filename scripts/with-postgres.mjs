#!/usr/bin/env node
/**
 * Runs a command against a disposable, embedded PostgreSQL (no Docker, no local install).
 *
 *   node scripts/with-postgres.mjs -- <command> [args...]
 *
 * Starts PostgreSQL (embedded-postgres, same major as production) on a free port, exports
 * DB_TYPE/DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME (+ DATABASE_URL) and DB_DISPOSABLE=true for the
 * child process, runs the command, then stops and deletes the server. Used by
 * `yarn migration:generate:ephemeral`, `yarn test:e2e:ephemeral` and CI; the data directory lives
 * under the OS temp dir.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const sep = process.argv.indexOf('--');
const command = sep >= 0 ? process.argv.slice(sep + 1) : process.argv.slice(2);
if (command.length === 0) {
	console.error('usage: node scripts/with-postgres.mjs -- <command> [args...]');
	process.exit(2);
}

const freePort = () =>
	new Promise((resolve, reject) => {
		const srv = createServer();
		srv.listen(0, '127.0.0.1', () => {
			const { port } = srv.address();
			srv.close(() => resolve(port));
		});
		srv.on('error', reject);
	});

const port = Number(process.env.WITH_POSTGRES_PORT) || (await freePort());
const databaseDir = mkdtempSync(join(tmpdir(), 'gauzy-ai-pg-'));
const user = 'postgres';
const password = 'postgres';
const database = 'gauzy_ai_test';
const quiet = !process.env.WITH_POSTGRES_VERBOSE;
const pg = new EmbeddedPostgres({
	databaseDir,
	user,
	password,
	port,
	persistent: false,
	onLog: quiet ? () => {} : undefined,
	onError: quiet ? () => {} : undefined,
});

const stop = async () => {
	try {
		await pg.stop();
	} catch {
		/* already stopped */
	}
	// Windows releases the data files a moment after the server exits: retry, and never fail the run over cleanup.
	try {
		rmSync(databaseDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
	} catch (error) {
		console.warn(`[with-postgres] could not remove ${databaseDir}: ${error.message}`);
	}
};

try {
	await pg.initialise();
	await pg.start();
	await pg.createDatabase(database);
	console.log(`[with-postgres] PostgreSQL up on 127.0.0.1:${port}, database ${database}`);
} catch (error) {
	console.error('[with-postgres] could not start PostgreSQL:', error.message);
	await stop();
	process.exit(1);
}

const env = {
	...process.env,
	DB_TYPE: 'postgres',
	DB_HOST: '127.0.0.1',
	DB_PORT: String(port),
	DB_USER: user,
	DB_PASS: password,
	DB_NAME: database,
	DB_SSL_MODE: 'false',
	DATABASE_URL: `postgres://${user}:${password}@127.0.0.1:${port}/${database}`,
	// tells destructive test suites that this database may be wiped
	DB_DISPOSABLE: 'true',
};

/**
 * Starts the command with its arguments intact. On POSIX the executable is spawned directly (no
 * shell, so quoting survives). On Windows `yarn` / `npx` are `.cmd` shims that need cmd.exe, so the
 * arguments are quoted for cmd and passed as one line.
 */
const start = () => {
	if (process.platform !== 'win32') {
		// own process group, so the whole tree of the command can be signalled
		return spawn(command[0], command.slice(1), { stdio: 'inherit', env, detached: true });
	}
	const quote = (arg) => (/[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg);
	const line = command.map(quote).join(' ');
	return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
		stdio: 'inherit',
		env,
		windowsVerbatimArguments: true,
	});
};

const child = start();

/** Signals the command's whole process tree (descendants included), not only the immediate child. */
const killTree = (signal) => {
	if (!child.pid) return;
	if (process.platform === 'win32') {
		spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
		return;
	}
	try {
		process.kill(-child.pid, signal); // the process group created by `detached`
	} catch {
		/* already gone */
	}
};

const finish = async (code) => {
	// descendants the command left behind (e.g. a test runner's workers) must not outlive the database
	killTree('SIGTERM');
	await new Promise((resolve) => setTimeout(resolve, 200));
	killTree('SIGKILL');
	await stop();
	process.exit(code ?? 1);
};
child.on('exit', (code) => finish(code));
child.on('error', (error) => {
	console.error('[with-postgres] command failed to start:', error.message);
	finish(1);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		killTree(signal);
	});
}
