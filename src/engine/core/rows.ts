/**
 * Compact projections served to the UI and embedded in static exports, plus the
 * leaderboard aggregation. Isomorphic, so the static viewer can re-aggregate
 * client-side when filters change.
 */
import type { Attempt, AttemptStage, BlueprintKind, CheckStatus, RunStatus } from './schema.ts';
import { stats, type Stats } from './scoring.ts';

/** The latest score one judge profile gave an attempt. */
export type JudgeScore = { profile: string; label: string; score: number; gate_failed: boolean };

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
	/** Combined value: mean of every judge profile's latest score and the human score. */
	score: number | null;
	/** Mean of the judge profiles only. */
	judge_score: number | null;
	judge_scores: JudgeScore[];
	gate_failed: boolean;
	human_score: number | null;
	judge: string | null;
	latency_ms: number | null;
	ttft_ms: number | null;
	gen_tps: number | null;
	tps_source: 'server' | 'computed' | 'estimated' | null;
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

export type LeaderboardOptions = {
	tests?: string[];
	runs?: string[];
	splitVersions?: boolean;
};

/** Id of the human rating among the leaderboard sources. */
export const HUMAN_SOURCE = 'human';

/** One judge profile's (or the human's) view of a leaderboard entry. */
export type LeaderSource = {
	id: string;
	label: string;
	human: boolean;
	overall: Stats;
	per_test: Record<string, Stats>;
	attempts: number;
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
	/** Some speeds were computed or estimated rather than reported by the server. */
	tps_approx: boolean;
	mean_latency_ms: number | null;
	total_cost_usd: number | null;
	last_run: string;
	/** Per-profile and human scores, for the expandable subrows. */
	sources: LeaderSource[];
	/** Distinct judge profiles that scored this entry. */
	judge_count: number;
	/** Profiles the best-covered entry has and this one lacks; non-empty means "under-judged". */
	missing_judges: string[];
};

function mean(values: number[]): number | null {
	return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Latest successful score per judge profile; attempts from before profiles fall back to their one judgement. */
export function judgeScoresOf(a: Pick<Attempt, 'judgement' | 'judgements'>): JudgeScore[] {
	const all = a.judgements ?? {};
	const list = Object.entries(all).map(([profile, j]) => ({
		profile,
		label: j.profile_label ?? profile,
		score: j.score,
		gate_failed: j.gate_failed
	}));
	if (!list.length && a.judgement) {
		const j = a.judgement;
		const profile = j.profile_id ?? j.judge.split('·')[0];
		list.push({
			profile,
			label: j.profile_label ?? profile,
			score: j.score,
			gate_failed: j.gate_failed
		});
	}
	return list.sort((x, y) => x.profile.localeCompare(y.profile));
}

/** The combined value: every judge profile and the human count as one vote each. */
export function combinedScore(judges: JudgeScore[], human: number | null): number | null {
	const votes = judges.map((j) => j.score);
	if (human !== null) votes.push(human);
	const m = mean(votes);
	return m === null ? null : round1(m);
}

function sourceStats(
	list: AttemptRow[],
	tests: string[],
	scoreOf: (r: AttemptRow) => number | null
): { overall: Stats; per_test: Record<string, Stats>; attempts: number } {
	const per_test: Record<string, Stats> = {};
	const means: number[] = [];
	let attempts = 0;
	for (const t of tests) {
		const scores = list
			.filter((r) => r.test_id === t)
			.map(scoreOf)
			.filter((s): s is number => s !== null);
		if (!scores.length) continue;
		attempts += scores.length;
		const st = stats(scores);
		per_test[t] = st;
		if (st.mean !== null) means.push(st.mean);
	}
	return { overall: stats(means), per_test, attempts };
}

export function leaderboard(
	rows: AttemptRow[],
	opts: LeaderboardOptions = {}
): {
	tests: string[];
	rows: LeaderRow[];
} {
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
			const scores = cellRows.map((r) => r.score).filter((s): s is number => s !== null);
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
		const profiles = new Map<string, string>();
		for (const r of list) for (const j of r.judge_scores) profiles.set(j.profile, j.label);
		const sources: LeaderSource[] = [...profiles]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([id, label]) => ({
				id,
				label,
				human: false,
				...sourceStats(
					list,
					tests,
					(r) => r.judge_scores.find((j) => j.profile === id)?.score ?? null
				)
			}));
		const human = sourceStats(list, tests, (r) => r.human_score);
		if (human.attempts) sources.push({ id: HUMAN_SOURCE, label: 'you', human: true, ...human });
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
			tps_approx: list.some((r) => r.gen_tps !== null && r.tps_source !== 'server'),
			mean_latency_ms: mean(lat),
			total_cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
			last_run: latest.run_id,
			sources,
			judge_count: profiles.size,
			missing_judges: []
		});
	}
	// The best-covered entry sets the baseline; everyone with fewer judge profiles gets flagged.
	const baseline = out.reduce<LeaderRow | null>(
		(best, r) => (!best || r.judge_count > best.judge_count ? r : best),
		null
	);
	if (baseline) {
		const want = baseline.sources.filter((s) => !s.human).map((s) => s.id);
		for (const r of out) {
			if (r.judge_count >= baseline.judge_count) continue;
			const have = new Set(r.sources.map((s) => s.id));
			r.missing_judges = want.filter((id) => !have.has(id));
		}
	}
	out.sort((a, b) => {
		const am = a.overall.mean ?? -1;
		const bm = b.overall.mean ?? -1;
		if (bm !== am) return bm - am;
		return a.label.localeCompare(b.label);
	});
	return { tests, rows: out };
}
