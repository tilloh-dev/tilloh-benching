import type {
	AttemptDetail,
	IndexPayload,
	LibraryPayload,
	RunDetail
} from '$engine/api-types.ts';
import type { PreflightReport } from '$engine/run/preflight.ts';
import type { CriteriaSuggestion, RunRecord, RunSpec } from '$engine/core/schema.ts';

/**
 * One interface, two backends: the live API of `benchy serve`, or the JSON
 * snapshot written by `benchy export`. Mutations only exist in live mode.
 */
export type DataMode = 'live' | 'static';

export class ApiError extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

async function json<T>(res: Response): Promise<T> {
	const text = await res.text();
	let data: unknown;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		throw new ApiError(text.slice(0, 200) || res.statusText, res.status);
	}
	if (!res.ok) throw new ApiError((data as { error?: string })?.error ?? res.statusText, res.status);
	return data as T;
}

export function exportAttemptFile(id: string): string {
	return `${id.replaceAll('/', '__')}.json`;
}

export class DataClient {
	readonly mode: DataMode;

	constructor(mode: DataMode) {
		this.mode = mode;
	}

	static async detect(): Promise<DataClient> {
		try {
			const res = await fetch('./data/index.json', { cache: 'no-store' });
			if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) return new DataClient('static');
		} catch {
			/* live */
		}
		return new DataClient('live');
	}

	get live(): boolean {
		return this.mode === 'live';
	}

	/** URL of a result file (path relative to data/runs). */
	fileUrl(rel: string): string {
		const clean = rel.replace(/^\/+/, '').replace(/^files\//, '');
		return this.live ? `/files/${clean}` : `./files/${clean}`;
	}

	#get<T>(path: string): Promise<T> {
		return fetch(path, { cache: 'no-store' }).then((r) => json<T>(r));
	}

	#send<T>(method: string, path: string, body?: unknown): Promise<T> {
		if (!this.live) return Promise.reject(new ApiError('read-only export', 409));
		return fetch(path, {
			method,
			headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
			body: body !== undefined ? JSON.stringify(body) : undefined
		}).then((r) => json<T>(r));
	}

	index(): Promise<IndexPayload> {
		return this.#get(this.live ? '/api/index' : './data/index.json');
	}

	library(): Promise<LibraryPayload> {
		return this.#get(this.live ? '/api/library' : './data/library.json');
	}

	run(id: string): Promise<RunDetail> {
		return this.#get(this.live ? `/api/runs/${encodeURIComponent(id)}` : `./data/runs/${encodeURIComponent(id)}.json`);
	}

	attempt(id: string): Promise<AttemptDetail> {
		return this.#get(this.live ? `/api/attempt?id=${encodeURIComponent(id)}` : `./data/attempts/${encodeURIComponent(exportAttemptFile(id))}`);
	}

	text(url: string): Promise<string> {
		return fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''));
	}

	runLog(id: string): Promise<string> {
		return this.live ? this.text(`/api/runs/${encodeURIComponent(id)}/log`) : this.text(this.fileUrl(`${id}/run.log`));
	}

	llamaLog(id: string): Promise<string> {
		return this.live ? this.text(`/api/runs/${encodeURIComponent(id)}/llama-log`) : this.text(this.fileUrl(`${id}/llama-server.log`));
	}

	// ------------------------------------------------------------ live-only

	saveBlueprint(originalId: string, file: unknown): Promise<LibraryPayload> {
		return this.#send('PUT', `/api/blueprints/${encodeURIComponent(originalId)}`, file);
	}
	deleteBlueprint(id: string): Promise<LibraryPayload> {
		return this.#send('DELETE', `/api/blueprints/${encodeURIComponent(id)}`);
	}
	importPreset(body: { ini?: string; path?: string; sections?: string[]; prefix?: string; overwrite?: boolean }) {
		return this.#send<{ created: string[]; skipped: string[]; library: LibraryPayload }>('POST', '/api/blueprints/import-preset', body);
	}
	saveTest(originalId: string, file: unknown, prompt: string): Promise<LibraryPayload> {
		return this.#send('PUT', `/api/tests/${encodeURIComponent(originalId)}`, { file, prompt });
	}
	deleteTest(id: string): Promise<LibraryPayload> {
		return this.#send('DELETE', `/api/tests/${encodeURIComponent(id)}`);
	}
	suggestCriteria(file: unknown, prompt: string): Promise<CriteriaSuggestion> {
		return this.#send('POST', '/api/criteria/suggest', { file, prompt });
	}
	saveSuite(originalId: string, suite: unknown): Promise<LibraryPayload> {
		return this.#send('PUT', `/api/suites/${encodeURIComponent(originalId)}`, suite);
	}
	deleteSuite(id: string): Promise<LibraryPayload> {
		return this.#send('DELETE', `/api/suites/${encodeURIComponent(id)}`);
	}
	preflight(spec: RunSpec): Promise<PreflightReport> {
		return this.#send('POST', '/api/preflight', spec);
	}
	createRun(spec: RunSpec, start = true): Promise<{ run: RunRecord }> {
		return this.#send('POST', '/api/runs', { spec, start });
	}
	startRun(id: string) {
		return this.#send('POST', `/api/runs/${encodeURIComponent(id)}/start`);
	}
	cancelRun(id: string) {
		return this.#send('POST', `/api/runs/${encodeURIComponent(id)}/cancel`);
	}
	retryFailed(id: string) {
		return this.#send<{ reset: number }>('POST', `/api/runs/${encodeURIComponent(id)}/retry-failed`);
	}
	deleteRun(id: string) {
		return this.#send('DELETE', `/api/runs/${encodeURIComponent(id)}`);
	}
	setRunNote(id: string, note: string) {
		return this.#send('PATCH', `/api/runs/${encodeURIComponent(id)}`, { note });
	}
	judge(ids: string[], override: Record<string, unknown> = {}, rubric: 'current' | 'snapshot' = 'current') {
		return this.#send<{ queued: number }>('POST', '/api/judge', { ids, override, rubric });
	}
	rateHuman(id: string, rating: { score?: number; criteria?: Record<string, number>; notes?: string }) {
		return this.#send<AttemptDetail>('POST', `/api/attempt/human?id=${encodeURIComponent(id)}`, rating);
	}
	clearHuman(id: string) {
		return this.#send<AttemptDetail>('DELETE', `/api/attempt/human?id=${encodeURIComponent(id)}`);
	}
	rescan() {
		return this.#send('POST', '/api/rescan');
	}
	conflicts() {
		return this.#get<{ conflicts: string[] }>('/api/host/conflicts');
	}
	logs(runId: string | null) {
		return this.#get<{ type: 'log'; level: string; message: string; at: string; run_id: string | null }[]>(`/api/logs${runId ? `?run=${encodeURIComponent(runId)}` : ''}`);
	}
}
