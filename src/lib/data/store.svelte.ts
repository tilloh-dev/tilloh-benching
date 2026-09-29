import type { LibraryPayload, StatusPayload } from '$engine/api-types.ts';
import type { AttemptRow, RunRow } from '$engine/core/rows.ts';
import type { EngineEvent } from '$engine/run/events.ts';
import { DataClient } from './client.ts';

export type LogLine = { level: string; message: string; at: string; run_id: string | null };

/** App-wide reactive state, kept current by the server's event stream in live mode. */
class BenchyStore {
	client = $state<DataClient | null>(null);
	status = $state<StatusPayload | null>(null);
	runs = $state<RunRow[]>([]);
	attempts = $state<AttemptRow[]>([]);
	library = $state<LibraryPayload | null>(null);
	connected = $state(false);
	ready = $state(false);
	error = $state<string | null>(null);
	logs = $state<LogLine[]>([]);
	progress = $state<Record<string, { phase: string; chars: number; at: number }>>({});
	/** Bumped on any attempt change; viewers watch it to refetch details. */
	tick = $state(0);
	#source: EventSource | null = null;
	#retry = 1000;

	get live(): boolean {
		return this.client?.mode === 'live';
	}

	get api(): DataClient {
		if (!this.client) throw new Error('store not initialised');
		return this.client;
	}

	async init() {
		try {
			this.client = await DataClient.detect();
			await Promise.all([this.refresh(), this.reloadLibrary()]);
			if (this.live) this.#connect();
			this.ready = true;
		} catch (e) {
			this.error = (e as Error).message;
		}
	}

	async refresh() {
		const idx = await this.api.index();
		this.status = idx.status;
		this.runs = idx.runs;
		this.attempts = idx.attempts;
	}

	async reloadLibrary() {
		this.library = await this.api.library();
	}

	setLibrary(lib: LibraryPayload) {
		this.library = lib;
	}

	#connect() {
		this.#source?.close();
		const src = new EventSource('/api/events');
		this.#source = src;
		src.addEventListener('hello', () => {
			this.connected = true;
			this.#retry = 1000;
		});
		src.onmessage = (m) => {
			try {
				this.#apply(JSON.parse(m.data) as EngineEvent);
			} catch {
				/* ignore malformed */
			}
		};
		src.onerror = () => {
			this.connected = false;
			src.close();
			setTimeout(() => {
				this.#connect();
				this.refresh().catch(() => undefined);
			}, this.#retry);
			this.#retry = Math.min(this.#retry * 2, 15_000);
		};
	}

	#apply(e: EngineEvent) {
		switch (e.type) {
			case 'run': {
				const i = this.runs.findIndex((r) => r.id === e.run.id);
				if (i >= 0) this.runs[i] = e.run;
				else this.runs = [e.run, ...this.runs];
				break;
			}
			case 'attempt': {
				const i = this.attempts.findIndex((a) => a.id === e.attempt.id);
				if (i >= 0) this.attempts[i] = e.attempt;
				else this.attempts.push(e.attempt);
				if (e.attempt.stage !== 'generating') delete this.progress[e.attempt.id];
				this.tick++;
				break;
			}
			case 'log':
				this.logs.push({ level: e.level, message: e.message, at: e.at, run_id: e.run_id });
				if (this.logs.length > 600) this.logs.splice(0, this.logs.length - 600);
				break;
			case 'llama':
				if (this.status?.engine) this.status.engine.llama = e.status;
				break;
			case 'progress':
				this.progress[e.attempt_id] = { phase: e.phase, chars: e.chars, at: Date.now() };
				break;
			case 'library':
				this.reloadLibrary().catch(() => undefined);
				break;
			case 'index':
				this.refresh().catch(() => undefined);
				break;
		}
	}

	attemptsOf(runId: string): AttemptRow[] {
		return this.attempts.filter((a) => a.run_id === runId);
	}

	runById(id: string): RunRow | undefined {
		return this.runs.find((r) => r.id === id);
	}

	blueprintLabel(id: string): string {
		return this.library?.blueprints.find((b) => b.id === id)?.file.label ?? this.attempts.find((a) => a.blueprint_id === id)?.blueprint_label ?? id;
	}

	testTitle(id: string): string {
		return this.library?.tests.find((t) => t.id === id)?.file.title ?? id;
	}
}

export const benchy = new BenchyStore();
