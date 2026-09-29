import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
	Attempt,
	ArtifactRef,
	BenchTest,
	Blueprint,
	CheckIssue,
	ChecksFile,
	RunRecord
} from '../core/schema.ts';
import { Blueprint as BlueprintSchema } from '../core/schema.ts';
import { blueprintHash, normalizeTest, testHashes, type Library } from '../core/library.ts';
import { attemptDir, attemptId, runDir, type Workspace } from '../core/workspace.ts';
import { sha256 } from '../core/hash.ts';
import { extractArtifacts } from '../artifacts/extract.ts';
import { parseIni } from '../llama/preset.ts';
import { writeAttempt, writeChecks } from '../store/attempts.ts';
import { writeRun } from '../store/runs.ts';
import { ensureDir, exists, listDirs, readJson, writeFileAtomic } from '../util/fs.ts';
import { nowIso } from '../util/time.ts';
import { sanitizeId, sectionToServer } from './preset-import.ts';

/** The system prompt llm-check sent with every request (src/llm_check/providers.py). */
export const LEGACY_SYSTEM_PROMPT =
	'You are an expert front-end engineer. Respond with exactly ONE self-contained HTML5 document. ' +
	'Do NOT wrap it in markdown code fences. Do NOT include any commentary, preamble, or trailing text. ' +
	'The response must start with <!DOCTYPE html> and end with </html>.';

type LegacyIssue = { kind: string; message: string; line?: number | null; col?: number | null };
type LegacyCell = {
	prompt_id: string;
	model_id: string;
	status: 'ok' | 'warnings' | 'broken' | 'failed';
	html_file: string | null;
	raw_file: string | null;
	thumbnail: string | null;
	latency_ms: number | null;
	prompt_tokens: number | null;
	completion_tokens: number | null;
	total_tokens: number | null;
	cost_usd: number | null;
	validation: { parse_issues: LegacyIssue[]; runtime_issues: LegacyIssue[] } | null;
	error: string | null;
};
type LegacyResults = {
	timestamp: string;
	defaults: { temperature?: number; max_tokens?: number; timeout_s?: number };
	prompts: { id: string; body: string }[];
	models: {
		id: string;
		label: string;
		provider: string;
		kind?: string;
		api_base?: string;
		model_name?: string;
	}[];
	cells: LegacyCell[];
};

/** "2026-08-21T16-02-45Z" → Date */
export function legacyDate(ts: string): Date {
	const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/.exec(ts);
	return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : new Date(ts);
}

function compact(d: Date): string {
	const iso = d.toISOString();
	return `${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;
}

export function legacyChecks(cell: LegacyCell): ChecksFile {
	const parse: CheckIssue[] = (cell.validation?.parse_issues ?? []).map((i) => ({
		check: 'html.parse',
		severity: 'warning',
		kind: i.kind,
		message: i.message,
		file: 'index.html',
		line: i.line ?? undefined,
		col: i.col ?? undefined
	}));
	const runtime: CheckIssue[] = (cell.validation?.runtime_issues ?? []).map((i) => ({
		check: 'html.render',
		severity: 'error',
		kind: i.kind,
		message: i.message
	}));
	return {
		status: cell.status,
		checks_hash: 'llm-check',
		finished_at: nowIso(),
		results: [
			{
				id: 'html.parse',
				status: parse.length ? 'warn' : 'pass',
				duration_ms: 0,
				issues: parse,
				evidence: []
			},
			{
				id: 'html.render',
				status: runtime.length ? 'fail' : 'pass',
				duration_ms: 0,
				issues: runtime,
				evidence: []
			}
		]
	};
}

export type LegacyImportResult = { runs: string[]; attempts: string[]; skipped: string[] };

export async function importLegacyRuns(
	ws: Workspace,
	lib: Library,
	sourceDir: string,
	o: { presetIni?: string; home?: string; recheck: boolean; overwrite?: boolean }
): Promise<LegacyImportResult> {
	const preset = o.presetIni ? parseIni(o.presetIni) : {};
	const out: LegacyImportResult = { runs: [], attempts: [], skipped: [] };
	for (const name of await listDirs(sourceDir)) {
		const resultsPath = join(sourceDir, name, 'results.json');
		if (!(await exists(resultsPath))) continue;
		const res = await readJson<LegacyResults>(resultsPath);
		if (res.models.length !== 1) continue;
		const model = res.models[0];
		const when = legacyDate(res.timestamp);
		const bpId = sanitizeId(model.id);
		const runId =
			`${compact(when)}-${sanitizeId(model.kind ?? 'legacy').toLowerCase()}-${bpId}`.slice(0, 96);
		if (!o.overwrite && (await exists(join(runDir(ws, runId), 'run.json')))) {
			out.skipped.push(runId);
			continue;
		}
		const section = preset[model.id] ?? (model.model_name ? preset[model.model_name] : undefined);
		const server = section
			? sectionToServer(section, o.home)
			: { model: model.model_name ?? model.id };
		const bp: Blueprint = BlueprintSchema.parse({
			id: bpId,
			label: model.label,
			kind: 'llama-cpp',
			tags: ['local', 'llama.cpp', 'legacy'],
			server,
			request: {
				...(res.defaults.temperature !== undefined
					? { temperature: res.defaults.temperature }
					: {}),
				...(res.defaults.max_tokens !== undefined ? { max_tokens: res.defaults.max_tokens } : {})
			},
			timeout_s: res.defaults.timeout_s,
			origin: {
				source: `llm-check ${name}/results.json`,
				reconstructed: true,
				note: section
					? 'server settings reconstructed from the router preset at import time; they may differ from what ran back then'
					: 'server settings unknown (no matching preset section)'
			}
		});
		const tests: RunRecord['tests'] = {};
		for (const p of res.prompts) {
			const current = lib.tests.get(p.id);
			const t: BenchTest = current
				? { ...current, prompt: p.body.trim(), system: LEGACY_SYSTEM_PROMPT }
				: normalizeTest(
						{
							id: sanitizeId(p.id),
							title: p.id,
							output: { files: [{ path: 'index.html' }] },
							system: LEGACY_SYSTEM_PROMPT
						},
						p.body.trim()
					);
			tests[p.id] = { ...testHashes(t), test: t };
		}
		const port = Number(/:(\d+)/.exec(model.api_base?.replace(/^https?:\/\//, '') ?? '')?.[1] ?? 0);
		const run: RunRecord = {
			id: runId,
			created_at: when.toISOString(),
			started_at: when.toISOString(),
			finished_at: when.toISOString(),
			status: 'done',
			spec: {
				label: `llm-check · ${model.label}`,
				note: `Imported from llm-check (${name}). Generated with the legacy system prompt; judge them with benchy judge.`,
				blueprints: [bpId],
				tests: res.prompts.map((p) => p.id),
				repetitions: 1,
				judge: { kind: 'none' }
			},
			host: {
				name: model.kind ?? 'unknown',
				platform: 'unknown',
				release: '',
				arch: '',
				node: '',
				cpu: 'unknown',
				cpus: 0,
				mem_gb: 0,
				wsl: false,
				gpus: []
			},
			judge: { kind: 'none' },
			blueprints: { [bpId]: { hash: blueprintHash(bp), blueprint: bp } },
			tests,
			llama: section
				? {
						// 172.x api_base = the WSL → Windows-host gateway (tilloh-backup/llama.cpp/README.md).
						mode: /\/\/172\./.test(model.api_base ?? '') ? 'wsl-exe' : 'linux',
						binary: 'unknown (llm-check import)',
						port,
						connect_url: model.api_base ?? '',
						preset_file: '',
						sections: { [bpId]: section },
						props: { [bpId]: { props: null, model: null, note: 'reconstructed' } }
					}
				: undefined,
			legacy: { source: `llm-check:${name}`, imported_at: nowIso() },
			counts: {
				total: res.cells.length,
				done: res.cells.filter((c) => c.status !== 'failed').length,
				failed: res.cells.filter((c) => c.status === 'failed').length
			}
		};
		await writeRun(ws, run);
		out.runs.push(runId);

		for (const cell of res.cells) {
			const id = attemptId(runId, bpId, cell.prompt_id, 1);
			const dir = attemptDir(ws, runId, bpId, cell.prompt_id, 1);
			await ensureDir(dir);
			const test = tests[cell.prompt_id]?.test;
			const attempt: Attempt = {
				id,
				run_id: runId,
				blueprint_id: bpId,
				blueprint_hash: run.blueprints[bpId].hash,
				test_id: cell.prompt_id,
				task_hash: tests[cell.prompt_id]?.task_hash ?? '',
				rep: 1,
				stage: 'generated',
				status: null,
				created_at: when.toISOString(),
				started_at: when.toISOString(),
				generated_at: when.toISOString(),
				metrics: {
					latency_ms: cell.latency_ms ?? undefined,
					prompt_tokens: cell.prompt_tokens ?? undefined,
					completion_tokens: cell.completion_tokens ?? undefined,
					total_tokens: cell.total_tokens ?? undefined,
					cost_usd: cell.cost_usd ?? undefined
				},
				artifacts: [],
				evidence: []
			};
			if (cell.status === 'failed' || !cell.html_file || !test) {
				attempt.error = {
					stage: 'generating',
					message: cell.error ?? 'generation failed in llm-check'
				};
				attempt.status = 'failed';
				await writeAttempt(ws, attempt);
				out.attempts.push(id);
				continue;
			}
			const html = await readFile(join(sourceDir, name, cell.html_file), 'utf8');
			const raw = cell.raw_file
				? await readFile(join(sourceDir, name, cell.raw_file), 'utf8').catch(() => null)
				: null;
			const response = raw ?? html;
			await writeFileAtomic(join(dir, 'response.md'), response);
			// The raw response is re-extracted with BenchyOS's extractor, which recovers
			// documents llm-check missed (commentary around a fenced block, etc.).
			let artifactText = html;
			const notes = ['imported from llm-check'];
			if (raw) {
				const ex = extractArtifacts(test, raw);
				const hit = ex.files.find((f) => f.path === 'index.html');
				if (hit) artifactText = hit.content;
				notes.push(...ex.notes, `re-extracted from raw response (${ex.method})`);
			}
			await writeFileAtomic(join(dir, 'artifacts', 'index.html'), artifactText);
			const art: ArtifactRef = {
				path: 'artifacts/index.html',
				kind: 'html',
				bytes: Buffer.byteLength(artifactText),
				sha256: sha256(artifactText).slice(0, 16),
				declared: true,
				source: 'legacy'
			};
			attempt.artifacts = [art];
			attempt.extraction = { method: raw ? 'legacy-reextract' : 'legacy', notes };
			if (!o.recheck) {
				const checks = legacyChecks(cell);
				await writeChecks(ws, id, checks);
				attempt.status = checks.status;
				attempt.stage = 'checked';
				attempt.checks = {
					status: checks.status,
					failed: checks.results.filter((r) => r.status === 'fail').map((r) => r.id),
					warned: checks.results.filter((r) => r.status === 'warn').map((r) => r.id)
				};
				if (cell.thumbnail && (await exists(join(sourceDir, name, cell.thumbnail)))) {
					await ensureDir(join(dir, 'evidence'));
					await copyFile(
						join(sourceDir, name, cell.thumbnail),
						join(dir, 'evidence', 'legacy-thumbnail.png')
					);
					attempt.evidence = [
						{
							path: 'evidence/legacy-thumbnail.png',
							kind: 'image',
							label: 'llm-check thumbnail',
							check: 'html.render'
						}
					];
				}
			}
			await writeAttempt(ws, attempt);
			out.attempts.push(id);
		}
	}
	return out;
}
