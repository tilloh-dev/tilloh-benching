import { readFile, stat } from 'node:fs/promises';
import { join, normalize, resolve } from 'node:path';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Engine } from '../engine/run/engine.ts';
import type { EngineEvent } from '../engine/run/events.ts';
import {
	BUILTIN_JUDGES,
	deleteBlueprint,
	deleteJudgeProfile,
	deleteSuite,
	deleteTest,
	saveBlueprint,
	saveJudgeProfile,
	saveSuite,
	saveTest
} from '../engine/core/library.ts';
import { deleteSecret, listSecrets, setSecret } from '../engine/secrets.ts';
import { leaderboard } from '../engine/core/rows.ts';
import { attemptDetail, libraryPayload, statusPayload } from '../engine/views.ts';
import { importPreset } from '../engine/legacy/preset-import.ts';
import { suggestCriteria } from '../engine/judge/criteria.ts';
import { taskMarkdown } from '../engine/judge/workspace.ts';
import { normalizeTest } from '../engine/core/library.ts';
import { TestFile } from '../engine/core/schema.ts';
import { mimeFor } from '../engine/checks/browser.ts';
import { runDir } from '../engine/core/workspace.ts';
import { homedir } from 'node:os';

/** Files that could execute when opened directly are served inside a CSP sandbox (opaque origin). */
const SANDBOXED = /\.(html?|svg|xhtml|xml)$/i;

export function createApp(engine: Engine, opts: { uiDir: string | null }) {
	const app = new Hono();

	app.onError((err, c) => {
		const status = (err as { status?: number }).status ?? (err.name === 'ZodError' ? 400 : 500);
		return c.json({ error: err.message }, status as 400);
	});

	// Only same-origin browser requests may change state (blocks drive-by POSTs from other sites).
	app.use('/api/*', async (c, next) => {
		if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
			const origin = c.req.header('origin');
			const host = c.req.header('host');
			if (origin && host && new URL(origin).host !== host)
				return c.json({ error: 'cross-origin request refused' }, 403);
		}
		await next();
	});

	const guardWritable = () => {
		if (!engine.exclusive) throw Object.assign(new Error('read-only engine'), { status: 409 });
	};

	// ---------------------------------------------------------- status

	app.get('/api/health', (c) =>
		c.json({ ok: true, root: engine.ws.root, host: engine.settings.host.name })
	);
	app.get('/api/status', async (c) => c.json(await statusPayload(engine, 'live')));
	app.get('/api/index', async (c) =>
		c.json({
			status: await statusPayload(engine, 'live'),
			runs: engine.index.runRows(),
			attempts: engine.index.attemptRows()
		})
	);
	app.post('/api/rescan', async (c) => {
		await engine.index.scan();
		engine.emitEvent({ type: 'index' });
		return c.json({ ok: true });
	});
	app.get('/api/logs', (c) => c.json(engine.recentLogs(c.req.query('run') ?? null)));
	app.get('/api/host/conflicts', async (c) =>
		c.json({ conflicts: await engine.llama.conflicts() })
	);

	// ---------------------------------------------------------- library

	app.get('/api/library', async (c) => c.json(await libraryPayload(engine)));

	const libChanged = async (c: Context) => {
		engine.emitEvent({ type: 'library' });
		return c.json(await libraryPayload(engine));
	};

	app.put('/api/blueprints/:id', async (c) => {
		const body = await c.req.json();
		if (body.id !== c.req.param('id')) {
			await deleteBlueprint(engine.ws, c.req.param('id'));
		}
		await saveBlueprint(engine.ws, body);
		return libChanged(c);
	});
	app.delete('/api/blueprints/:id', async (c) => {
		await deleteBlueprint(engine.ws, c.req.param('id'));
		return libChanged(c);
	});
	app.post('/api/blueprints/import-preset', async (c) => {
		const body = (await c.req.json()) as {
			ini?: string;
			path?: string;
			sections?: string[];
			prefix?: string;
			overwrite?: boolean;
		};
		const ini =
			body.ini ??
			(body.path ? await readFile(body.path.replace(/^~\//, homedir() + '/'), 'utf8') : null);
		if (!ini) throw Object.assign(new Error('pass ini text or a path'), { status: 400 });
		const result = await importPreset(engine.ws, ini, {
			sections: body.sections,
			prefix: body.prefix,
			overwrite: body.overwrite,
			home: homedir(),
			source: body.path ?? 'upload'
		});
		engine.emitEvent({ type: 'library' });
		return c.json({ ...result, library: await libraryPayload(engine) });
	});

	app.put('/api/judges/:id', async (c) => {
		const body = (await c.req.json()) as { id?: string };
		const old = c.req.param('id');
		if (body.id !== old && !BUILTIN_JUDGES.some((j) => j.id === old))
			await deleteJudgeProfile(engine.ws, old);
		await saveJudgeProfile(engine.ws, body);
		return libChanged(c);
	});
	app.delete('/api/judges/:id', async (c) => {
		const id = c.req.param('id');
		if (id === engine.settings.judge.default_profile)
			throw Object.assign(new Error('the default judge profile cannot be deleted'), {
				status: 409
			});
		await deleteJudgeProfile(engine.ws, id);
		return libChanged(c);
	});

	// ---------------------------------------------------------- API keys (names only, never values)

	app.get('/api/secrets', async (c) =>
		c.json(await listSecrets(engine.ws, await engine.library()))
	);
	app.put('/api/secrets/:name', async (c) => {
		guardWritable();
		const body = (await c.req.json()) as { value?: unknown };
		if (typeof body.value !== 'string')
			throw Object.assign(new Error('value must be a string'), { status: 400 });
		await setSecret(engine.ws, c.req.param('name'), body.value);
		return c.json(await listSecrets(engine.ws, await engine.library()));
	});
	app.delete('/api/secrets/:name', async (c) => {
		guardWritable();
		await deleteSecret(engine.ws, c.req.param('name'));
		return c.json(await listSecrets(engine.ws, await engine.library()));
	});

	app.put('/api/tests/:id', async (c) => {
		const body = (await c.req.json()) as { file: unknown; prompt: string };
		const file = TestFile.parse(body.file);
		if (file.id !== c.req.param('id')) await deleteTest(engine.ws, c.req.param('id'));
		await saveTest(engine.ws, file, body.prompt ?? '');
		return libChanged(c);
	});
	app.delete('/api/tests/:id', async (c) => {
		await deleteTest(engine.ws, c.req.param('id'));
		return libChanged(c);
	});
	app.post('/api/criteria/suggest', async (c) => {
		const body = (await c.req.json()) as { file: unknown; prompt: string; model?: string };
		const test = normalizeTest(TestFile.parse(body.file), body.prompt);
		const expected = taskMarkdown(test).split('## Expected output')[1]?.trim() ?? '';
		return c.json(
			await suggestCriteria({
				settings: engine.settings,
				title: test.title,
				prompt: test.prompt,
				output: expected,
				model: body.model
			})
		);
	});

	app.put('/api/suites/:id', async (c) => {
		const body = await c.req.json();
		if (body.id !== c.req.param('id')) await deleteSuite(engine.ws, c.req.param('id'));
		await saveSuite(engine.ws, body);
		return libChanged(c);
	});
	app.delete('/api/suites/:id', async (c) => {
		await deleteSuite(engine.ws, c.req.param('id'));
		return libChanged(c);
	});

	// ---------------------------------------------------------- runs

	app.post('/api/preflight', async (c) => c.json(await engine.preflight(await c.req.json())));
	app.get('/api/runs', (c) => c.json(engine.index.runRows()));
	app.post('/api/runs', async (c) => {
		guardWritable();
		const body = (await c.req.json()) as { spec: unknown; start?: boolean };
		const run = await engine.createRun(body.spec);
		if (body.start !== false) engine.startRun(run.id);
		return c.json({ run });
	});
	app.get('/api/runs/:id', (c) => {
		const run = engine.index.runs.get(c.req.param('id'));
		if (!run) return c.json({ error: 'run not found' }, 404);
		return c.json({ run, attempts: engine.index.attemptRows((a) => a.run_id === run.id) });
	});
	app.get('/api/runs/:id/attempts', (c) =>
		c.json(engine.index.attemptRows((a) => a.run_id === c.req.param('id')))
	);
	app.post('/api/runs/:id/start', (c) => {
		guardWritable();
		engine.startRun(c.req.param('id'));
		return c.json({ ok: true });
	});
	app.post('/api/runs/:id/cancel', (c) => c.json({ ok: engine.cancelRun(c.req.param('id')) }));
	app.post('/api/runs/:id/retry-failed', async (c) => {
		guardWritable();
		const n = await engine.retryFailed(c.req.param('id'));
		if (n) engine.startRun(c.req.param('id'));
		return c.json({ reset: n });
	});
	app.patch('/api/runs/:id', async (c) => {
		const body = (await c.req.json()) as { note?: string };
		if (typeof body.note === 'string') await engine.setRunNote(c.req.param('id'), body.note);
		return c.json({ ok: true });
	});
	app.delete('/api/runs/:id', async (c) => {
		guardWritable();
		await engine.deleteRun(c.req.param('id'));
		return c.json({ ok: true });
	});
	app.get('/api/runs/:id/llama-log', async (c) => {
		const text = await readFile(
			join(runDir(engine.ws, c.req.param('id')), 'llama-server.log'),
			'utf8'
		).catch(() => '');
		return c.text(text.slice(-200_000));
	});
	app.get('/api/runs/:id/log', async (c) => {
		const text = await readFile(
			join(runDir(engine.ws, c.req.param('id')), 'run.log'),
			'utf8'
		).catch(() => '');
		return c.text(text.slice(-200_000));
	});

	// ---------------------------------------------------------- attempts

	app.get('/api/attempts', (c) => c.json(engine.index.attemptRows()));
	app.get('/api/attempt', async (c) => {
		const id = c.req.query('id') ?? '';
		const detail = await attemptDetail(engine, id, (rel) => `/files/${rel}`);
		if (!detail) return c.json({ error: 'attempt not found' }, 404);
		return c.json(detail);
	});
	app.post('/api/attempt/human', async (c) => {
		const id = c.req.query('id') ?? '';
		const body = (await c.req.json()) as {
			score?: number;
			criteria?: Record<string, number>;
			notes?: string;
			rater?: string;
		};
		await engine.rateHuman(id, body);
		return c.json(await attemptDetail(engine, id, (rel) => `/files/${rel}`));
	});
	app.delete('/api/attempt/human', async (c) => {
		const id = c.req.query('id') ?? '';
		await engine.clearHuman(id);
		return c.json(await attemptDetail(engine, id, (rel) => `/files/${rel}`));
	});
	app.post('/api/judge', async (c) => {
		guardWritable();
		const body = (await c.req.json()) as {
			ids: string[];
			profile?: string;
			mode_override?: 'static' | 'interactive';
			override?: { profile?: string; mode_override?: 'static' | 'interactive' };
			rubric?: 'current' | 'snapshot';
		};
		const override = {
			profile: body.profile ?? body.override?.profile,
			mode_override: body.mode_override ?? body.override?.mode_override
		};
		if (override.profile && !(await engine.library()).judges.has(override.profile))
			throw Object.assign(new Error(`unknown judge profile: ${override.profile}`), {
				status: 400
			});
		// Fire and forget: progress arrives over /api/events.
		engine
			.rejudge(body.ids, override, body.rubric ?? 'current')
			.catch((e) => engine.log(null, 'error', `rejudge: ${(e as Error).message}`));
		return c.json({ queued: body.ids.length });
	});

	app.get('/api/leaderboard', (c) => {
		const q = c.req.query();
		return c.json(
			leaderboard(engine.index.attemptRows(), {
				tests: q.tests ? q.tests.split(',') : undefined,
				runs: q.runs ? q.runs.split(',') : undefined,
				splitVersions: q.split === '1'
			})
		);
	});

	// ---------------------------------------------------------- events

	app.get('/api/events', (c) =>
		streamSSE(c, async (stream) => {
			const queue: EngineEvent[] = [];
			let wake: (() => void) | null = null;
			const onEvent = (e: EngineEvent) => {
				queue.push(e);
				wake?.();
			};
			engine.on('event', onEvent);
			stream.onAbort(() => {
				engine.off('event', onEvent);
				wake?.();
			});
			await stream.writeSSE({ event: 'hello', data: JSON.stringify({ type: 'hello' }) });
			while (!stream.aborted) {
				while (queue.length) await stream.writeSSE({ data: JSON.stringify(queue.shift()) });
				await new Promise<void>((r) => {
					wake = r;
					setTimeout(r, 15_000);
				});
				wake = null;
				if (!queue.length && !stream.aborted) await stream.writeSSE({ event: 'ping', data: '{}' });
			}
			engine.off('event', onEvent);
		})
	);

	// ---------------------------------------------------------- result files

	app.get('/files/*', async (c) => {
		const rel = normalize(decodeURIComponent(c.req.path.slice('/files/'.length)));
		if (rel.startsWith('..') || rel.includes('\0')) return c.text('forbidden', 403);
		const path = resolve(engine.ws.runs, rel);
		if (!path.startsWith(engine.ws.runs + '/')) return c.text('forbidden', 403);
		try {
			const st = await stat(path);
			if (!st.isFile()) return c.text('not found', 404);
			const headers: Record<string, string> = {
				'content-type':
					mimeFor(path).startsWith('application/octet-stream') && /\.(md|log|ini|txt)$/i.test(path)
						? 'text/plain; charset=utf-8'
						: mimeFor(path),
				'cache-control': 'no-cache',
				'x-content-type-options': 'nosniff'
			};
			if (SANDBOXED.test(path))
				headers['content-security-policy'] =
					"sandbox allow-scripts allow-pointer-lock allow-modals; default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'none'";
			return c.body(await readFile(path), 200, headers);
		} catch {
			return c.text('not found', 404);
		}
	});

	// ---------------------------------------------------------- UI

	if (opts.uiDir) {
		const ui = opts.uiDir;
		app.get('*', async (c) => {
			const rel = normalize(decodeURIComponent(c.req.path)).replace(/^\/+/, '');
			if (rel.startsWith('..')) return c.text('forbidden', 403);
			for (const candidate of [rel || 'index.html', 'index.html']) {
				try {
					const path = join(ui, candidate);
					const st = await stat(path);
					if (!st.isFile()) continue;
					const immutable = candidate.includes('/immutable/');
					return c.body(await readFile(path), 200, {
						'content-type': mimeFor(path),
						'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
					});
				} catch {
					/* next */
				}
			}
			return c.text('BenchyOS is not built yet — run: pnpm build', 404);
		});
	}

	return app;
}
