import { mkdir, readFile, rename, writeFile, stat, readdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export async function ensureDir(dir: string): Promise<void> {
	await mkdir(dir, { recursive: true });
}

export async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

/** Write via temp file + rename so a crash never leaves half-written JSON behind. */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
	await ensureDir(dirname(path));
	const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
	await writeFile(tmp, data);
	await rename(tmp, path);
}

export async function writeJson(path: string, value: unknown): Promise<void> {
	await writeFileAtomic(path, JSON.stringify(value, null, '\t') + '\n');
}

export async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function readJsonOr<T>(path: string, fallback: T): Promise<T> {
	try {
		return await readJson<T>(path);
	} catch {
		return fallback;
	}
}

export async function listDirs(dir: string): Promise<string[]> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries
			.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
			.map((e) => e.name)
			.sort();
	} catch {
		return [];
	}
}

export async function listFiles(dir: string): Promise<string[]> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries
			.filter((e) => e.isFile())
			.map((e) => e.name)
			.sort();
	} catch {
		return [];
	}
}

/** Recursive file listing relative to `dir`, skipping dot-directories. */
export async function walkFiles(dir: string, prefix = ''): Promise<string[]> {
	const out: string[] = [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		const rel = prefix ? `${prefix}/${e.name}` : e.name;
		if (e.isDirectory()) {
			if (e.name.startsWith('.') || e.name === 'node_modules') continue;
			out.push(...(await walkFiles(`${dir}/${e.name}`, rel)));
		} else if (e.isFile()) {
			out.push(rel);
		}
	}
	return out;
}

/** Reject paths that would escape their base directory. */
export function safeRelative(path: string): string | null {
	const norm = path.replace(/\\/g, '/').replace(/^\.\/+/, '');
	if (!norm || norm.startsWith('/') || /^[A-Za-z]:/.test(norm)) return null;
	const parts = norm.split('/');
	if (parts.some((p) => p === '..' || p === '')) return null;
	return norm;
}
