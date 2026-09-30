import { createServer, type Server } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/run/engine.ts';
import { loadLibrary } from '../../src/engine/core/library.ts';
import { leaderboard } from '../../src/engine/core/rows.ts';
import { parseJsonReply } from '../../src/engine/judge/openai.ts';
import { computeTps } from '../../src/engine/subjects/tps.ts';
import { deleteSecret, listSecrets, setSecret } from '../../src/engine/secrets.ts';
import { execCapture } from '../../src/engine/util/exec.ts';
import { dirOfAttempt } from '../../src/engine/store/attempts.ts';
import { tempWorkspace } from '../helpers.ts';

const PAGE_TEST = `id: page
title: Page
output:
  files:
    - path: index.html
checks:
  - html.parse
  - html.render:
      screenshots: [100]
judge:
  mode: interactive
  criteria:
    - { id: works, title: Works, weight: 2, required: true }
    - { id: looks, title: Looks good }
`;

type Seen = { auth: string; body: Record<string, unknown> };
let server: Server;
let base = '';
const seen: Seen[] = [];

/** A chat API that rejects json_schema, like some providers, and answers the json_object retry. */
beforeAll(async () => {
	server = createServer((req, res) => {
		let body = '';
		req.on('data', (d) => (body += d));
		req.on('end', () => {
			const parsed = JSON.parse(body) as Record<string, unknown>;
			seen.push({ auth: req.headers.authorization ?? '', body: parsed });
			const format = (parsed.response_format as { type: string }).type;
			if (format === 'json_schema') {
				res.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"no schema"}');
				return;
			}
			const verdict = {
				criteria: [
					{ id: 'works', score: 9, rationale: 'runs', evidence: ['index.html'] },
					{ id: 'looks', score: 5, rationale: 'plain', evidence: ['evidence'] }
				],
				summary: 'Works, looks plain.',
				strengths: ['works'],
				weaknesses: ['plain'],
				confidence: 0.8,
				flags: { prompt_injection_suspected: false, output_incomplete: false }
			};
			res.writeHead(200, { 'content-type': 'application/json' }).end(
				JSON.stringify({
					choices: [{ message: { content: '```json\n' + JSON.stringify(verdict) + '\n```' } }],
					usage: { prompt_tokens: 900, completion_tokens: 120, cost: 0.004 }
				})
			);
		});
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const addr = server.address();
	base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/v1`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('judge profiles', () => {
	it('loads profiles from library/judges, keeps the built-in default and reports invalid ones', async () => {
		// arrange
		const ws = await tempWorkspace({
			'library/judges/api.yaml':
				'id: api\nkind: openai-compatible\nmodel: m\nendpoint: { base_url: "http://x/v1" }\n',
			'library/judges/broken.yaml': 'id: broken\nkind: openai-compatible\nmodel: m\n'
		});

		// act
		const lib = await loadLibrary(ws);

		// assume
		expect([...lib.judges.keys()].sort()).toEqual(['api', 'dry-run', 'opus-xhigh']);
		expect(lib.judges.get('opus-xhigh')).toMatchObject({
			model: 'claude-opus-5-5',
			effort: 'xhigh'
		});
		expect(lib.issues.map((i) => i.file)).toContain('judges/broken.yaml');
	});

	it('judges through an OpenAI-compatible API and combines every profile into one score', async () => {
		// arrange
		process.env.BENCHY_TEST_JUDGE_KEY = 'sk-test';
		const ws = await tempWorkspace({
			'library/blueprints/good.yaml':
				'id: good\nkind: dry-run\ndry_run: { profile: good, delay_ms: 5 }\n',
			'library/tests/page/test.yaml': PAGE_TEST,
			'library/tests/page/prompt.md': 'Build a page.',
			'library/judges/api.yaml': `id: api\nlabel: API judge\nkind: openai-compatible\nmodel: judge-model\nendpoint: { base_url: "${base}", api_key_env: BENCHY_TEST_JUDGE_KEY }\nrequest: { temperature: 0 }\n`
		});
		const engine = await Engine.open(ws.root, { exclusive: true });

		try {
			// act
			const run = await engine.createRun({
				blueprints: ['good'],
				tests: ['page'],
				judge: { profile: 'api' }
			});
			await engine.runToCompletion(run.id);
			const id = engine.index.attemptsOfRun(run.id)[0].id;
			await engine.rejudge([id], { profile: 'dry-run' });
			const row = engine.index.attemptRows()[0];
			const lb = leaderboard(engine.index.attemptRows());
			const last = seen.at(-1)!;
			const content = (last.body.messages as { content: unknown }[])[1].content as {
				type: string;
			}[];

			// assume
			expect(seen.map((s) => (s.body.response_format as { type: string }).type)).toEqual([
				'json_schema',
				'json_object'
			]);
			expect(last.auth).toBe('Bearer sk-test');
			expect(last.body).toMatchObject({ model: 'judge-model', temperature: 0, stream: false });
			expect(content.some((p) => p.type === 'image_url')).toBe(true);
			expect(row.judge_scores.map((j) => j.profile)).toEqual(['api', 'dry-run']);
			// works 9 × 2 and looks 5 × 1 → 76.7 on 0–100
			expect(row.judge_scores[0]).toMatchObject({ label: 'API judge', score: 76.7 });
			expect(row.score).toBe(
				Math.round(((row.judge_scores[0].score + row.judge_scores[1].score) / 2) * 10) / 10
			);
			expect(lb.rows[0].sources.map((s) => s.id)).toEqual(['api', 'dry-run']);
			expect(lb.rows[0].judge_count).toBe(2);
		} finally {
			await engine.close();
			delete process.env.BENCHY_TEST_JUDGE_KEY;
		}
	}, 120_000);

	it('stops with a clear error when the API key is missing', async () => {
		// arrange
		const ws = await tempWorkspace({
			'library/blueprints/good.yaml':
				'id: good\nkind: dry-run\ndry_run: { profile: good, delay_ms: 5 }\n',
			'library/tests/essay/test.yaml': 'id: essay\ntitle: Essay\noutput:\n  mode: text\n',
			'library/tests/essay/prompt.md': 'Write.',
			'library/judges/api.yaml': `id: api\nkind: openai-compatible\nmodel: m\nendpoint: { base_url: "${base}", api_key_env: BENCHY_UNSET_KEY }\n`
		});
		const engine = await Engine.open(ws.root, { exclusive: true });

		try {
			// act
			const run = await engine.createRun({
				blueprints: ['good'],
				tests: ['essay'],
				judge: { profile: 'api' }
			});
			await engine.runToCompletion(run.id);
			const a = engine.index.attemptsOfRun(run.id)[0];

			// assume
			expect(a.stage).toBe('checked');
			expect(a.judge_error).toMatch(/BENCHY_UNSET_KEY is not set/);
		} finally {
			await engine.close();
		}
	}, 60_000);

	it('keeps the verdict of an attempt judged before profiles existed as one vote', async () => {
		// arrange
		const ws = await tempWorkspace({
			'library/blueprints/good.yaml':
				'id: good\nkind: dry-run\ndry_run: { profile: good, delay_ms: 5 }\n',
			'library/tests/essay/test.yaml': 'id: essay\ntitle: Essay\noutput:\n  mode: text\n',
			'library/tests/essay/prompt.md': 'Write.',
			'library/judges/second.yaml': 'id: second\nkind: dry-run\n'
		});
		const engine = await Engine.open(ws.root, { exclusive: true });
		try {
			const run = await engine.createRun({
				blueprints: ['good'],
				tests: ['essay'],
				judge: { kind: 'dry-run' }
			});
			await engine.runToCompletion(run.id);
			const id = engine.index.attemptsOfRun(run.id)[0].id;
			const path = join(dirOfAttempt(ws, id), 'attempt.json');
			const old = JSON.parse(await readFile(path, 'utf8'));
			delete old.judgements;
			delete old.judgement.profile_id;
			delete old.judgement.profile_label;
			old.judgement.judge = 'dry-run';
			await writeFile(path, JSON.stringify(old));
			await engine.index.scan();

			// act
			await engine.rejudge([id], { profile: 'second' });
			const row = engine.index.attemptRows()[0];

			// assume
			expect(row.judge_scores.map((j) => j.profile)).toEqual(['dry-run', 'second']);
		} finally {
			await engine.close();
		}
	}, 60_000);

	it('pulls the verdict out of fenced or chatty replies', () => {
		// act
		const fenced = parseJsonReply('Here:\n```json\n{"a":1}\n```');
		const chatty = parseJsonReply('Sure! {"a":2} Hope that helps.');

		// assume
		expect(fenced).toEqual({ a: 1 });
		expect(chatty).toEqual({ a: 2 });
	});
});

describe('tokens per second', () => {
	it('computes from usage, estimates from text and gives up without timing', () => {
		// act
		const computed = computeTps({ tokens: 500, genMs: 10_000 });
		const estimated = computeTps({ chars: 2000, genMs: 10_000 });
		const none = computeTps({ tokens: 500 });

		// assume
		expect(computed).toEqual({ gen_tps: 50, tps_source: 'computed' });
		expect(estimated).toEqual({ gen_tps: 50, tps_source: 'estimated' });
		expect(none).toEqual({});
	});
});

describe('API keys', () => {
	it('writes .env with mode 600, reports only names and removes keys again', async () => {
		// arrange
		const ws = await tempWorkspace({
			'library/judges/api.yaml':
				'id: api\nkind: openai-compatible\nmodel: m\nendpoint: { base_url: "http://x/v1", api_key_env: BENCHY_TEST_SECRET }\n'
		});

		// act
		await setSecret(ws, 'BENCHY_TEST_SECRET', 'sk-abc 123');
		const mode = (await stat(ws.envFile)).mode & 0o777;
		const text = await readFile(ws.envFile, 'utf8');
		const listed = await listSecrets(ws, await loadLibrary(ws));
		await deleteSecret(ws, 'BENCHY_TEST_SECRET');
		const after = await listSecrets(ws, await loadLibrary(ws));

		// assume
		expect(mode).toBe(0o600);
		expect(text).toBe("BENCHY_TEST_SECRET='sk-abc 123'\n");
		expect(listed).toEqual([
			{ name: 'BENCHY_TEST_SECRET', set: true, source: 'env-file', used_by: ['judge api'] }
		]);
		expect(JSON.stringify(listed)).not.toContain('sk-abc');
		expect(after[0]).toMatchObject({ set: false, source: null });
		expect(process.env.BENCHY_TEST_SECRET).toBeUndefined();
	});

	it('refuses to write keys when git does not ignore .env', async () => {
		// arrange
		const ws = await tempWorkspace();
		await execCapture('git', ['init', '-q'], { cwd: ws.root });

		// act
		const attempt = setSecret(ws, 'BENCHY_TEST_SECRET', 'value');

		// assume
		await expect(attempt).rejects.toThrow(/not ignored by git/);
	});
});
