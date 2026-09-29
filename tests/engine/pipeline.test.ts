import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/run/engine.ts';
import { leaderboard } from '../../src/engine/core/rows.ts';
import { tempWorkspace } from '../helpers.ts';

const HTML_TEST = `id: page
title: Page
output:
  files:
    - path: index.html
checks:
  - html.parse
  - html.render:
      screenshots: [100]
judge:
  criteria:
    - { id: works, title: Works, weight: 2, required: true }
    - { id: looks, title: Looks good }
`;

const TEXT_TEST = `id: essay
title: Essay
output:
  mode: text
`;

describe('dry-run pipeline', () => {
	it('generates, extracts, checks and judges every attempt and stores it as files', async () => {
		// arrange
		const ws = await tempWorkspace({
			'library/blueprints/good.yaml':
				'id: good\nkind: dry-run\ndry_run: { profile: good, delay_ms: 5 }\n',
			'library/blueprints/bad.yaml': 'id: bad\nextends: good\ndry_run: { profile: broken }\n',
			'library/tests/page/test.yaml': HTML_TEST,
			'library/tests/page/prompt.md': 'Build a page.',
			'library/tests/essay/test.yaml': TEXT_TEST,
			'library/tests/essay/prompt.md': 'Write.',
			'benchy.config.yaml': 'concurrency: { checks: 2 }\n'
		});
		const engine = await Engine.open(ws.root, { exclusive: true });

		try {
			// act
			const run = await engine.createRun({
				blueprints: ['good', 'bad'],
				tests: ['page', 'essay'],
				repetitions: 2,
				judge: { kind: 'dry-run' }
			});
			const final = await engine.runToCompletion(run.id);
			const rows = engine.index.attemptRows((a) => a.run_id === run.id);
			const good = rows.find((r) => r.blueprint_id === 'good' && r.test_id === 'page')!;
			const bad = rows.find((r) => r.blueprint_id === 'bad' && r.test_id === 'page')!;
			// The essay output is identical for both profiles, so only the page test separates them.
			const lb = leaderboard(rows, { tests: ['page'] });
			const dir = join(ws.runs, run.id, 'good', 'page', '1');
			const html = await readFile(join(dir, 'artifacts', 'index.html'), 'utf8');
			const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8'));

			// assume
			expect(final?.status).toBe('done');
			expect(rows).toHaveLength(8);
			expect(rows.every((r) => r.stage === 'judged')).toBe(true);
			expect(good.status).toBe('ok');
			expect(['broken', 'warnings']).toContain(bad.status);
			expect(good.score!).toBeGreaterThan(bad.score!);
			expect(good.thumbnail).toMatch(/evidence\/html-render-0\.png$/);
			expect(html).toMatch(/^<!DOCTYPE html>/);
			expect(checks.results.map((r: { id: string }) => r.id)).toEqual([
				'output.files',
				'html.parse',
				'html.render'
			]);
			expect(lb.rows[0].blueprint_id).toBe('good');
		} finally {
			await engine.close();
		}
	}, 120_000);

	it('refuses a second engine on the same workspace and resumes interrupted runs', async () => {
		// arrange
		const ws = await tempWorkspace({
			'library/blueprints/good.yaml':
				'id: good\nkind: dry-run\ndry_run: { profile: good, delay_ms: 5 }\n',
			'library/tests/essay/test.yaml': TEXT_TEST,
			'library/tests/essay/prompt.md': 'Write.'
		});
		const first = await Engine.open(ws.root, { exclusive: true });
		const run = await first.createRun({
			blueprints: ['good'],
			tests: ['essay'],
			judge: { kind: 'none' }
		});

		// act
		const second = Engine.open(ws.root, { exclusive: true });
		await expect(second).rejects.toThrow(/another Benchy engine/);
		await first.close();
		const third = await Engine.open(ws.root, { exclusive: true });
		const final = await third.runToCompletion(run.id);
		const rows = third.index.attemptRows();
		await third.close();

		// assume
		expect(final?.status).toBe('done');
		expect(rows[0].stage).toBe('checked');
		expect(rows[0].status).toBe('ok');
	}, 60_000);
});
