import { spawn } from 'node:child_process';

export type ExecResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

/** Runs a command to completion and captures its output. Never throws for non-zero exits. */
export function execCapture(
	cmd: string,
	args: string[],
	opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv; cwd?: string; input?: string } = {}
): Promise<ExecResult> {
	return new Promise((resolve) => {
		let child;
		try {
			child = spawn(cmd, args, { env: opts.env, cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
		} catch (e) {
			resolve({ code: null, stdout: '', stderr: (e as Error).message, timedOut: false });
			return;
		}
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGKILL');
		}, opts.timeoutMs ?? 15_000);
		child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
		child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
		child.on('error', (e) => {
			clearTimeout(timer);
			resolve({ code: null, stdout, stderr: stderr + e.message, timedOut });
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ code, stdout, stderr, timedOut });
		});
		child.stdin.on('error', () => undefined);
		child.stdin.end(opts.input ?? '');
	});
}

export async function which(cmd: string): Promise<string | null> {
	const r = await execCapture('sh', ['-c', `command -v "$1"`, 'sh', cmd], { timeoutMs: 5000 });
	const path = r.stdout.trim();
	return r.code === 0 && path ? path : null;
}
