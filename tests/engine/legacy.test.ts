import { describe, expect, it } from 'vitest';
import { legacyChecks, legacyDate } from '../../src/engine/legacy/llm-check.ts';
import { sanitizeId } from '../../src/engine/legacy/preset-import.ts';

describe('llm-check import', () => {
	it('parses llm-check timestamps', () => {
		// act / assume
		expect(legacyDate('2026-08-21T16-02-45Z').toISOString()).toBe('2026-08-21T16:02:45.000Z');
	});

	it('maps parse issues to warnings and runtime issues to a failed render', () => {
		// act
		const checks = legacyChecks({
			prompt_id: 'p',
			model_id: 'm',
			status: 'broken',
			html_file: 'x',
			raw_file: null,
			thumbnail: null,
			latency_ms: 1,
			prompt_tokens: 1,
			completion_tokens: 1,
			total_tokens: 2,
			cost_usd: null,
			error: null,
			validation: {
				parse_issues: [{ kind: 'parse_error', message: 'unexpected-end-tag', line: 5, col: 9 }],
				runtime_issues: [{ kind: 'page_error', message: 'x is undefined' }]
			}
		});

		// assume
		expect(checks.status).toBe('broken');
		expect(checks.results.map((r) => [r.id, r.status])).toEqual([
			['html.parse', 'warn'],
			['html.render', 'fail']
		]);
		expect(checks.results[0].issues[0]).toMatchObject({ severity: 'warning', line: 5, col: 9 });
	});

	it('turns arbitrary names into valid ids', () => {
		// act / assume
		expect(sanitizeId('Qwen3.8-27B-UD-Q4_K_M-150ctx-q8_0')).toBe(
			'Qwen3.8-27B-UD-Q4_K_M-150ctx-q8_0'
		);
		expect(sanitizeId('my model (v2)')).toBe('my-model-v2-');
		expect(sanitizeId('--x')).toBe('x');
	});
});
