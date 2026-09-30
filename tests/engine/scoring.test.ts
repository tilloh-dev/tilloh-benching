import { describe, expect, it } from 'vitest';
import { scoreCriteria, stats } from '../../src/engine/core/scoring.ts';
import {
	combinedScore,
	judgeScoresOf,
	leaderboard,
	type AttemptRow,
	type JudgeScore
} from '../../src/engine/core/rows.ts';

const criteria = [
	{ id: 'a', title: 'A', weight: 3, required: true },
	{ id: 'b', title: 'B', weight: 1, required: false }
];

describe('scoreCriteria', () => {
	it('weights criteria into 0–100', () => {
		// act
		const r = scoreCriteria(criteria, { a: 8, b: 4 });

		// assume
		expect(r.score).toBe(70);
		expect(r.gate_failed).toBe(false);
	});

	it('fails the gate for a required criterion below 5 and counts missing criteria as 0', () => {
		// act
		const r = scoreCriteria(criteria, { a: 4 });

		// assume
		expect(r.gate_failed).toBe(true);
		expect(r.gates_failed).toEqual(['a']);
		expect(r.missing_criteria).toEqual(['b']);
		expect(r.score).toBe(30);
	});

	it('clamps out-of-range scores', () => {
		// act
		const r = scoreCriteria(criteria, { a: 14, b: -3 });

		// assume
		expect(r.score).toBe(75);
	});
});

describe('stats', () => {
	it('computes mean and sample stddev', () => {
		// act
		const s = stats([60, 80]);

		// assume
		expect(s).toEqual({ n: 2, mean: 70, stddev: 14.1, min: 60, max: 80 });
	});
});

function row(p: Partial<AttemptRow>): AttemptRow {
	return {
		id: 'r/bp/t/1',
		run_id: 'r',
		blueprint_id: 'bp',
		blueprint_hash: 'h1',
		blueprint_label: 'BP',
		blueprint_kind: 'dry-run',
		test_id: 't',
		rep: 1,
		stage: 'judged',
		status: 'ok',
		score: null,
		judge_score: null,
		judge_scores: [],
		gate_failed: false,
		human_score: null,
		judge: 'dry-run',
		latency_ms: null,
		ttft_ms: null,
		gen_tps: null,
		tps_source: null,
		completion_tokens: null,
		cost_usd: null,
		thumbnail: null,
		error: null,
		created_at: '2026-09-29T10:00:00Z',
		...p
	};
}

describe('leaderboard', () => {
	it('averages per test first, then across tests, and ranks by overall mean', () => {
		// arrange
		const rows = [
			row({ id: '1', blueprint_id: 'x', blueprint_label: 'X', test_id: 't1', score: 90 }),
			row({ id: '2', blueprint_id: 'x', blueprint_label: 'X', test_id: 't1', score: 70 }),
			row({ id: '3', blueprint_id: 'x', blueprint_label: 'X', test_id: 't2', score: 50 }),
			row({ id: '4', blueprint_id: 'y', blueprint_label: 'Y', test_id: 't1', score: 95 })
		];

		// act
		const lb = leaderboard(rows);

		// assume
		expect(lb.tests).toEqual(['t1', 't2']);
		expect(lb.rows.map((r) => r.blueprint_id)).toEqual(['y', 'x']);
		expect(lb.rows[1].per_test.t1.mean).toBe(80);
		expect(lb.rows[1].overall.mean).toBe(65);
		expect(lb.rows[0].coverage).toBe(0.5);
	});

	it('splits blueprint versions on request', () => {
		// arrange
		const rows = [
			row({ id: '1', blueprint_hash: 'h1', score: 40 }),
			row({ id: '2', blueprint_hash: 'h2', score: 60 })
		];

		// act
		const split = leaderboard(rows, { splitVersions: true });

		// assume
		expect(split.rows).toHaveLength(2);
	});

	it('shows one subrow per judge profile and the human, and flags under-judged entries', () => {
		// arrange
		const j = (profile: string, score: number) => ({
			profile,
			label: profile,
			score,
			gate_failed: false
		});
		const x = judgedRow({ id: '1', blueprint_id: 'x' }, [j('opus', 80), j('haiku', 60)], 100);
		const y = judgedRow({ id: '2', blueprint_id: 'y' }, [j('opus', 90)], null);

		// act
		const lb = leaderboard([x, y]);

		// assume
		const rx = lb.rows.find((r) => r.blueprint_id === 'x')!;
		const ry = lb.rows.find((r) => r.blueprint_id === 'y')!;
		expect(rx.overall.mean).toBe(80);
		expect(rx.sources.map((s) => [s.id, s.overall.mean])).toEqual([
			['haiku', 60],
			['opus', 80],
			['human', 100]
		]);
		expect(rx.judge_count).toBe(2);
		expect(rx.missing_judges).toEqual([]);
		expect(ry.missing_judges).toEqual(['haiku']);
	});
});

function judgedRow(p: Partial<AttemptRow>, judges: JudgeScore[], human: number | null): AttemptRow {
	return row({
		...p,
		judge_scores: judges,
		human_score: human,
		judge_score: combinedScore(judges, null),
		score: combinedScore(judges, human)
	});
}

describe('combined score', () => {
	it('counts every judge profile and the human as one vote each', () => {
		// arrange
		const judges = judgeScoresOf({
			judgements: {
				opus: { fingerprint: 'a', score: 70, gate_failed: false, judged_at: '', judge: 'Opus' },
				haiku: { fingerprint: 'b', score: 50, gate_failed: true, judged_at: '', judge: 'Haiku' }
			}
		});

		// act
		const combined = combinedScore(judges, 90);

		// assume
		expect(judges.map((j) => j.profile)).toEqual(['haiku', 'opus']);
		expect(combined).toBe(70);
	});

	it('falls back to the single judgement of attempts judged before profiles existed', () => {
		// act
		const judges = judgeScoresOf({
			judgement: {
				fingerprint: 'a',
				score: 86.7,
				gate_failed: false,
				judged_at: '',
				judge: 'claude-opus-5-5@xhigh·static'
			}
		});

		// assume
		expect(judges).toEqual([
			{
				profile: 'claude-opus-5-5@xhigh',
				label: 'claude-opus-5-5@xhigh',
				score: 86.7,
				gate_failed: false
			}
		]);
	});
});
