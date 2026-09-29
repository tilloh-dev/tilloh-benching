import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Workspace } from '../core/workspace.ts';
import type { ResolvedSettings } from '../core/settings.ts';
import type { Blueprint } from '../core/schema.ts';
import { ensureDir, exists, readJsonOr, writeJson } from '../util/fs.ts';
import { execCapture, which } from '../util/exec.ts';
import { sleep } from '../util/time.ts';
import { presetSection, renderIni } from './preset.ts';
import {
	isWsl,
	psQuote,
	toPosixPath,
	toWindowsPath,
	windowsTempDir,
	wslGateway
} from './platform.ts';

export type LlamaMode = 'linux' | 'wsl-exe';

export type LlamaState = 'stopped' | 'starting' | 'ready' | 'loading' | 'error';

export type LlamaStatus = {
	state: LlamaState;
	mode?: LlamaMode;
	binary?: string;
	port?: number;
	url?: string;
	pid?: number;
	loaded?: string;
	error?: string;
	started_at?: string;
};

export class LlamaConflictError extends Error {
	readonly conflicts: string[];
	constructor(conflicts: string[]) {
		super(
			`another llama-server is already running on this host:\n  ${conflicts.join('\n  ')}\n` +
				'Benchy only starts its own instance when the GPU is free. Stop the other server and retry.'
		);
		this.name = 'LlamaConflictError';
		this.conflicts = conflicts;
	}
}

type PidFile = { pid: number; mode: LlamaMode; port: number; started_at: string };

const SEARCH_ROOTS = [
	'tooling/llama.cpp/vendor',
	'Programming/tilloh-backup/llama.cpp/vendor',
	'llama.cpp/build/bin'
];

function expandHome(p: string): string {
	return p.startsWith('~/') ? join(homedir(), p.slice(2)) : p;
}

async function findIn(dir: string, names: string[], depth = 4): Promise<string | null> {
	const { readdir } = await import('node:fs/promises');
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return null;
	}
	for (const e of entries) if (e.isFile() && names.includes(e.name)) return join(dir, e.name);
	if (depth <= 0) return null;
	// Newest build directory first (llama-b10786 before llama-b10621).
	const dirs = entries
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort()
		.reverse();
	for (const d of dirs) {
		const hit = await findIn(join(dir, d), names, depth - 1);
		if (hit) return hit;
	}
	return null;
}

/** Locates llama-server: settings → PATH → the tooling repo layouts used on hermine/Gertrude. */
export async function findLlamaBinary(settings: ResolvedSettings): Promise<string | null> {
	if (settings.llama.binary) {
		const p = expandHome(settings.llama.binary);
		return (await exists(p)) ? p : null;
	}
	const onPath = await which('llama-server');
	if (onPath) return onPath;
	const wsl = await isWsl();
	const names = wsl ? ['llama-server', 'llama-server.exe'] : ['llama-server'];
	for (const root of SEARCH_ROOTS) {
		const hit = await findIn(join(homedir(), root), names);
		if (hit) return hit;
	}
	if (wsl) {
		const { readdir } = await import('node:fs/promises');
		for (const user of await readdir('/mnt/c/Users').catch(() => [] as string[])) {
			const hit = await findIn(join('/mnt/c/Users', user, 'tooling/llama.cpp/vendor'), [
				'llama-server.exe'
			]);
			if (hit) return hit;
		}
	}
	return null;
}

export function modeFor(binary: string, setting: ResolvedSettings['llama']['mode']): LlamaMode {
	if (setting === 'linux' || setting === 'wsl-exe') return setting;
	return binary.toLowerCase().endsWith('.exe') ? 'wsl-exe' : 'linux';
}

/** Windows CreateProcess quoting for one argument passed through Start-Process -ArgumentList. */
export function winArg(a: string): string {
	return /[\s"]/.test(a) ? `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"` : a;
}

export function buildStartProcessCommand(o: {
	exe: string;
	args: string[];
	workDir: string;
	stdout: string;
	stderr: string;
}): string {
	const argList = o.args.map((a) => psQuote(winArg(a))).join(',');
	return [
		`$p = Start-Process -FilePath ${psQuote(o.exe)}`,
		`-ArgumentList @(${argList})`,
		`-WorkingDirectory ${psQuote(o.workDir)}`,
		'-WindowStyle Hidden',
		`-RedirectStandardOutput ${psQuote(o.stdout)}`,
		`-RedirectStandardError ${psQuote(o.stderr)}`,
		'-PassThru; Write-Output $p.Id'
	].join(' ');
}

type Proc = { pid: number; ppid: number };

/** Drops `own` and all of its descendants from a process list. */
export function ownedFilter<T extends Proc>(procs: T[], own: number | undefined): T[] {
	if (!own) return procs;
	const owned = new Set([own]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const p of procs) {
			if (!owned.has(p.pid) && owned.has(p.ppid)) {
				owned.add(p.pid);
				grew = true;
			}
		}
	}
	return procs.filter((p) => !owned.has(p.pid));
}

async function windowsLlamaProcesses(): Promise<Proc[]> {
	const r = await execCapture(
		'powershell.exe',
		[
			'-NoProfile',
			'-NonInteractive',
			'-Command',
			'Get-CimInstance Win32_Process -Filter "Name=\'llama-server.exe\'" | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId)" }'
		],
		{ cwd: '/mnt/c', timeoutMs: 20_000 }
	);
	return r.stdout
		.split(/\r?\n/)
		.map((l) => /^(\d+),(\d+)$/.exec(l.trim()))
		.filter((m): m is RegExpExecArray => !!m)
		.map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]) }));
}

export function parseTasklist(csv: string): number[] {
	const pids: number[] = [];
	for (const line of csv.split(/\r?\n/)) {
		const m = /^"llama-server\.exe","(\d+)"/i.exec(line.trim());
		if (m) pids.push(Number(m[1]));
	}
	return pids;
}

/**
 * Owns exactly one llama-server in router mode, started with a preset Benchy
 * generated. Only ever stops the process it started itself (by PID).
 */
export class LlamaManager {
	readonly ws: Workspace;
	settings: ResolvedSettings;
	readonly log: (line: string) => void;
	status: LlamaStatus = { state: 'stopped' };
	apiKey = randomBytes(16).toString('hex');
	#logFiles: string[] = [];
	#pidFile: string;

	constructor(ws: Workspace, settings: ResolvedSettings, log: (line: string) => void = () => {}) {
		this.ws = ws;
		this.settings = settings;
		this.log = log;
		this.#pidFile = join(ws.cache, 'llama-server.pid.json');
	}

	get url(): string | undefined {
		return this.status.url;
	}

	async binary(): Promise<string> {
		const b = await findLlamaBinary(this.settings);
		if (!b) {
			throw new Error(
				'llama-server not found. Set llama.binary in benchy.local.yaml (Windows .exe paths work from WSL, e.g. /mnt/c/Users/<you>/tooling/llama.cpp/vendor/.../llama-server.exe).'
			);
		}
		return b;
	}

	async version(binary?: string): Promise<string | undefined> {
		const bin = binary ?? (await this.binary());
		const r = await execCapture(bin, ['--version'], {
			timeoutMs: 20_000,
			env: {
				...process.env,
				LD_LIBRARY_PATH: `${dirname(bin)}:${process.env.LD_LIBRARY_PATH ?? ''}`
			}
		});
		const text = `${r.stdout}\n${r.stderr}`;
		const m = /version:\s*(\S+)[^\n]*/i.exec(text);
		return m ? m[0].trim() : text.trim().split('\n').pop();
	}

	/**
	 * Other llama-server processes (or a busy port) that would compete for the GPU.
	 * The router spawns one child llama-server per loaded model; those are ours.
	 */
	async conflicts(mode?: LlamaMode): Promise<string[]> {
		const out: string[] = [];
		const own = this.status.pid;
		const ps = await execCapture('ps', ['-eo', 'pid=,ppid=,comm=,args=']);
		const procs = ps.stdout
			.split('\n')
			.map((l) => /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(l))
			.filter((m): m is RegExpExecArray => !!m)
			.map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), comm: m[3], args: m[4] }));
		for (const p of ownedFilter(
			procs.filter((p) => p.comm === 'llama-server'),
			own
		)) {
			out.push(`pid ${p.pid}: ${p.args.slice(0, 160)}`);
		}
		if ((mode ?? 'linux') === 'wsl-exe' || (await isWsl())) {
			for (const p of ownedFilter(await windowsLlamaProcesses(), own)) {
				out.push(`Windows pid ${p.pid}: llama-server.exe`);
			}
		}
		const port = this.settings.llama.port;
		try {
			const res = await fetch(`http://127.0.0.1:${port}/health`, {
				signal: AbortSignal.timeout(1500)
			});
			if (!own) out.push(`port ${port} already answers (HTTP ${res.status})`);
		} catch {
			/* free */
		}
		return out;
	}

	/** Kill a server a previous Benchy process started and did not stop (crash). Ours by PID file only. */
	async reapOrphan(): Promise<void> {
		const pf = await readJsonOr<PidFile | null>(this.#pidFile, null);
		if (!pf) return;
		this.log(`reaping orphaned llama-server pid ${pf.pid} (${pf.mode}) from ${pf.started_at}`);
		await this.#killPid(pf.mode, pf.pid);
		await rm(this.#pidFile, { force: true });
	}

	async sectionsFor(
		blueprints: Blueprint[],
		mode: LlamaMode
	): Promise<Record<string, Record<string, string>>> {
		const sections: Record<string, Record<string, string>> = {};
		for (const bp of blueprints) {
			sections[bp.id] = await presetSection(bp, {
				modelsDir: this.settings.llama.models_dir
					? expandHome(this.settings.llama.models_dir)
					: undefined,
				hostPath: mode === 'wsl-exe' ? toWindowsPath : undefined
			});
		}
		return sections;
	}

	/** Writes the preset and starts the router. Throws LlamaConflictError if the GPU is taken. */
	async start(opts: { runDir: string; runId: string; blueprints: Blueprint[] }) {
		if (this.status.state === 'ready') await this.stop();
		await this.reapOrphan();
		const binary = await this.binary();
		const mode = modeFor(binary, this.settings.llama.mode);
		const conflicts = await this.conflicts(mode);
		if (conflicts.length) throw new LlamaConflictError(conflicts);

		const sections = await this.sectionsFor(opts.blueprints, mode);
		const ini = renderIni(sections, `Generated by Benchy for run ${opts.runId}. Do not edit.`);
		await ensureDir(opts.runDir);
		await writeFile(join(opts.runDir, 'llama-preset.ini'), ini);
		const port = this.settings.llama.port;
		this.status = { state: 'starting', mode, binary, port, started_at: new Date().toISOString() };
		this.log(`starting llama-server (${mode}) ${binary} on port ${port}`);

		try {
			if (mode === 'linux') await this.#startLinux(binary, ini, opts.runDir, port);
			else await this.#startWindows(binary, ini, opts.runId, port);
			await writeJson(this.#pidFile, {
				pid: this.status.pid!,
				mode,
				port,
				started_at: this.status.started_at!
			} satisfies PidFile);
			await this.#waitHealthy(mode, port);
			this.status.state = 'ready';
			this.log(`llama-server ready at ${this.status.url}`);
		} catch (e) {
			await this.stop().catch(() => undefined);
			this.status = { ...this.status, state: 'error', error: (e as Error).message };
			throw e;
		}
		return {
			mode,
			binary,
			port,
			sections,
			url: this.status.url!,
			presetFile: join(opts.runDir, 'llama-preset.ini')
		};
	}

	#commonArgs(presetPath: string, port: number, bind: string): string[] {
		return [
			'--models-preset',
			presetPath,
			'--models-max',
			'1',
			'--host',
			bind,
			'--port',
			String(port),
			'--api-key',
			this.apiKey,
			...this.settings.llama.extra_args
		];
	}

	async #startLinux(binary: string, ini: string, runDir: string, port: number) {
		const presetPath = join(runDir, 'llama-preset.ini');
		await writeFile(presetPath, ini);
		const logPath = join(runDir, 'llama-server.log');
		const fd = openSync(logPath, 'a');
		this.#logFiles = [logPath];
		const bind = this.settings.llama.bind ?? '127.0.0.1';
		const child = spawn(binary, this.#commonArgs(presetPath, port, bind), {
			detached: true,
			stdio: ['ignore', fd, fd],
			env: {
				...process.env,
				LD_LIBRARY_PATH: `${dirname(binary)}:${process.env.LD_LIBRARY_PATH ?? ''}`
			}
		});
		closeSync(fd);
		this.status.pid = child.pid;
		child.on('exit', (code, sig) => {
			if (this.status.state !== 'stopped') {
				this.status = {
					...this.status,
					state: 'error',
					error: `llama-server exited (${code ?? sig})`
				};
				this.log(`llama-server exited unexpectedly (${code ?? sig})`);
			}
		});
		const host = this.settings.llama.connect_host ?? (bind === '0.0.0.0' ? '127.0.0.1' : bind);
		this.status.url = `http://${host}:${port}`;
	}

	async #startWindows(binary: string, ini: string, runId: string, port: number) {
		const tmp = await windowsTempDir();
		if (!tmp) throw new Error('cannot resolve the Windows %TEMP% directory from WSL');
		const dir = join(tmp, 'benchy', runId);
		await ensureDir(dir);
		const presetPosix = join(dir, 'llama-preset.ini');
		await writeFile(presetPosix, ini);
		const outPosix = join(dir, 'llama-server.out.log');
		const errPosix = join(dir, 'llama-server.err.log');
		this.#logFiles = [outPosix, errPosix];
		const exe = await toWindowsPath(binary);
		const bind = this.settings.llama.bind ?? '0.0.0.0';
		const cmd = buildStartProcessCommand({
			exe,
			args: this.#commonArgs(await toWindowsPath(presetPosix), port, bind),
			workDir: dirname(exe),
			stdout: await toWindowsPath(outPosix),
			stderr: await toWindowsPath(errPosix)
		});
		const r = await execCapture(
			'powershell.exe',
			['-NoProfile', '-NonInteractive', '-Command', cmd],
			{
				timeoutMs: 30_000,
				cwd: '/mnt/c'
			}
		);
		const pid = Number(r.stdout.trim().split(/\s+/).pop());
		if (r.code !== 0 || !Number.isInteger(pid) || pid <= 0) {
			throw new Error(
				`Start-Process failed (exit ${r.code}): ${(r.stderr || r.stdout).slice(0, 600)}`
			);
		}
		this.status.pid = pid;
		// NAT networking reaches Windows through the gateway, mirrored networking through loopback.
		const candidates = this.settings.llama.connect_host
			? [this.settings.llama.connect_host]
			: ['127.0.0.1', ...((await wslGateway()) ? [(await wslGateway())!] : [])];
		this.status.url = candidates.map((h) => `http://${h}:${port}`).join('|');
	}

	async #waitHealthy(mode: LlamaMode, port: number) {
		const deadline = Date.now() + this.settings.llama.startup_timeout_s * 1000;
		const urls = (this.status.url ?? `http://127.0.0.1:${port}`).split('|');
		while (Date.now() < deadline) {
			if (this.status.state === 'error')
				throw new Error(this.status.error ?? 'llama-server failed to start');
			if (mode === 'wsl-exe' && !(await this.#windowsAlive(this.status.pid!))) {
				throw new Error(`llama-server.exe exited during startup:\n${await this.logTail(40)}`);
			}
			for (const url of urls) {
				try {
					const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
					if (res.ok) {
						this.status.url = url;
						return;
					}
				} catch {
					/* not yet */
				}
			}
			await sleep(750);
		}
		throw new Error(
			`llama-server did not become healthy within ${this.settings.llama.startup_timeout_s}s:\n${await this.logTail(40)}`
		);
	}

	async #windowsAlive(pid: number): Promise<boolean> {
		const r = await execCapture('tasklist.exe', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
			cwd: '/mnt/c'
		});
		return parseTasklist(r.stdout).includes(pid);
	}

	#headers(): Record<string, string> {
		return { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' };
	}

	/** Loads one preset section and returns how long loading took. */
	async load(model: string, signal?: AbortSignal): Promise<{ load_ms: number }> {
		if (!this.status.url || this.status.state === 'error')
			throw new Error(this.status.error ?? 'llama-server not running');
		if (this.status.loaded === model) return { load_ms: 0 };
		const started = performance.now();
		this.status.state = 'loading';
		this.log(`loading ${model}`);
		const deadline = Date.now() + this.settings.llama.load_timeout_s * 1000;
		try {
			const res = await fetch(`${this.status.url}/models/load`, {
				method: 'POST',
				headers: this.#headers(),
				body: JSON.stringify({ model }),
				signal
			}).catch(() => null);
			if (res && res.status !== 404) {
				while (Date.now() < deadline) {
					signal?.throwIfAborted();
					const state = await this.modelState(model);
					if (state === 'loaded') break;
					if (state === 'failed')
						throw new Error(`llama-server failed to load ${model}:\n${await this.logTail(30)}`);
					await sleep(1000, signal);
				}
			}
			// A one-token request proves the model answers and finishes any lazy loading.
			const warm = await fetch(`${this.status.url}/v1/chat/completions`, {
				method: 'POST',
				headers: this.#headers(),
				body: JSON.stringify({
					model,
					messages: [{ role: 'user', content: 'Hi' }],
					max_tokens: 1,
					stream: false
				}),
				signal: signal
					? AbortSignal.any([
							signal,
							AbortSignal.timeout(this.settings.llama.load_timeout_s * 1000)
						])
					: AbortSignal.timeout(this.settings.llama.load_timeout_s * 1000)
			});
			if (!warm.ok)
				throw new Error(
					`warmup for ${model} failed: HTTP ${warm.status} ${(await warm.text()).slice(0, 400)}`
				);
			this.status.loaded = model;
			this.status.state = 'ready';
			const load_ms = Math.round(performance.now() - started);
			this.log(`loaded ${model} in ${(load_ms / 1000).toFixed(1)}s`);
			return { load_ms };
		} catch (e) {
			this.status.state = this.status.state === 'loading' ? 'ready' : this.status.state;
			throw e;
		}
	}

	async modelState(
		model: string
	): Promise<'loaded' | 'loading' | 'unloaded' | 'failed' | 'unknown'> {
		try {
			const res = await fetch(`${this.status.url}/models`, {
				headers: this.#headers(),
				signal: AbortSignal.timeout(5000)
			});
			const body = (await res.json()) as { data?: { id?: string; status?: unknown }[] };
			const entry = body.data?.find((m) => m.id === model);
			const raw = entry?.status;
			const value =
				typeof raw === 'string' ? raw : ((raw as { value?: string } | undefined)?.value ?? '');
			if (/loaded/i.test(value) && !/unloaded/i.test(value)) return 'loaded';
			if (/loading/i.test(value)) return 'loading';
			if (/fail|error/i.test(value)) return 'failed';
			if (/unloaded/i.test(value)) return 'unloaded';
			return 'unknown';
		} catch {
			return 'unknown';
		}
	}

	async props(model: string): Promise<unknown> {
		for (const path of [`/props?model=${encodeURIComponent(model)}`, '/props']) {
			try {
				const res = await fetch(`${this.status.url}${path}`, {
					headers: this.#headers(),
					signal: AbortSignal.timeout(10_000)
				});
				if (res.ok) return await res.json();
			} catch {
				/* try next */
			}
		}
		return null;
	}

	async models(): Promise<unknown> {
		try {
			const res = await fetch(`${this.status.url}/models`, {
				headers: this.#headers(),
				signal: AbortSignal.timeout(5000)
			});
			return res.ok ? await res.json() : null;
		} catch {
			return null;
		}
	}

	endpointFor(model: string) {
		return { baseUrl: `${this.status.url}/v1`, model, apiKey: this.apiKey };
	}

	async logTail(lines = 80): Promise<string> {
		const parts: string[] = [];
		for (const f of this.#logFiles) {
			const text = await readFile(f, 'utf8').catch(() => '');
			if (text) parts.push(text.split('\n').slice(-lines).join('\n'));
		}
		return parts.join('\n');
	}

	/** Copies the server log into the run directory (Windows logs live in %TEMP%). */
	async collectLog(runDir: string, maxBytes = 512 * 1024): Promise<void> {
		let text = '';
		for (const f of this.#logFiles) text += await readFile(f, 'utf8').catch(() => '');
		if (text.length > maxBytes) text = '… (truncated)\n' + text.slice(-maxBytes);
		if (text) await writeFile(join(runDir, 'llama-server.log'), text);
	}

	async #killPid(mode: LlamaMode, pid: number) {
		if (mode === 'wsl-exe') {
			// By PID, never by image name: that would also kill the person's own router.
			await execCapture('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { cwd: '/mnt/c' });
			for (let i = 0; i < 30 && (await this.#windowsAlive(pid)); i++) await sleep(500);
			return;
		}
		try {
			process.kill(-pid, 'SIGTERM');
		} catch {
			try {
				process.kill(pid, 'SIGTERM');
			} catch {
				return;
			}
		}
		for (let i = 0; i < 30; i++) {
			try {
				process.kill(pid, 0);
			} catch {
				return;
			}
			await sleep(500);
		}
		try {
			process.kill(-pid, 'SIGKILL');
		} catch {
			/* gone */
		}
	}

	async stop(): Promise<void> {
		const { pid, mode } = this.status;
		this.status = { ...this.status, state: 'stopped', loaded: undefined };
		if (pid && mode) {
			this.log(`stopping llama-server pid ${pid}`);
			await this.#killPid(mode, pid);
		}
		this.status = { state: 'stopped' };
		await rm(this.#pidFile, { force: true });
	}
}

export async function llamaLogPath(runDirPath: string): Promise<string | null> {
	const p = join(runDirPath, 'llama-server.log');
	return (await exists(p)) ? p : null;
}

export { toPosixPath };
