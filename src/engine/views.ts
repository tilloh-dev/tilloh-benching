import { join } from 'node:path';
import type {
	AttemptDetail,
	BlueprintEntry,
	JudgeEntry,
	LibraryPayload,
	LlamaView,
	StatusPayload,
	TestEntry
} from './api-types.ts';
import { blueprintHash, testHashes } from './core/library.ts';
import type { Engine } from './run/engine.ts';
import { listChecks } from './checks/index.ts';
import {
	dirOfAttempt,
	listJudgements,
	readAttempt,
	readChecks,
	readHuman
} from './store/attempts.ts';
import { readRun } from './store/runs.ts';
import { toAttemptRow } from './store/index.ts';
import { hostInfo } from './run/host.ts';
import { exists } from './util/fs.ts';

export const VERSION = '0.1.0';

export async function libraryPayload(engine: Engine): Promise<LibraryPayload> {
	const lib = await engine.library();
	const { readFile } = await import('node:fs/promises');
	const blueprints: BlueprintEntry[] = [...lib.blueprintFiles.values()].map((file) => {
		const resolved = lib.blueprints.get(file.id) ?? null;
		return { id: file.id, file, resolved, hash: resolved ? blueprintHash(resolved) : null };
	});
	const tests: TestEntry[] = [];
	for (const [id, file] of lib.testFiles) {
		const resolved = lib.tests.get(id) ?? null;
		const prompt =
			resolved?.prompt ??
			(await readFile(join(engine.ws.tests, id, file.prompt_file ?? 'prompt.md'), 'utf8').catch(
				() => ''
			));
		tests.push({ id, file, prompt, resolved, hashes: resolved ? testHashes(resolved) : null });
	}
	const judges: JudgeEntry[] = [];
	for (const profile of lib.judges.values()) {
		const env = profile.endpoint?.api_key_env;
		judges.push({
			profile,
			builtin: !(await exists(join(engine.ws.judges, `${profile.id}.yaml`))),
			default: profile.id === engine.settings.judge.default_profile,
			key_set: env ? !!process.env[env] : null
		});
	}
	return {
		blueprints: blueprints.sort((a, b) => a.id.localeCompare(b.id)),
		tests: tests.sort((a, b) => a.id.localeCompare(b.id)),
		suites: [...lib.suites.values()].sort((a, b) => a.id.localeCompare(b.id)),
		judges: judges.sort(
			(a, b) => Number(b.default) - Number(a.default) || a.profile.id.localeCompare(b.profile.id)
		),
		issues: lib.issues,
		checks: listChecks()
	};
}

export async function statusPayload(
	engine: Engine,
	mode: 'live' | 'static'
): Promise<StatusPayload> {
	return {
		app: {
			name: 'benchy',
			version: VERSION,
			mode,
			...(mode === 'static' ? { exported_at: new Date().toISOString() } : {})
		},
		host: await hostInfo(engine.settings.host.name),
		engine: mode === 'live' ? engine.status() : null,
		settings:
			mode === 'live'
				? {
						judge: {
							model: engine.settings.judge.model,
							effort: engine.settings.judge.effort,
							default_profile: engine.settings.judge.default_profile
						},
						llama_port: engine.settings.llama.port
					}
				: null
	};
}

/**
 * Everything the attempt viewer needs. `fileUrl` maps a path relative to
 * data/runs to a URL (live server: /files/…, static export: files/…).
 */
export async function attemptDetail(
	engine: Engine,
	id: string,
	fileUrl: (rel: string) => string
): Promise<AttemptDetail | null> {
	const attempt = await readAttempt(engine.ws, id);
	if (!attempt) return null;
	const run = engine.index.runs.get(attempt.run_id) ?? (await readRun(engine.ws, attempt.run_id));
	if (!run) return null;
	const dir = dirOfAttempt(engine.ws, id);
	let llama: LlamaView | null = null;
	if (run.llama && run.llama.sections[attempt.blueprint_id]) {
		const p = run.llama.props[attempt.blueprint_id] as
			{ props?: unknown; model?: { status?: { args?: string[] } }; load_ms?: number } | undefined;
		llama = {
			mode: run.llama.mode,
			binary: run.llama.binary,
			build: run.llama.build,
			section: run.llama.sections[attempt.blueprint_id] ?? null,
			args: p?.model?.status?.args ?? null,
			props: p?.props ?? null,
			load_ms: p?.load_ms,
			gpu: run.llama.gpu
		};
	}
	const base = `${id}/`;
	return {
		attempt,
		row: toAttemptRow(attempt, run),
		run: {
			id: run.id,
			created_at: run.created_at,
			host: run.host,
			judge: run.judge,
			status: run.status,
			label: run.spec.label ?? null,
			legacy: !!run.legacy
		},
		blueprint: run.blueprints[attempt.blueprint_id] ?? null,
		test: run.tests[attempt.test_id] ?? null,
		llama,
		checks: await readChecks(engine.ws, id),
		judgements: await listJudgements(engine.ws, id),
		human: await readHuman(engine.ws, id),
		files: {
			base: fileUrl(base),
			response: fileUrl(`${base}response.md`),
			reasoning: (await exists(join(dir, 'reasoning.md'))) ? fileUrl(`${base}reasoning.md`) : null,
			raw: (await exists(join(dir, 'raw.json'))) ? fileUrl(`${base}raw.json`) : null
		}
	};
}
