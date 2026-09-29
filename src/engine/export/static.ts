import { cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Engine } from '../run/engine.ts';
import type { IndexPayload, RunDetail } from '../api-types.ts';
import { attemptDetail, libraryPayload, statusPayload } from '../views.ts';
import { attemptDir, runDir } from '../core/workspace.ts';
import { ensureDir, exists, writeJson } from '../util/fs.ts';

export function exportAttemptFile(id: string): string {
	return `${id.replaceAll('/', '__')}.json`;
}

/**
 * Writes a read-only copy of BenchyOS: the built SPA, JSON snapshots of the
 * index, library, runs and attempts, and every file the viewer links to.
 * The SPA detects `data/index.json` and switches to static mode.
 */
export async function exportStatic(
	engine: Engine,
	outDir: string,
	o: { uiDir: string; runs?: string[] }
): Promise<{ runs: number; attempts: number }> {
	if (!(await exists(join(o.uiDir, 'index.html'))))
		throw new Error('BenchyOS is not built — run `pnpm build` first');
	await engine.index.scan();
	const runIds = o.runs?.length ? o.runs : [...engine.index.runs.keys()];
	const missing = runIds.filter((id) => !engine.index.runs.has(id));
	if (missing.length) throw new Error(`unknown runs: ${missing.join(', ')}`);
	await ensureDir(outDir);
	await cp(o.uiDir, outDir, { recursive: true });

	const keep = new Set(runIds);
	const attempts = engine.index.attemptRows((a) => keep.has(a.run_id));
	const index: IndexPayload = {
		status: await statusPayload(engine, 'static'),
		runs: engine.index.runRows().filter((r) => keep.has(r.id)),
		attempts
	};
	await writeJson(join(outDir, 'data', 'index.json'), index);
	await writeJson(join(outDir, 'data', 'library.json'), await libraryPayload(engine));

	for (const id of runIds) {
		const run = engine.index.runs.get(id)!;
		const detail: RunDetail = { run, attempts: attempts.filter((a) => a.run_id === id) };
		await writeJson(join(outDir, 'data', 'runs', `${id}.json`), detail);
		for (const f of ['llama-preset.ini', 'llama-server.log', 'run.log']) {
			const src = join(runDir(engine.ws, id), f);
			if (await exists(src)) await cp(src, join(outDir, 'files', id, f));
		}
	}
	for (const row of attempts) {
		const detail = await attemptDetail(engine, row.id, (rel) => `files/${rel}`);
		if (!detail) continue;
		await writeJson(join(outDir, 'data', 'attempts', exportAttemptFile(row.id)), detail);
		const a = detail.attempt;
		const src = attemptDir(engine.ws, a.run_id, a.blueprint_id, a.test_id, a.rep);
		const dst = join(outDir, 'files', a.run_id, a.blueprint_id, a.test_id, String(a.rep));
		for (const entry of [
			'artifacts',
			'evidence',
			'judgements',
			'response.md',
			'reasoning.md',
			'raw.json',
			'checks.json'
		]) {
			if (await exists(join(src, entry)))
				await cp(join(src, entry), join(dst, entry), { recursive: true });
		}
	}
	const readme = `Benchy static export — ${new Date().toISOString()}\nServe this directory with any static web server (ES modules do not load from file://), e.g.\n  python3 -m http.server --directory . 8000\n`;
	await writeFile(join(outDir, 'README.txt'), readme);
	return { runs: runIds.length, attempts: attempts.length };
}
