import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Attempt, ChecksFile, HumanRating, Judgement } from '../core/schema.ts';
import { attemptDir, parseAttemptId, type Workspace } from '../core/workspace.ts';
import { exists, listFiles, readJson, readJsonOr, writeFileAtomic, writeJson } from '../util/fs.ts';
import { KeyedMutex } from '../util/lock.ts';

const mutex = new KeyedMutex();

export function dirOfAttempt(ws: Workspace, id: string): string {
	const p = parseAttemptId(id);
	if (!p) throw new Error(`invalid attempt id: ${id}`);
	return attemptDir(ws, p.runId, p.blueprintId, p.testId, p.rep);
}

export async function readAttempt(ws: Workspace, id: string): Promise<Attempt | null> {
	const path = join(dirOfAttempt(ws, id), 'attempt.json');
	if (!(await exists(path))) return null;
	return readJson<Attempt>(path);
}

export async function writeAttempt(ws: Workspace, attempt: Attempt): Promise<void> {
	await writeJson(join(dirOfAttempt(ws, attempt.id), 'attempt.json'), attempt);
}

/** Read-modify-write under a per-attempt lock. */
export async function updateAttempt(
	ws: Workspace,
	id: string,
	patch: (a: Attempt) => Attempt | void
): Promise<Attempt> {
	return mutex.run(id, async () => {
		const current = await readAttempt(ws, id);
		if (!current) throw new Error(`attempt not found: ${id}`);
		const next = patch(current) ?? current;
		await writeAttempt(ws, next);
		return next;
	});
}

export async function writeAttemptText(ws: Workspace, id: string, rel: string, text: string) {
	await writeFileAtomic(join(dirOfAttempt(ws, id), rel), text);
}

export async function readAttemptText(
	ws: Workspace,
	id: string,
	rel: string
): Promise<string | null> {
	try {
		return await readFile(join(dirOfAttempt(ws, id), rel), 'utf8');
	} catch {
		return null;
	}
}

export async function readChecks(ws: Workspace, id: string): Promise<ChecksFile | null> {
	return readJsonOr<ChecksFile | null>(join(dirOfAttempt(ws, id), 'checks.json'), null);
}

export async function writeChecks(ws: Workspace, id: string, checks: ChecksFile): Promise<void> {
	await writeJson(join(dirOfAttempt(ws, id), 'checks.json'), checks);
}

export async function listJudgements(ws: Workspace, id: string): Promise<Judgement[]> {
	const dir = join(dirOfAttempt(ws, id), 'judgements');
	const out: Judgement[] = [];
	for (const name of await listFiles(dir)) {
		if (!name.endsWith('.json')) continue;
		const j = await readJsonOr<Judgement | null>(join(dir, name), null);
		if (j) out.push(j);
	}
	return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function writeJudgement(ws: Workspace, id: string, j: Judgement): Promise<void> {
	await writeJson(join(dirOfAttempt(ws, id), 'judgements', `${j.fingerprint}.json`), j);
}

export async function readHuman(ws: Workspace, id: string): Promise<HumanRating | null> {
	return readJsonOr<HumanRating | null>(join(dirOfAttempt(ws, id), 'human.json'), null);
}

export async function writeHuman(ws: Workspace, id: string, rating: HumanRating): Promise<void> {
	await writeJson(join(dirOfAttempt(ws, id), 'human.json'), rating);
}
