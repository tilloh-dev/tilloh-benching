import type { HumanRating, ResolvedCriterion, Verdict } from './schema.ts';

/** Criterion scores are 0–10; a required criterion below this fails the gate. */
export const GATE_THRESHOLD = 5;

export type ScoreResult = {
	score: number;
	gate_failed: boolean;
	gates_failed: string[];
	missing_criteria: string[];
};

/**
 * Deterministic aggregation of per-criterion scores into 0–100. The judge only
 * scores criteria; weighting is BenchyOS's job so it stays reproducible.
 * Criteria the verdict omits count as 0 and are reported as missing.
 */
export function scoreCriteria(
	criteria: ResolvedCriterion[],
	scores: Record<string, number | undefined>
): ScoreResult {
	let weighted = 0;
	let total = 0;
	const gates: string[] = [];
	const missing: string[] = [];
	for (const c of criteria) {
		const raw = scores[c.id];
		if (raw === undefined || Number.isNaN(raw)) missing.push(c.id);
		const s = Math.max(0, Math.min(10, raw ?? 0));
		weighted += s * c.weight;
		total += c.weight;
		if (c.required && s < GATE_THRESHOLD) gates.push(c.id);
	}
	const score = total > 0 ? Math.round((weighted / total) * 100) / 10 : 0;
	return { score, gate_failed: gates.length > 0, gates_failed: gates, missing_criteria: missing };
}

export function scoreVerdict(criteria: ResolvedCriterion[], verdict: Verdict): ScoreResult {
	const scores: Record<string, number> = {};
	for (const c of verdict.criteria) scores[c.id] = c.score;
	return scoreCriteria(criteria, scores);
}

export function scoreHuman(criteria: ResolvedCriterion[], rating: HumanRating): number | null {
	if (rating.criteria && Object.keys(rating.criteria).length > 0) {
		return scoreCriteria(criteria, rating.criteria).score;
	}
	return typeof rating.score === 'number' ? rating.score : null;
}

export type Stats = {
	n: number;
	mean: number | null;
	stddev: number | null;
	min: number | null;
	max: number | null;
};

export function stats(values: number[]): Stats {
	const n = values.length;
	if (n === 0) return { n, mean: null, stddev: null, min: null, max: null };
	const mean = values.reduce((a, b) => a + b, 0) / n;
	const variance = n > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
	return {
		n,
		mean: Math.round(mean * 10) / 10,
		stddev: Math.round(Math.sqrt(variance) * 10) / 10,
		min: Math.min(...values),
		max: Math.max(...values)
	};
}
