import { randomBytes } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import type { SecretInfo } from './api-types.ts';
import type { Library } from './core/library.ts';
import type { Workspace } from './core/workspace.ts';
import { execCapture } from './util/exec.ts';

/**
 * API keys live in the workspace's .env, which git must ignore. BenchyOS writes
 * and deletes keys there but never hands a value back out: the API only reports
 * names, whether a key is set and who uses it.
 */

const NAME = /^[A-Z_][A-Z0-9_]*$/;

export function isSecretName(name: string): boolean {
	return NAME.test(name);
}

async function envFileLines(ws: Workspace): Promise<string[]> {
	const text = await readFile(ws.envFile, 'utf8').catch(() => '');
	return text ? text.replace(/\n$/, '').split('\n') : [];
}

function keyOf(line: string): string | null {
	const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
	return m ? m[1] : null;
}

export async function listSecrets(ws: Workspace, lib: Library): Promise<SecretInfo[]> {
	const used = new Map<string, string[]>();
	const use = (name: string | undefined, who: string) => {
		if (!name) return;
		used.set(name, [...(used.get(name) ?? []), who]);
	};
	for (const bp of lib.blueprints.values()) use(bp.endpoint?.api_key_env, `blueprint ${bp.id}`);
	for (const j of lib.judges.values()) use(j.endpoint?.api_key_env, `judge ${j.id}`);
	const inFile = new Set(
		(await envFileLines(ws)).map(keyOf).filter((k): k is string => !!k && NAME.test(k))
	);
	const names = new Set([...used.keys(), ...inFile]);
	return [...names].sort().map((name) => ({
		name,
		set: !!process.env[name],
		source: inFile.has(name) ? 'env-file' : process.env[name] ? 'environment' : null,
		used_by: used.get(name) ?? []
	}));
}

/** Refuses to write unless git ignores .env and does not track it. Outside a git repo there is nothing to leak into. */
export async function assertEnvIgnored(ws: Workspace): Promise<void> {
	const inRepo = await execCapture('git', ['rev-parse', '--is-inside-work-tree'], { cwd: ws.root });
	if (inRepo.code !== 0) return;
	const tracked = await execCapture('git', ['ls-files', '--error-unmatch', '.env'], {
		cwd: ws.root
	});
	if (tracked.code === 0)
		throw Object.assign(new Error('.env is tracked by git; refusing to write API keys into it'), {
			status: 409
		});
	const ignored = await execCapture('git', ['check-ignore', '-q', '.env'], { cwd: ws.root });
	if (ignored.code !== 0)
		throw Object.assign(new Error('.env is not ignored by git; add it to .gitignore first'), {
			status: 409
		});
}

function quote(value: string): string {
	if (/^[A-Za-z0-9_\-.:/+=@]*$/.test(value)) return value;
	return `'${value}'`;
}

async function writeEnv(ws: Workspace, lines: string[]): Promise<void> {
	const tmp = `${ws.envFile}.${randomBytes(4).toString('hex')}.tmp`;
	await writeFile(tmp, lines.length ? lines.join('\n') + '\n' : '', { mode: 0o600 });
	await rename(tmp, ws.envFile);
}

export async function setSecret(ws: Workspace, name: string, value: string): Promise<void> {
	if (!NAME.test(name))
		throw Object.assign(new Error(`invalid key name: ${name}`), { status: 400 });
	if (!value || /[\r\n']/.test(value))
		throw Object.assign(new Error('the value must be one line without single quotes'), {
			status: 400
		});
	await assertEnvIgnored(ws);
	const lines = (await envFileLines(ws)).filter((l) => keyOf(l) !== name);
	lines.push(`${name}=${quote(value)}`);
	await writeEnv(ws, lines);
	process.env[name] = value;
}

export async function deleteSecret(ws: Workspace, name: string): Promise<void> {
	if (!NAME.test(name))
		throw Object.assign(new Error(`invalid key name: ${name}`), { status: 400 });
	const lines = await envFileLines(ws);
	const rest = lines.filter((l) => keyOf(l) !== name);
	if (rest.length !== lines.length) {
		if (rest.length) await writeEnv(ws, rest);
		else await rm(ws.envFile, { force: true });
		// A key from the shell environment stays; only the one BenchyOS stored goes.
		delete process.env[name];
	}
}
