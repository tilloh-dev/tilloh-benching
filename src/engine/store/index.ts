import { join } from 'node:path';
import type { Attempt, RunRecord } from '../core/schema.ts';
import { combinedScore, judgeScoresOf, type AttemptRow, type RunRow } from '../core/rows.ts';
import { runDir, type Workspace } from '../core/workspace.ts';
import { exists, listDirs, readJsonOr } from '../util/fs.ts';
import { listRunIds, readRun } from './runs.ts';

/**
 * In-memory index over data/runs. Files stay the source of truth; the index is
 * rebuilt by scanning and kept current by the orchestrator pushing updates.
 */
export class ResultIndex {
	readonly ws: Workspace;
	runs = new Map<string, RunRecord>();
	attempts = new Map<string, Attempt>();

	constructor(ws: Workspace) {
		this.ws = ws;
	}

	async scan(): Promise<void> {
		const runs = new Map<string, RunRecord>();
		const attempts = new Map<string, Attempt>();
		for (const id of await listRunIds(this.ws)) {
			const run = await readRun(this.ws, id);
			if (!run) continue;
			runs.set(id, run);
			for (const a of await scanRunAttempts(this.ws, id)) attempts.set(a.id, a);
		}
		this.runs = runs;
		this.attempts = attempts;
	}

	async refreshRun(id: string): Promise<void> {
		const run = await readRun(this.ws, id);
		for (const key of [...this.attempts.keys()])
			if (key.startsWith(`${id}/`)) this.attempts.delete(key);
		if (!run) {
			this.runs.delete(id);
			return;
		}
		this.runs.set(id, run);
		for (const a of await scanRunAttempts(this.ws, id)) this.attempts.set(a.id, a);
	}

	putRun(run: RunRecord): void {
		this.runs.set(run.id, run);
	}

	putAttempt(a: Attempt): void {
		this.attempts.set(a.id, a);
	}

	attemptsOfRun(runId: string): Attempt[] {
		return [...this.attempts.values()].filter((a) => a.run_id === runId);
	}

	attemptRows(filter?: (a: Attempt) => boolean): AttemptRow[] {
		const out: AttemptRow[] = [];
		for (const a of this.attempts.values()) {
			if (filter && !filter(a)) continue;
			out.push(toAttemptRow(a, this.runs.get(a.run_id)));
		}
		return out.sort((x, y) => (x.id < y.id ? -1 : 1));
	}

	runRows(): RunRow[] {
		return [...this.runs.values()]
			.map((r) => toRunRow(r, this.attemptsOfRun(r.id)))
			.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
	}
}

async function scanRunAttempts(ws: Workspace, runId: string): Promise<Attempt[]> {
	const out: Attempt[] = [];
	const base = runDir(ws, runId);
	for (const bp of await listDirs(base)) {
		for (const test of await listDirs(join(base, bp))) {
			for (const rep of await listDirs(join(base, bp, test))) {
				const path = join(base, bp, test, rep, 'attempt.json');
				if (!(await exists(path))) continue;
				const a = await readJsonOr<Attempt | null>(path, null);
				if (a) out.push(a);
			}
		}
	}
	return out;
}

export function toAttemptRow(a: Attempt, run?: RunRecord): AttemptRow {
	const bp = run?.blueprints[a.blueprint_id]?.blueprint;
	const thumb = a.evidence.find((e) => e.kind === 'image');
	const judges = judgeScoresOf(a);
	const human = a.human?.score ?? null;
	const judgeMean = combinedScore(judges, null);
	return {
		id: a.id,
		run_id: a.run_id,
		blueprint_id: a.blueprint_id,
		blueprint_hash: a.blueprint_hash,
		blueprint_label: bp?.label ?? a.blueprint_id,
		blueprint_kind: bp?.kind ?? 'dry-run',
		test_id: a.test_id,
		rep: a.rep,
		stage: a.stage,
		status: a.status,
		score: combinedScore(judges, human),
		judge_score: judgeMean,
		judge_scores: judges,
		gate_failed: judges.some((j) => j.gate_failed),
		human_score: human,
		judge: a.judgement?.judge ?? null,
		latency_ms: a.metrics.latency_ms ?? null,
		ttft_ms: a.metrics.ttft_ms ?? null,
		gen_tps: a.metrics.gen_tps ?? null,
		tps_source: a.metrics.gen_tps === undefined ? null : (a.metrics.tps_source ?? 'server'),
		completion_tokens: a.metrics.completion_tokens ?? null,
		cost_usd: a.metrics.cost_usd ?? null,
		thumbnail: thumb ? `${a.id}/${thumb.path}` : null,
		error: a.error?.message ?? null,
		created_at: a.created_at
	};
}

const GENERATED_STAGES = new Set(['generated', 'checking', 'checked', 'judging', 'judged']);

export function toRunRow(r: RunRecord, attempts: Attempt[]): RunRow {
	const scores = attempts
		.map((a) => combinedScore(judgeScoresOf(a), a.human?.score ?? null))
		.filter((s): s is number => typeof s === 'number');
	return {
		id: r.id,
		label: r.spec.label ?? null,
		status: r.status,
		created_at: r.created_at,
		finished_at: r.finished_at ?? null,
		host: r.host.name,
		blueprints: r.spec.blueprints,
		tests: r.spec.tests,
		repetitions: r.spec.repetitions,
		judge:
			r.judge.label ?? (r.judge.kind === 'claude' ? `claude:${r.judge.model ?? ''}` : r.judge.kind),
		legacy: !!r.legacy,
		counts: {
			total: attempts.length,
			generated: attempts.filter((a) => GENERATED_STAGES.has(a.stage) && !a.error).length,
			judged: attempts.filter((a) => a.judgement).length,
			failed: attempts.filter((a) => a.status === 'failed').length
		},
		mean_score: scores.length
			? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10
			: null
	};
}
