import type { EngineEvent } from '../engine/run/events.ts';
import { loadSettings } from '../engine/core/settings.ts';
import { workspaceAt } from '../engine/core/workspace.ts';

/** Talks to a running `benchy serve` for the same workspace, if there is one. */
export class ServerClient {
	readonly base: string;
	constructor(base: string) {
		this.base = base;
	}

	static async detect(root: string): Promise<ServerClient | null> {
		const settings = await loadSettings(workspaceAt(root));
		const base = `http://127.0.0.1:${settings.server.port}`;
		try {
			const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
			if (!res.ok) return null;
			const body = (await res.json()) as { root?: string };
			return body.root === workspaceAt(root).root ? new ServerClient(base) : null;
		} catch {
			return null;
		}
	}

	async call<T>(method: string, path: string, body?: unknown): Promise<T> {
		const res = await fetch(`${this.base}${path}`, {
			method,
			headers: body ? { 'content-type': 'application/json' } : undefined,
			body: body ? JSON.stringify(body) : undefined
		});
		const text = await res.text();
		const data = text ? JSON.parse(text) : null;
		if (!res.ok) throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
		return data as T;
	}

	/** Streams engine events until `until` returns true. */
	async follow(
		until: (e: EngineEvent) => boolean,
		onEvent: (e: EngineEvent) => void
	): Promise<void> {
		const res = await fetch(`${this.base}/api/events`);
		if (!res.body) throw new Error('no event stream');
		const decoder = new TextDecoder();
		let buffer = '';
		for await (const chunk of res.body) {
			buffer += decoder.decode(chunk, { stream: true });
			let idx: number;
			while ((idx = buffer.indexOf('\n\n')) >= 0) {
				const block = buffer.slice(0, idx);
				buffer = buffer.slice(idx + 2);
				const data = block
					.split('\n')
					.filter((l) => l.startsWith('data:'))
					.map((l) => l.slice(5).trim())
					.join('\n');
				if (!data) continue;
				const e = JSON.parse(data) as EngineEvent;
				onEvent(e);
				if (until(e)) return;
			}
		}
	}
}
