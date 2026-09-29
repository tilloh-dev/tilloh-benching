import { readFile } from 'node:fs/promises';
import { execCapture } from '../util/exec.ts';

let wslCache: boolean | null = null;

export async function isWsl(): Promise<boolean> {
	if (wslCache !== null) return wslCache;
	if (process.env.WSL_DISTRO_NAME) return (wslCache = true);
	try {
		const v = await readFile('/proc/version', 'utf8');
		wslCache = /microsoft|wsl/i.test(v);
	} catch {
		wslCache = false;
	}
	return wslCache;
}

/** POSIX → Windows path for a Windows binary (C:/…, or //wsl.localhost/… for the Linux side). */
export async function toWindowsPath(path: string): Promise<string> {
	if (/^[A-Za-z]:[\\/]/.test(path)) return path.replace(/\\/g, '/');
	const r = await execCapture('wslpath', ['-m', path]);
	return r.code === 0 ? r.stdout.trim() : path;
}

export async function toPosixPath(path: string): Promise<string> {
	if (path.startsWith('/')) return path;
	const r = await execCapture('wslpath', ['-u', path]);
	return r.code === 0 ? r.stdout.trim() : path;
}

/** The Windows host as seen from WSL2 NAT networking. */
export async function wslGateway(): Promise<string | null> {
	const r = await execCapture('ip', ['route', 'show', 'default']);
	const m = /default via (\S+)/.exec(r.stdout);
	return m ? m[1] : null;
}

export async function windowsTempDir(): Promise<string | null> {
	const r = await execCapture('cmd.exe', ['/c', 'echo %TEMP%'], { cwd: '/mnt/c' });
	const win = r.stdout.trim();
	if (r.code !== 0 || !win || win.includes('%')) return null;
	return toPosixPath(win);
}

/** Quote a string for a PowerShell single-quoted literal. */
export function psQuote(s: string): string {
	return `'${s.replace(/'/g, "''")}'`;
}
