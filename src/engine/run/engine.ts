import { EventEmitter } from 'node:events';
import { appendFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
	Attempt,
	ArtifactRef,
	BenchTest,
	Blueprint,
	HumanRating,
	JudgeKind,
	RunRecord,
	RunSpec
} from '../core/schema.ts';
import { RunSpec as RunSpecSchema } from '../core/schema.ts';
import { blueprintHash, loadLibrary, testHashes, type Library } from '../core/library.ts';
import { loadEnv, loadSettings, type ResolvedSettings } from '../core/settings.ts';
import { attemptDir, attemptId, runDir, workspaceAt, type Workspace } from '../core/workspace.ts';
import { kindForPath } from '../core/kinds.ts';
import { sha256 } from '../core/hash.ts';
import { scoreHuman } from '../core/scoring.ts';
import { ResultIndex, toAttemptRow, toRunRow } from '../store/index.ts';
import {
	dirOfAttempt,
	readAttempt,
	readChecks,
	updateAttempt,
	writeAttempt,
	writeAttemptText,
	writeChecks,
	writeHuman,
	writeJudgement
} from '../store/attempts.ts';
import { newRunId, readRun, updateRun, writeRun } from '../store/runs.ts';
import { buildMessages } from '../artifacts/prompt.ts';
import { extractArtifacts } from '../artifacts/extract.ts';
import { BrowserPool } from '../checks/browser.ts';
import { runChecks } from '../checks/index.ts';
import { judgeAttempt, judgeLabel, judgeIdentity, type JudgeConfig } from '../judge/index.ts';
import { LlamaManager } from '../llama/manager.ts';
import { ClaudeCodeSubject } from '../subjects/claude-code.ts';
import { DryRunSubject } from '../subjects/dry-run.ts';
import { LlamaCppSubject, OpenAICompatibleSubject } from '../subjects/openai-compatible.ts';
import type { Subject } from '../subjects/types.ts';
import {
	ensureDir,
	readJsonOr,
	safeRelative,
	walkFiles,
	writeFileAtomic,
	writeJson
} from '../util/fs.ts';
import { Semaphore } from '../util/lock.ts';
import { nowIso } from '../util/time.ts';
import type { EngineEvent, LogLevel } from './events.ts';
import { hostInfo } from './host.ts';
import { preflight, type PreflightReport } from './preflight.ts';

type ActiveRun = { controller: AbortController; done: Promise<void> };

const LOG_RING = 400;

export class EngineLockedError extends Error {
	readonly pid: number;
	constructor(pid: number) {
		super(
			`another BenchyOS engine (pid ${pid}) owns this workspace — use it (benchy serve) or stop it first`
		);
		this.pid = pid;
	}
}

function pidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * The engine owns one workspace: it creates and executes runs, keeps the result
 * index current and emits events for the UI. Exactly one engine per workspace
 * may execute runs (lock file); read-only openers skip the lock.
 */
export class Engine extends EventEmitter<{ event: [EngineEvent] }> {
	readonly ws: Workspace;
	settings: ResolvedSettings;
	readonly index: ResultIndex;
	readonly llama: LlamaManager;
	readonly browser = new BrowserPool();
	readonly exclusive: boolean;
	#active = new Map<string, ActiveRun>();
	#logs = new Map<string, EngineEvent[]>();
	#gen: Semaphore;
	#checks: Semaphore;
	#judge: Semaphore;
	#llamaLock = new Semaphore(1);
	#llamaBusy = false;
	#judgeJobs = 0;
	#lockFile: string;

	private constructor(ws: Workspace, settings: ResolvedSettings, exclusive: boolean) {
		super();
		this.setMaxListeners(100);
		this.ws = ws;
		this.settings = settings;
		this.exclusive = exclusive;
		this.index = new ResultIndex(ws);
		this.llama = new LlamaManager(ws, settings, (line) => this.log(null, 'info', `llama: ${line}`));
		this.#gen = new Semaphore(settings.concurrency.generation);
		this.#checks = new Semaphore(settings.concurrency.checks);
		this.#judge = new Semaphore(settings.concurrency.judge);
		this.#lockFile = join(ws.cache, 'engine.lock.json');
	}

	static async open(root: string, opts: { exclusive?: boolean } = {}): Promise<Engine> {
		const ws = workspaceAt(root);
		await loadEnv(ws);
		const settings = await loadSettings(ws);
		const engine = new Engine(ws, settings, opts.exclusive ?? false);
		if (engine.exclusive) await engine.#acquireLock();
		await engine.index.scan();
		if (engine.exclusive) await engine.#recoverInterrupted();
		return engine;
	}

	static #lockedRoots = new Set<string>();

	async #acquireLock() {
		if (Engine.#lockedRoots.has(this.ws.root)) throw new EngineLockedError(process.pid);
		await ensureDir(this.ws.cache);
		const held = await readJsonOr<{ pid: number } | null>(this.#lockFile, null);
		if (held && held.pid !== process.pid && pidAlive(held.pid))
			throw new EngineLockedError(held.pid);
		Engine.#lockedRoots.add(this.ws.root);
		await writeJson(this.#lockFile, { pid: process.pid, started_at: nowIso() });
	}

	async close(): Promise<void> {
		for (const [, a] of this.#active) a.controller.abort(new Error('engine shutting down'));
		await Promise.allSettled([...this.#active.values()].map((a) => a.done));
		await this.llama.stop().catch(() => undefined);
		await this.browser.close();
		if (this.exclusive) {
			Engine.#lockedRoots.delete(this.ws.root);
			const held = await readJsonOr<{ pid: number } | null>(this.#lockFile, null);
			if (held?.pid === process.pid) await rm(this.#lockFile, { force: true });
		}
	}

	async reloadSettings(): Promise<void> {
		this.settings = await loadSettings(this.ws);
		this.llama.settings = this.settings;
	}

	library(): Promise<Library> {
		return loadLibrary(this.ws);
	}

	// ------------------------------------------------------------ events & logs

	emitEvent(e: EngineEvent): void {
		this.emit('event', e);
	}

	log(runId: string | null, level: LogLevel, message: string): void {
		const e: EngineEvent = { type: 'log', run_id: runId, level, message, at: nowIso() };
		const key = runId ?? '_';
		const ring = this.#logs.get(key) ?? [];
		ring.push(e);
		if (ring.length > LOG_RING) ring.splice(0, ring.length - LOG_RING);
		this.#logs.set(key, ring);
		this.emitEvent(e);
		if (runId)
			appendFile(
				join(runDir(this.ws, runId), 'run.log'),
				`${e.type === 'log' ? e.at : ''} ${level.toUpperCase()} ${message}\n`
			).catch(() => undefined);
	}

	recentLogs(runId: string | null): EngineEvent[] {
		return this.#logs.get(runId ?? '_') ?? [];
	}

	#emitRun(run: RunRecord) {
		this.index.putRun(run);
		this.emitEvent({ type: 'run', run: toRunRow(run, this.index.attemptsOfRun(run.id)) });
	}

	#emitAttempt(a: Attempt) {
		this.index.putAttempt(a);
		this.emitEvent({ type: 'attempt', attempt: toAttemptRow(a, this.index.runs.get(a.run_id)) });
	}

	async #patch(id: string, fn: (a: Attempt) => void): Promise<Attempt> {
		const a = await updateAttempt(this.ws, id, (x) => {
			fn(x);
			return x;
		});
		this.#emitAttempt(a);
		return a;
	}

	status() {
		return {
			host: this.settings.host.name,
			exclusive: this.exclusive,
			llama: this.llama.status,
			active_runs: [...this.#active.keys()],
			judge_jobs: this.#judgeJobs
		};
	}

	isActive(runId: string): boolean {
		return this.#active.has(runId);
	}

	// ------------------------------------------------------------ run lifecycle

	#judgeConfig(spec: RunSpec): RunRecord['judge'] {
		const kind: JudgeKind = spec.judge?.kind ?? 'claude';
		if (kind !== 'claude') return { kind };
		return {
			kind,
			model: spec.judge?.model ?? this.settings.judge.model,
			effort: spec.judge?.effort ?? this.settings.judge.effort,
			mode_override: spec.judge?.mode_override ?? this.settings.judge.mode_override
		};
	}

	async preflight(spec: RunSpec): Promise<PreflightReport> {
		const lib = await this.library();
		const { blueprints, tests } = this.#resolveSpec(lib, spec);
		return preflight({
			settings: this.settings,
			blueprints,
			tests,
			judge: this.#judgeConfig(spec).kind,
			llama: this.llama,
			llamaBusy: this.#llamaBusy
		});
	}

	#resolveSpec(lib: Library, spec: RunSpec): { blueprints: Blueprint[]; tests: BenchTest[] } {
		const missingBp = spec.blueprints.filter((id) => !lib.blueprints.has(id));
		const missingT = spec.tests.filter((id) => !lib.tests.has(id));
		if (missingBp.length) throw new Error(`unknown or invalid blueprints: ${missingBp.join(', ')}`);
		if (missingT.length) throw new Error(`unknown or invalid tests: ${missingT.join(', ')}`);
		return {
			blueprints: [...new Set(spec.blueprints)].map((id) => lib.blueprints.get(id)!),
			tests: [...new Set(spec.tests)].map((id) => lib.tests.get(id)!)
		};
	}

	async createRun(input: unknown): Promise<RunRecord> {
		const spec = RunSpecSchema.parse(input);
		const lib = await this.library();
		const { blueprints, tests } = this.#resolveSpec(lib, spec);
		const repetitions =
			spec.repetitions ?? (spec.suite ? lib.suites.get(spec.suite)?.repetitions : undefined) ?? 1;
		const id = newRunId(this.settings.host.name);
		const now = nowIso();
		const run: RunRecord = {
			id,
			created_at: now,
			status: 'queued',
			spec: {
				...spec,
				blueprints: blueprints.map((b) => b.id),
				tests: tests.map((t) => t.id),
				repetitions
			},
			host: await hostInfo(this.settings.host.name),
			judge: this.#judgeConfig(spec),
			blueprints: Object.fromEntries(
				blueprints.map((b) => [b.id, { hash: blueprintHash(b), blueprint: b }])
			),
			tests: Object.fromEntries(tests.map((t) => [t.id, { ...testHashes(t), test: t }])),
			counts: { total: blueprints.length * tests.length * repetitions, done: 0, failed: 0 }
		};
		await writeRun(this.ws, run);
		for (const bp of blueprints) {
			for (const t of tests) {
				for (let rep = 1; rep <= repetitions; rep++) {
					const a: Attempt = {
						id: attemptId(id, bp.id, t.id, rep),
						run_id: id,
						blueprint_id: bp.id,
						blueprint_hash: run.blueprints[bp.id].hash,
						test_id: t.id,
						task_hash: run.tests[t.id].task_hash,
						rep,
						stage: 'pending',
						status: null,
						created_at: now,
						metrics: {},
						artifacts: [],
						evidence: []
					};
					await writeAttempt(this.ws, a);
					this.index.putAttempt(a);
				}
			}
		}
		this.#emitRun(run);
		this.log(
			id,
			'info',
			`created run: ${blueprints.length} blueprint(s) × ${tests.length} test(s) × ${repetitions}`
		);
		return run;
	}

	/** Starts (or resumes) a run in the background. */
	startRun(id: string): void {
		if (!this.exclusive) throw new Error('this engine is read-only');
		if (this.#active.has(id)) return;
		const controller = new AbortController();
		const done = this.#execute(id, controller.signal)
			.catch((e) => this.log(id, 'error', `run crashed: ${(e as Error).stack ?? e}`))
			.finally(() => this.#active.delete(id));
		this.#active.set(id, { controller, done });
	}

	async runToCompletion(id: string): Promise<RunRecord | null> {
		this.startRun(id);
		await this.#active.get(id)?.done;
		return readRun(this.ws, id);
	}

	cancelRun(id: string): boolean {
		const a = this.#active.get(id);
		if (!a) return false;
		a.controller.abort(new Error('cancelled'));
		this.log(id, 'warn', 'cancel requested');
		return true;
	}

	async deleteRun(id: string): Promise<void> {
		if (this.#active.has(id)) throw new Error('run is active; cancel it first');
		await rm(runDir(this.ws, id), { recursive: true, force: true });
		await this.index.refreshRun(id);
		this.emitEvent({ type: 'index' });
	}

	/** Resets failed attempts so the next start regenerates them. */
	/** Resets attempts whose generation failed or produced nothing usable, so the next start regenerates them. */
	async retryFailed(runId: string): Promise<number> {
		let n = 0;
		for (const a of this.index.attemptsOfRun(runId)) {
			if (a.error?.stage !== 'generating' && a.status !== 'failed') continue;
			await this.#patch(a.id, (x) => {
				x.stage = 'pending';
				x.status = null;
				delete x.error;
			});
			n++;
		}
		return n;
	}

	async #recoverInterrupted() {
		for (const run of this.index.runs.values()) {
			if (run.status !== 'running') continue;
			const next = await updateRun(this.ws, run.id, (r) => {
				r.status = 'interrupted';
			});
			this.index.putRun(next);
		}
	}

	async #execute(runId: string, signal: AbortSignal): Promise<void> {
		let run = await readRun(this.ws, runId);
		if (!run) throw new Error(`run not found: ${runId}`);
		run = await updateRun(this.ws, runId, (r) => {
			r.status = 'running';
			r.started_at ??= nowIso();
			delete r.error;
		});
		this.#emitRun(run);
		await this.index.refreshRun(runId);
		const attempts = this.index.attemptsOfRun(runId);
		const post: Promise<void>[] = [];
		const pipeline = (a: Attempt) => {
			post.push(
				this.#postProcess(run!, a.id, signal).catch((e) =>
					this.log(runId, 'error', `${a.id}: ${(e as Error).message}`)
				)
			);
		};

		const needsGen = (a: Attempt) =>
			!a.error && (a.stage === 'pending' || a.stage === 'generating');
		// Already generated attempts only need their later stages.
		for (const a of attempts) if (!needsGen(a) && !a.error) pipeline(a);

		const byBp = new Map<string, Attempt[]>();
		for (const a of attempts.filter(needsGen)) {
			const list = byBp.get(a.blueprint_id) ?? [];
			list.push(a);
			byBp.set(a.blueprint_id, list);
		}
		const bpOf = (id: string) => run!.blueprints[id].blueprint;
		const llamaIds = [...byBp.keys()].filter((id) => bpOf(id).kind === 'llama-cpp');
		const otherIds = [...byBp.keys()].filter((id) => bpOf(id).kind !== 'llama-cpp');

		const genOther = Promise.all(
			otherIds.map(async (bpId) => {
				const bp = bpOf(bpId);
				const perBp = new Semaphore(bp.concurrency ?? (bp.kind === 'dry-run' ? 4 : 2));
				await Promise.all(
					byBp.get(bpId)!.map((a) =>
						perBp.use(() =>
							this.#gen.use(async () => {
								if (signal.aborted) return;
								const ok = await this.#generate(run!, a, signal);
								if (ok) pipeline(a);
							})
						)
					)
				);
			})
		);

		const genLlama = llamaIds.length
			? this.#runLlama(run, llamaIds, byBp, signal, pipeline)
			: Promise.resolve();
		const genResults = await Promise.allSettled([genOther, genLlama]);
		for (const r of genResults)
			if (r.status === 'rejected') this.log(runId, 'error', (r.reason as Error).message);
		await Promise.allSettled(post);

		await this.index.refreshRun(runId);
		const final = this.index.attemptsOfRun(runId);
		const llamaError = genResults.find((r) => r.status === 'rejected') as
			PromiseRejectedResult | undefined;
		run = await updateRun(this.ws, runId, (r) => {
			r.finished_at = nowIso();
			r.status = signal.aborted
				? 'cancelled'
				: llamaError && final.every((a) => a.error)
					? 'failed'
					: 'done';
			if (llamaError) r.error = (llamaError.reason as Error).message;
			r.counts = {
				total: final.length,
				done: final.filter(
					(a) => a.stage === 'judged' || (a.stage === 'checked' && r.judge.kind === 'none')
				).length,
				failed: final.filter((a) => a.status === 'failed').length
			};
		});
		this.#emitRun(run);
		this.log(
			runId,
			'info',
			`run ${run.status}: ${run.counts?.done}/${run.counts?.total} complete, ${run.counts?.failed} failed`
		);
		if (this.#active.size <= 1) await this.browser.close();
	}

	async #runLlama(
		run: RunRecord,
		ids: string[],
		byBp: Map<string, Attempt[]>,
		signal: AbortSignal,
		pipeline: (a: Attempt) => void
	): Promise<void> {
		const release = await this.#llamaLock.acquire();
		this.#llamaBusy = true;
		const dir = runDir(this.ws, run.id);
		try {
			const bps = ids.map((id) => run.blueprints[id].blueprint);
			this.log(run.id, 'info', `starting llama-server for ${bps.length} blueprint(s)`);
			this.emitEvent({ type: 'llama', status: this.llama.status });
			let info;
			try {
				info = await this.llama.start({ runDir: dir, runId: run.id, blueprints: bps });
			} catch (e) {
				const msg = (e as Error).message;
				for (const id of ids)
					for (const a of byBp.get(id)!)
						await this.#fail(a.id, 'generating', `llama-server: ${msg}`);
				throw e;
			}
			const version = await this.llama.version(info.binary).catch(() => undefined);
			await updateRun(this.ws, run.id, (r) => {
				r.llama = {
					mode: info.mode,
					binary: info.binary,
					build: version,
					port: info.port,
					connect_url: info.url,
					preset_file: 'llama-preset.ini',
					sections: info.sections,
					props: r.llama?.props ?? {},
					gpu: r.host.gpus,
					started_at: nowIso()
				};
			});
			this.emitEvent({ type: 'llama', status: this.llama.status });
			const subject = new LlamaCppSubject();
			for (const id of ids) {
				if (signal.aborted) break;
				let loadMs = 0;
				try {
					loadMs = (await this.llama.load(id, signal)).load_ms;
				} catch (e) {
					for (const a of byBp.get(id)!)
						await this.#fail(a.id, 'generating', `model load failed: ${(e as Error).message}`);
					this.log(run.id, 'error', `${id}: ${(e as Error).message}`);
					continue;
				}
				this.emitEvent({ type: 'llama', status: this.llama.status });
				const props = await this.llama.props(id);
				const models = await this.llama.models();
				const entry = (models as { data?: { id: string; status?: unknown }[] } | null)?.data?.find(
					(m) => m.id === id
				);
				await updateRun(this.ws, run.id, (r) => {
					if (!r.llama) return;
					r.llama.props[id] = { props, model: entry ?? null, load_ms: loadMs };
				}).then((r) => this.#emitRun(r));
				const endpoint = this.llama.endpointFor(id);
				let first = true;
				for (const a of byBp.get(id)!) {
					if (signal.aborted) break;
					const ok = await this.#generate(
						run,
						a,
						signal,
						subject,
						endpoint,
						first ? loadMs : undefined
					);
					first = false;
					if (ok) pipeline(a);
				}
			}
		} finally {
			await this.llama.collectLog(dir).catch(() => undefined);
			await this.llama.stop().catch(() => undefined);
			await updateRun(this.ws, run.id, (r) => {
				if (r.llama) r.llama.stopped_at = nowIso();
			}).catch(() => undefined);
			this.emitEvent({ type: 'llama', status: this.llama.status });
			this.#llamaBusy = false;
			release();
		}
	}

	#subjectFor(bp: Blueprint): Subject {
		switch (bp.kind) {
			case 'dry-run':
				return new DryRunSubject();
			case 'openai-compatible':
				return new OpenAICompatibleSubject();
			case 'claude-code':
				return new ClaudeCodeSubject(this.settings.judge.claude_bin);
			case 'llama-cpp':
				return new LlamaCppSubject();
		}
	}

	async #fail(id: string, stage: Attempt['stage'], message: string) {
		await this.#patch(id, (x) => {
			x.error = { stage, message };
			x.status = 'failed';
			x.finished_at = nowIso();
		});
	}

	/** Generation + extraction. Returns true when artifacts are ready for checks. */
	async #generate(
		run: RunRecord,
		a: Attempt,
		signal: AbortSignal,
		subject?: Subject,
		endpoint?: { baseUrl: string; model: string; apiKey: string },
		loadMs?: number
	): Promise<boolean> {
		const bp = run.blueprints[a.blueprint_id].blueprint;
		const test = run.tests[a.test_id].test;
		const dir = attemptDir(this.ws, run.id, a.blueprint_id, a.test_id, a.rep);
		await rm(join(dir, 'artifacts'), { recursive: true, force: true });
		await rm(join(dir, 'evidence'), { recursive: true, force: true });
		// A regenerated attempt is a new sample: verdicts and ratings of the old one no longer apply.
		for (const stale of ['judgements', 'checks.json', 'human.json', 'reasoning.md']) {
			await rm(join(dir, stale), { recursive: true, force: true });
		}
		await ensureDir(join(dir, 'artifacts'));
		await this.#patch(a.id, (x) => {
			x.stage = 'generating';
			x.started_at = nowIso();
			x.artifacts = [];
			x.evidence = [];
			x.status = null;
			delete x.error;
			delete x.checks;
			delete x.judgement;
			delete x.judge_error;
			delete x.human;
		});
		this.log(run.id, 'info', `generate ${a.blueprint_id} × ${a.test_id} #${a.rep}`);
		const agentic =
			bp.kind === 'claude-code' &&
			(bp.claude?.mode === 'agentic' || test.output.mode === 'workspace');
		let lastProgress = 0;
		try {
			const result = await (subject ?? this.#subjectFor(bp)).generate({
				blueprint: bp,
				test,
				rep: a.rep,
				messages: buildMessages(bp, test, agentic),
				workDir: join(dir, 'artifacts'),
				signal,
				endpoint,
				onProgress: (p) => {
					const now = Date.now();
					if (now - lastProgress < 500) return;
					lastProgress = now;
					this.emitEvent({ type: 'progress', attempt_id: a.id, phase: p.phase, chars: p.chars });
				}
			});
			await writeAttemptText(this.ws, a.id, 'response.md', result.content);
			if (result.reasoning) await writeAttemptText(this.ws, a.id, 'reasoning.md', result.reasoning);
			await writeJson(join(dir, 'raw.json'), result.raw ?? null);

			let artifacts: ArtifactRef[] = result.wroteFiles
				? await this.#collectWorkspace(dir, test)
				: [];
			let extraction: Attempt['extraction'];
			if (artifacts.length) {
				extraction = { method: 'workspace', notes: [] };
			} else {
				// Also the fallback for agents that answered in text instead of writing files.
				const ex = extractArtifacts(test, result.content);
				artifacts = [];
				for (const f of ex.files) {
					const safe = safeRelative(f.path);
					if (!safe) continue;
					const rel = `artifacts/${safe}`;
					await writeFileAtomic(join(dir, rel), f.content);
					artifacts.push({
						path: rel,
						kind: f.kind,
						bytes: Buffer.byteLength(f.content),
						sha256: sha256(f.content).slice(0, 16),
						declared: f.declared,
						source: f.source
					});
				}
				extraction = { method: ex.method, notes: ex.notes };
			}
			await this.#patch(a.id, (x) => {
				x.stage = 'generated';
				x.generated_at = nowIso();
				x.metrics = { ...result.metrics, ...(loadMs !== undefined ? { load_ms: loadMs } : {}) };
				x.artifacts = artifacts;
				x.extraction = extraction;
			});
			return true;
		} catch (e) {
			const msg = signal.aborted ? 'cancelled' : (e as Error).message;
			const raw = (e as { raw?: unknown }).raw;
			if (raw) await writeJson(join(dir, 'raw.json'), { error: msg, raw }).catch(() => undefined);
			const partial = (raw as { content?: string } | undefined)?.content;
			if (partial)
				await writeAttemptText(this.ws, a.id, 'response.md', partial).catch(() => undefined);
			if (signal.aborted) {
				await this.#patch(a.id, (x) => {
					x.stage = 'pending';
				});
			} else {
				await this.#fail(a.id, 'generating', msg);
				this.log(run.id, 'warn', `${a.id} failed: ${msg}`);
			}
			return false;
		}
	}

	async #collectWorkspace(dir: string, test: BenchTest): Promise<ArtifactRef[]> {
		const out: ArtifactRef[] = [];
		const declared = new Set(test.output.files.map((f) => f.path));
		for (const rel of await walkFiles(join(dir, 'artifacts'))) {
			const full = join(dir, 'artifacts', rel);
			const st = await stat(full);
			out.push({
				path: `artifacts/${rel}`,
				kind: test.output.files.find((f) => f.path === rel)?.kind ?? kindForPath(rel),
				bytes: st.size,
				sha256: sha256(await readFile(full)).slice(0, 16),
				declared: declared.has(rel),
				source: 'workspace'
			});
		}
		return out;
	}

	/** Checks, then judge — each stage skipped if already done. */
	async #postProcess(run: RunRecord, id: string, signal: AbortSignal): Promise<void> {
		let a = await readAttempt(this.ws, id);
		if (!a || a.error) return;
		if (a.stage === 'generated' || a.stage === 'checking') {
			a = await this.#checks.use(() => this.#runChecksFor(run, a!, signal));
		}
		if (signal.aborted || !a) return;
		if ((a.stage === 'checked' || a.stage === 'judging') && run.judge.kind !== 'none') {
			const cfg: JudgeConfig = {
				kind: run.judge.kind,
				model: run.judge.model ?? this.settings.judge.model,
				effort: run.judge.effort,
				mode_override: run.judge.mode_override
			};
			await this.#judgeOne(run, a, cfg, run.tests[a.test_id], signal);
		}
	}

	async #runChecksFor(run: RunRecord, a: Attempt, signal: AbortSignal): Promise<Attempt> {
		const snap = run.tests[a.test_id];
		const dir = attemptDir(this.ws, run.id, a.blueprint_id, a.test_id, a.rep);
		await rm(join(dir, 'evidence'), { recursive: true, force: true });
		await this.#patch(a.id, (x) => {
			x.stage = 'checking';
		});
		const { file, evidence } = await runChecks(
			{
				test: snap.test,
				attemptDir: dir,
				artifacts: a.artifacts,
				extractionNotes: a.extraction?.notes ?? [],
				settings: this.settings,
				browser: this.browser,
				signal
			},
			snap.test.checks,
			snap.checks_hash
		);
		await writeChecks(this.ws, a.id, file);
		return this.#patch(a.id, (x) => {
			x.stage = 'checked';
			x.status = file.status;
			x.evidence = evidence;
			x.checks = {
				status: file.status,
				failed: file.results.filter((r) => r.status === 'fail').map((r) => r.id),
				warned: file.results
					.filter((r) => r.status === 'warn' || r.status === 'error')
					.map((r) => r.id)
			};
			if (run.judge.kind === 'none') x.finished_at = nowIso();
		});
	}

	async #judgeOne(
		run: RunRecord,
		a: Attempt,
		cfg: JudgeConfig,
		snap: RunRecord['tests'][string],
		signal: AbortSignal
	) {
		this.#judgeJobs++;
		try {
			await this.#judge.use(async () => {
				if (signal.aborted) return;
				await this.#patch(a.id, (x) => {
					x.stage = 'judging';
				});
				const label = judgeLabel(judgeIdentity(cfg, snap.test));
				this.log(run.id, 'info', `judge ${a.blueprint_id} × ${a.test_id} #${a.rep} (${label})`);
				const dir = attemptDir(this.ws, run.id, a.blueprint_id, a.test_id, a.rep);
				const j = await judgeAttempt({
					ws: this.ws,
					settings: this.settings,
					attempt: a,
					attemptDir: dir,
					test: snap.test,
					rubricHash: snap.rubric_hash,
					checks: await readChecks(this.ws, a.id),
					config: cfg,
					signal,
					log: (m) => this.log(run.id, 'info', m)
				});
				await writeJudgement(this.ws, a.id, j);
				await this.#patch(a.id, (x) => {
					if (j.error || j.score === undefined) {
						x.stage = 'checked';
						x.judge_error = j.error ?? 'no score';
					} else {
						x.stage = 'judged';
						delete x.judge_error;
						x.judgement = {
							fingerprint: j.fingerprint,
							score: j.score,
							gate_failed: !!j.gate_failed,
							judged_at: j.created_at,
							judge: label
						};
					}
					x.finished_at = nowIso();
				});
				if (j.error) this.log(run.id, 'warn', `judge failed for ${a.id}: ${j.error}`);
			});
		} finally {
			this.#judgeJobs--;
		}
	}

	/**
	 * Re-judges attempts without regenerating. By default the test's current
	 * rubric from the library is used (that is the point of re-judging); the
	 * prompt stays the one the model actually saw.
	 */
	async rejudge(
		ids: string[],
		override: Partial<JudgeConfig> = {},
		rubric: 'current' | 'snapshot' = 'current'
	): Promise<void> {
		if (!this.exclusive) throw new Error('this engine is read-only');
		const lib = await this.library();
		const controller = new AbortController();
		const jobs = ids.map(async (id) => {
			const a = await readAttempt(this.ws, id);
			if (!a || a.error || !['checked', 'judged', 'judging'].includes(a.stage)) return;
			const run = this.index.runs.get(a.run_id) ?? (await readRun(this.ws, a.run_id));
			if (!run) return;
			const snap = run.tests[a.test_id];
			let test = snap.test;
			if (rubric === 'current' && lib.tests.has(a.test_id))
				test = { ...snap.test, judge: lib.tests.get(a.test_id)!.judge };
			const hashes = testHashes(test);
			const cfg: JudgeConfig = {
				kind:
					override.kind ??
					(run.judge.kind === 'none'
						? 'claude'
						: run.judge.kind === 'dry-run'
							? 'dry-run'
							: 'claude'),
				model: override.model ?? run.judge.model ?? this.settings.judge.model,
				effort: override.effort ?? run.judge.effort ?? this.settings.judge.effort,
				mode_override: override.mode_override ?? run.judge.mode_override
			};
			await this.#judgeOne(
				run,
				a,
				cfg,
				{ ...snap, test, rubric_hash: hashes.rubric_hash },
				controller.signal
			);
		});
		await Promise.allSettled(jobs);
		for (const runId of new Set(ids.map((i) => i.split('/')[0]))) {
			const run = this.index.runs.get(runId);
			if (run) this.#emitRun(run);
		}
	}

	/** Re-runs the automated checks (fresh evidence) without touching generation or judgements. */
	async recheck(ids: string[]): Promise<void> {
		if (!this.exclusive) throw new Error('this engine is read-only');
		const controller = new AbortController();
		await Promise.allSettled(
			ids.map(async (id) => {
				const a = await readAttempt(this.ws, id);
				if (!a || a.error || a.stage === 'pending' || a.stage === 'generating') return;
				const run = this.index.runs.get(a.run_id) ?? (await readRun(this.ws, a.run_id));
				if (!run) return;
				const wasJudged = !!a.judgement;
				await this.#checks.use(() => this.#runChecksFor(run, a, controller.signal));
				if (wasJudged) {
					await this.#patch(id, (x) => {
						x.stage = 'judged';
					});
				}
			})
		);
		await this.browser.close();
	}

	async rateHuman(id: string, rating: Omit<HumanRating, 'rated_at'>): Promise<Attempt> {
		const a = await readAttempt(this.ws, id);
		if (!a) throw new Error(`attempt not found: ${id}`);
		const run = this.index.runs.get(a.run_id) ?? (await readRun(this.ws, a.run_id));
		const criteria = run?.tests[a.test_id]?.test.judge.criteria ?? [];
		const full: HumanRating = { ...rating, rated_at: nowIso() };
		await writeHuman(this.ws, id, full);
		return this.#patch(id, (x) => {
			x.human = { score: scoreHuman(criteria, full), rated_at: full.rated_at };
		});
	}

	async clearHuman(id: string): Promise<Attempt> {
		await rm(join(dirOfAttempt(this.ws, id), 'human.json'), { force: true });
		return this.#patch(id, (x) => {
			delete x.human;
		});
	}

	async setRunNote(id: string, note: string): Promise<void> {
		const r = await updateRun(this.ws, id, (x) => {
			x.spec.note = note;
		});
		this.#emitRun(r);
	}
}
