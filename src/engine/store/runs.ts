import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { RunRecord } from '../core/schema.ts';
import { runDir, type Workspace } from '../core/workspace.ts';
import { exists, listDirs, readJson, writeJson } from '../util/fs.ts';
import { KeyedMutex } from '../util/lock.ts';
import { compactStamp } from '../util/time.ts';

const mutex = new KeyedMutex();

export function slugHost(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 24) || 'host'
	);
}

/** 2026-09-29T1012Z-hermine-a1b2 — sortable and unique across hosts sharing one repo. */
export function newRunId(host: string, date = new Date()): string {
	return `${compactStamp(date)}-${slugHost(host)}-${randomBytes(2).toString('hex')}`;
}

export async function readRun(ws: Workspace, id: string): Promise<RunRecord | null> {
	const path = join(runDir(ws, id), 'run.json');
	if (!(await exists(path))) return null;
	return readJson<RunRecord>(path);
}

export async function writeRun(ws: Workspace, run: RunRecord): Promise<void> {
	await writeJson(join(runDir(ws, run.id), 'run.json'), run);
}

export async function updateRun(
	ws: Workspace,
	id: string,
	patch: (r: RunRecord) => RunRecord | void
): Promise<RunRecord> {
	return mutex.run(id, async () => {
		const current = await readRun(ws, id);
		if (!current) throw new Error(`run not found: ${id}`);
		const next = patch(current) ?? current;
		await writeRun(ws, next);
		return next;
	});
}

export async function listRunIds(ws: Workspace): Promise<string[]> {
	const ids = [];
	for (const name of await listDirs(ws.runs)) {
		if (await exists(join(ws.runs, name, 'run.json'))) ids.push(name);
	}
	return ids.sort().reverse();
}
