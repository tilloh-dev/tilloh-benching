import { spawn } from 'node:child_process';
import { cp, lstat, mkdtemp, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CheckIssue, EvidenceRef } from '../core/schema.ts';
import { extensionOf } from '../core/kinds.ts';
import { which } from '../util/exec.ts';
import { artifactsOfKind, num, skipped, type CheckImpl } from './types.ts';

/**
 * Runs generated programs inside bubblewrap: no network, no view of $HOME,
 * a throwaway copy of the artifacts as /work, tmpfs /tmp and a hard timeout.
 * The whole PID namespace dies with bwrap, so forks cannot outlive the run.
 */

export type Expectation = {
	exit_code?: number;
	stdout_contains?: string[];
	stdout_not_contains?: string[];
	stdout_matches?: string;
	stdout_equals?: string;
	stderr_empty?: boolean;
	max_ms?: number;
};

export type ProgramCase = {
	name?: string;
	stdin?: string;
	args?: string[];
	expect?: Expectation;
	timeout_s?: number;
};

type Plan = { compile?: string[]; run: string[]; needs: string[] };

export function planFor(file: string, opts: Record<string, unknown>): Plan {
	if (Array.isArray(opts.cmd)) {
		return {
			compile: Array.isArray(opts.compile) ? (opts.compile as string[]) : undefined,
			run: opts.cmd as string[],
			needs: [String((opts.cmd as string[])[0])]
		};
	}
	const ext = extensionOf(file);
	switch (ext) {
		case 'py':
			return { run: ['python3', file], needs: ['python3'] };
		case 'sh':
		case 'bash':
			return { run: ['bash', file], needs: ['bash'] };
		case 'js':
		case 'mjs':
		case 'ts':
			return { run: ['node', file], needs: ['node'] };
		case 'c':
			return {
				compile: ['gcc', '-O2', '-std=c17', '-o', 'prog', file, '-lm'],
				run: ['./prog'],
				needs: ['gcc']
			};
		case 'cpp':
		case 'cc':
			return {
				compile: ['g++', '-O2', '-std=c++20', '-o', 'prog', file],
				run: ['./prog'],
				needs: ['g++']
			};
		case 'rs':
			return { compile: ['rustc', '-O', '-o', 'prog', file], run: ['./prog'], needs: ['rustc'] };
		case 'go':
			return { run: ['go', 'run', file], needs: ['go'] };
		case 'rb':
			return { run: ['ruby', file], needs: ['ruby'] };
		case 'pl':
			return { run: ['perl', file], needs: ['perl'] };
		case 'lua':
			return { run: ['lua', file], needs: ['lua'] };
		default:
			return { run: [file], needs: [] };
	}
}

/** bwrap argv exposing a read-only /usr (+ merged-usr symlinks) and the node install if needed. */
export async function bwrapArgs(workDir: string, extraRo: string[] = []): Promise<string[]> {
	const args = ['--unshare-all', '--die-with-parent', '--new-session', '--ro-bind', '/usr', '/usr'];
	for (const top of ['bin', 'sbin', 'lib', 'lib32', 'lib64', 'libx32']) {
		try {
			const st = await lstat(`/${top}`);
			if (st.isSymbolicLink()) args.push('--symlink', await readlink(`/${top}`), `/${top}`);
			else if (st.isDirectory()) args.push('--ro-bind', `/${top}`, `/${top}`);
		} catch {
			/* absent */
		}
	}
	for (const etc of [
		'/etc/alternatives',
		'/etc/ld.so.cache',
		'/etc/ld.so.conf',
		'/etc/ld.so.conf.d',
		'/etc/localtime',
		'/etc/ssl'
	]) {
		args.push('--ro-bind-try', etc, etc);
	}
	for (const dir of extraRo) args.push('--ro-bind', dir, dir);
	args.push(
		'--proc',
		'/proc',
		'--dev',
		'/dev',
		'--tmpfs',
		'/tmp',
		'--bind',
		workDir,
		'/work',
		'--chdir',
		'/work'
	);
	return args;
}

type RunOutcome = {
	code: number | null;
	signal: string | null;
	stdout: string;
	stderr: string;
	ms: number;
	timedOut: boolean;
};

const CAP = 64 * 1024;

function runSandboxed(
	bwrap: string,
	bargs: string[],
	cmd: string[],
	env: Record<string, string>,
	stdin: string,
	timeoutMs: number,
	signal: AbortSignal
): Promise<RunOutcome> {
	const envArgs = ['--clearenv'];
	for (const [k, v] of Object.entries(env)) envArgs.push('--setenv', k, v);
	return new Promise((resolve) => {
		const started = performance.now();
		const child = spawn(bwrap, [...bargs, ...envArgs, '--', ...cmd], {
			stdio: ['pipe', 'pipe', 'pipe']
		});
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		const kill = () => child.exitCode === null && child.kill('SIGKILL');
		const timer = setTimeout(() => {
			timedOut = true;
			kill();
		}, timeoutMs);
		signal.addEventListener('abort', kill, { once: true });
		child.stdout.setEncoding('utf8').on('data', (d: string) => {
			if (stdout.length < CAP) stdout += d;
		});
		child.stderr.setEncoding('utf8').on('data', (d: string) => {
			if (stderr.length < CAP) stderr += d;
		});
		child.on('error', (e) => {
			stderr += `\n[benchy] ${e.message}`;
		});
		child.on('close', (code, sig) => {
			clearTimeout(timer);
			resolve({
				code,
				signal: sig,
				stdout,
				stderr,
				ms: Math.round(performance.now() - started),
				timedOut
			});
		});
		child.stdin.on('error', () => undefined);
		child.stdin.end(stdin);
	});
}

export function checkExpectation(
	out: RunOutcome,
	exp: Expectation,
	caseName: string
): CheckIssue[] {
	const issues: CheckIssue[] = [];
	const add = (kind: string, message: string) =>
		issues.push({
			check: 'program.run',
			severity: 'error',
			kind,
			message: `[${caseName}] ${message}`
		});
	if (out.timedOut) add('timeout', `timed out after ${out.ms} ms`);
	const wantExit = exp.exit_code ?? 0;
	if (!out.timedOut && out.code !== wantExit)
		add('exit-code', `exit code ${out.code ?? out.signal}, expected ${wantExit}`);
	for (const s of exp.stdout_contains ?? [])
		if (!out.stdout.includes(s)) add('stdout', `stdout does not contain ${JSON.stringify(s)}`);
	for (const s of exp.stdout_not_contains ?? [])
		if (out.stdout.includes(s)) add('stdout', `stdout contains ${JSON.stringify(s)}`);
	if (exp.stdout_matches && !new RegExp(exp.stdout_matches, 'm').test(out.stdout))
		add('stdout', `stdout does not match /${exp.stdout_matches}/`);
	if (exp.stdout_equals !== undefined && out.stdout.trim() !== exp.stdout_equals.trim())
		add('stdout', 'stdout differs from the expected output');
	if (exp.stderr_empty && out.stderr.trim()) add('stderr', 'stderr is not empty');
	if (exp.max_ms && out.ms > exp.max_ms) add('slow', `took ${out.ms} ms (limit ${exp.max_ms} ms)`);
	return issues;
}

function logText(cmd: string[], c: ProgramCase, out: RunOutcome): string {
	return [
		`$ ${cmd.join(' ')}${c.args?.length ? ' ' + c.args.join(' ') : ''}`,
		`exit: ${out.code ?? out.signal}${out.timedOut ? ' (timeout)' : ''}   time: ${out.ms} ms`,
		c.stdin ? `\n--- stdin ---\n${c.stdin.slice(0, 4000)}` : '',
		`\n--- stdout ---\n${out.stdout}`,
		`\n--- stderr ---\n${out.stderr}`
	].join('\n');
}

export const programRun: CheckImpl = {
	id: 'program.run',
	description:
		'Compiles/runs the program in a bubblewrap sandbox without network and checks expectations.',
	kinds: ['program'],
	async run(ctx) {
		const art = artifactsOfKind(ctx, ['program'])[0];
		if (!art) return skipped('no program artifact');
		const bwrap = (await which(ctx.settings.sandbox.bwrap)) ?? null;
		if (!bwrap) return skipped('bubblewrap (bwrap) is not installed — apt install bubblewrap');
		const file = art.path.replace(/^artifacts\//, '');
		const plan = planFor(file, ctx.options);
		for (const need of plan.needs) {
			if (need === 'node' || need.startsWith('./') || need === file) continue;
			if (!(await which(need))) return skipped(`${need} is not installed on this host`);
		}
		const nodeDir = dirname(process.execPath);
		const extraRo =
			plan.needs.includes('node') && !nodeDir.startsWith('/usr') ? [dirname(nodeDir)] : [];
		const env: Record<string, string> = {
			PATH: `${extraRo.length ? nodeDir + ':' : ''}/usr/local/bin:/usr/bin:/bin`,
			HOME: '/work',
			LANG: 'C.UTF-8',
			PYTHONDONTWRITEBYTECODE: '1'
		};
		const work = await mkdtemp(join(tmpdir(), 'benchy-run-'));
		const issues: CheckIssue[] = [];
		const evidence: EvidenceRef[] = [];
		const results: Record<string, unknown>[] = [];
		const defaultTimeout = num(ctx.options.timeout_s, ctx.settings.sandbox.timeout_s) * 1000;
		try {
			await cp(join(ctx.attemptDir, 'artifacts'), work, { recursive: true });
			const bargs = await bwrapArgs(work, extraRo);
			if (plan.compile) {
				const out = await runSandboxed(
					bwrap,
					bargs,
					plan.compile,
					env,
					'',
					defaultTimeout * 4,
					ctx.signal
				);
				evidence.push(
					await ctx.saveEvidence(
						'program-compile.log',
						logText(plan.compile, {}, out),
						'log',
						'Compile log'
					)
				);
				if (out.code !== 0) {
					issues.push({
						check: 'program.run',
						severity: 'error',
						kind: 'compile',
						message: `compilation failed (exit ${out.code}): ${out.stderr.slice(0, 600)}`
					});
					return { status: 'fail', issues, evidence, data: { compile_ms: out.ms } };
				}
			}
			const cases: ProgramCase[] = Array.isArray(ctx.options.cases)
				? (ctx.options.cases as ProgramCase[])
				: [
						{
							name: 'default',
							stdin: ctx.options.stdin as string | undefined,
							args: ctx.options.args as string[] | undefined,
							expect: ctx.options.expect as Expectation | undefined
						}
					];
			for (const [i, c] of cases.entries()) {
				const name = c.name ?? `case-${i + 1}`;
				const cmd = [...plan.run, ...(c.args ?? [])];
				const out = await runSandboxed(
					bwrap,
					bargs,
					cmd,
					env,
					c.stdin ?? '',
					c.timeout_s ? c.timeout_s * 1000 : defaultTimeout,
					ctx.signal
				);
				issues.push(...checkExpectation(out, c.expect ?? {}, name));
				results.push({
					name,
					exit: out.code,
					ms: out.ms,
					timed_out: out.timedOut,
					stdout_bytes: out.stdout.length
				});
				evidence.push(
					await ctx.saveEvidence(
						`program-${name.replace(/[^\w.-]+/g, '_')}.log`,
						logText(plan.run, c, out),
						'log',
						`Run: ${name}`
					)
				);
			}
		} finally {
			await rm(work, { recursive: true, force: true });
		}
		return {
			status: issues.length ? 'fail' : 'pass',
			issues,
			evidence,
			data: { command: plan.run, cases: results }
		};
	}
};
