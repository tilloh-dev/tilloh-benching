/**
 * Compact projections served to the UI and embedded in static exports, plus the
 * leaderboard aggregation. Isomorphic, so the static viewer can re-aggregate
 * client-side when filters change.
 */
import type { AttemptStage, BlueprintKind, CheckStatus, RunStatus } from './schema.ts';
import { stats, type Stats } from './scoring.ts';

export type AttemptRow = {
	id: string;
	run_id: string;
	blueprint_id: string;
	blueprint_hash: string;
	blueprint_label: string;
	blueprint_kind: BlueprintKind;
	test_id: string;
	rep: number;
	stage: AttemptStage;
	status: CheckStatus | null;
	score: number | null;
	gate_failed: boolean;
	human_score: number | null;
	judge: string | null;
	latency_ms: number | null;
	ttft_ms: number | null;
	gen_tps: number | null;
	completion_tokens: number | null;
	cost_usd: number | null;
	thumbnail: string | null;
	error: string | null;
	created_at: string;
};

export type RunRow = {
	id: string;
	label: string | null;
	status: RunStatus;
	created_at: string;
	finished_at: string | null;
	host: string;
	blueprints: string[];
	tests: string[];
	repetitions: number;
	judge: string;
	legacy: boolean;
	counts: { total: number; generated: number; judged: number; failed: number };
	mean_score: number | null;
};

export type ScoreSource = 'judge' | 'human' | 'blend';

export type LeaderboardOptions = {
	tests?: string[];
	runs?: string[];
	splitVersions?: boolean;
	source?: ScoreSource;
};

export type LeaderCell = Stats & {
	statuses: Partial<Record<CheckStatus, number>>;
	gates_failed: number;
};

export type LeaderRow = {
	key: string;
	blueprint_id: string;
	blueprint_hash: string | null;
	label: string;
	kind: BlueprintKind;
	overall: Stats;
	coverage: number;
	per_test: Record<string, LeaderCell>;
	attempts: number;
	gates_failed: number;
	mean_gen_tps: number | null;
	mean_latency_ms: number | null;
	total_cost_usd: number | null;
	last_run: string;
};

function pick(row: AttemptRow, source: ScoreSource): number | null {
	if (source === 'judge') return row.score;
	if (source === 'human') return row.human_score;
	return row.human_score ?? row.score;
}

function mean(values: number[]): number | null {
	return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function leaderboard(
	rows: AttemptRow[],
	opts: LeaderboardOptions = {}
): {
	tests: string[];
	rows: LeaderRow[];
} {
	const source = opts.source ?? 'judge';
	const testFilter = opts.tests ? new Set(opts.tests) : null;
	const runFilter = opts.runs ? new Set(opts.runs) : null;
	const filtered = rows.filter(
		(r) => (!testFilter || testFilter.has(r.test_id)) && (!runFilter || runFilter.has(r.run_id))
	);
	const tests = [...new Set(filtered.map((r) => r.test_id))].sort();
	const groups = new Map<string, AttemptRow[]>();
	for (const r of filtered) {
		const key = opts.splitVersions ? `${r.blueprint_id}@${r.blueprint_hash}` : r.blueprint_id;
		const list = groups.get(key);
		if (list) list.push(r);
		else groups.set(key, [r]);
	}
	const out: LeaderRow[] = [];
	for (const [key, list] of groups) {
		const latest = list.reduce((a, b) => (a.created_at > b.created_at ? a : b));
		const perTest: Record<string, LeaderCell> = {};
		const testMeans: number[] = [];
		for (const t of tests) {
			const cellRows = list.filter((r) => r.test_id === t);
			if (!cellRows.length) continue;
			const scores = cellRows.map((r) => pick(r, source)).filter((s): s is number => s !== null);
			const statuses: Partial<Record<CheckStatus, number>> = {};
			for (const r of cellRows) if (r.status) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
			const cell: LeaderCell = {
				...stats(scores),
				statuses,
				gates_failed: cellRows.filter((r) => r.gate_failed).length
			};
			perTest[t] = cell;
			if (cell.mean !== null) testMeans.push(cell.mean);
		}
		const tps = list.map((r) => r.gen_tps).filter((v): v is number => v !== null);
		const lat = list.map((r) => r.latency_ms).filter((v): v is number => v !== null);
		const costs = list.map((r) => r.cost_usd).filter((v): v is number => v !== null);
		out.push({
			key,
			blueprint_id: latest.blueprint_id,
			blueprint_hash: opts.splitVersions ? latest.blueprint_hash : null,
			label: latest.blueprint_label,
			kind: latest.blueprint_kind,
			overall: stats(testMeans),
			coverage: tests.length ? testMeans.length / tests.length : 0,
			per_test: perTest,
			attempts: list.length,
			gates_failed: list.filter((r) => r.gate_failed).length,
			mean_gen_tps: mean(tps),
			mean_latency_ms: mean(lat),
			total_cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
			last_run: latest.run_id
		});
	}
	out.sort((a, b) => {
		const am = a.overall.mean ?? -1;
		const bm = b.overall.mean ?? -1;
		if (bm !== am) return bm - am;
		return a.label.localeCompare(b.label);
	});
	return { tests, rows: out };
}
