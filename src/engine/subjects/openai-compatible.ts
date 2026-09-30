import type { Blueprint, Metrics } from '../core/schema.ts';
import type { ChatMessage } from '../artifacts/prompt.ts';
import { computeTps } from './tps.ts';
import { SubjectError, type GenerateRequest, type GenerateResult, type Subject } from './types.ts';

type StreamChunk = {
	choices?: {
		delta?: {
			content?: string | null;
			reasoning_content?: string | null;
			reasoning?: string | null;
		};
		finish_reason?: string | null;
	}[];
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
		cost?: number;
		completion_tokens_details?: { reasoning_tokens?: number };
	};
	timings?: {
		prompt_n?: number;
		prompt_ms?: number;
		prompt_per_second?: number;
		predicted_n?: number;
		predicted_ms?: number;
		predicted_per_second?: number;
		draft_n?: number;
		draft_n_accepted?: number;
	};
	model?: string;
	error?: { message?: string };
};

export type ChatCallOptions = {
	baseUrl: string;
	model: string;
	apiKey?: string;
	headers?: Record<string, string>;
	messages: ChatMessage[];
	body: Record<string, unknown>;
	timeoutMs: number;
	signal: AbortSignal;
	pricing?: Blueprint['pricing'];
	onProgress?: GenerateRequest['onProgress'];
};

function joinUrl(base: string, path: string): string {
	return base.replace(/\/+$/, '') + path;
}

/** Streams one chat completion from any OpenAI-compatible server (llama.cpp, OpenRouter, Ollama, …). */
export async function streamChat(opts: ChatCallOptions): Promise<GenerateResult> {
	const started = performance.now();
	const signal = AbortSignal.any([opts.signal, AbortSignal.timeout(opts.timeoutMs)]);
	const body = {
		...opts.body,
		model: opts.model,
		messages: opts.messages,
		stream: true,
		stream_options: { include_usage: true }
	};
	let res: Response;
	try {
		res = await fetch(joinUrl(opts.baseUrl, '/chat/completions'), {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'text/event-stream',
				...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
				...opts.headers
			},
			body: JSON.stringify(body),
			signal
		});
	} catch (e) {
		throw new SubjectError(`request failed: ${(e as Error).message}`);
	}
	if (!res.ok || !res.body) {
		const text = await res.text().catch(() => '');
		throw new SubjectError(`HTTP ${res.status}: ${text.slice(0, 800)}`, {
			status: res.status,
			body: text
		});
	}

	let content = '';
	let reasoning = '';
	let finish: string | undefined;
	let ttft: number | undefined;
	let usage: StreamChunk['usage'];
	let timings: StreamChunk['timings'];
	let servedModel: string | undefined;
	const decoder = new TextDecoder();
	let buffer = '';

	const handle = (data: string) => {
		if (data === '[DONE]') return;
		let chunk: StreamChunk;
		try {
			chunk = JSON.parse(data);
		} catch {
			return;
		}
		if (chunk.error)
			throw new SubjectError(`stream error: ${chunk.error.message ?? 'unknown'}`, chunk);
		servedModel ??= chunk.model;
		if (chunk.usage) usage = chunk.usage;
		if (chunk.timings) timings = chunk.timings;
		for (const choice of chunk.choices ?? []) {
			const d = choice.delta ?? {};
			const r = d.reasoning_content ?? d.reasoning;
			if (r) {
				ttft ??= performance.now() - started;
				reasoning += r;
				opts.onProgress?.({ phase: 'reasoning', chars: reasoning.length });
			}
			if (d.content) {
				ttft ??= performance.now() - started;
				content += d.content;
				opts.onProgress?.({ phase: 'content', chars: content.length });
			}
			if (choice.finish_reason) finish = choice.finish_reason;
		}
	};

	try {
		for await (const part of res.body) {
			buffer += decoder.decode(part, { stream: true });
			let nl: number;
			while ((nl = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, nl).replace(/\r$/, '');
				buffer = buffer.slice(nl + 1);
				if (line.startsWith('data:')) handle(line.slice(5).trim());
			}
		}
		if (buffer.startsWith('data:')) handle(buffer.slice(5).trim());
	} catch (e) {
		if (e instanceof SubjectError) throw e;
		const partial = content.length ? ` after ${content.length} chars` : '';
		throw new SubjectError(`stream aborted${partial}: ${(e as Error).message}`, {
			content,
			reasoning
		});
	}

	const latency = performance.now() - started;
	const metrics: Metrics = {
		latency_ms: Math.round(latency),
		ttft_ms: ttft !== undefined ? Math.round(ttft) : undefined,
		prompt_tokens: usage?.prompt_tokens ?? timings?.prompt_n,
		completion_tokens: usage?.completion_tokens ?? timings?.predicted_n,
		reasoning_tokens: usage?.completion_tokens_details?.reasoning_tokens,
		total_tokens: usage?.total_tokens,
		prompt_tps: timings?.prompt_per_second ? round1(timings.prompt_per_second) : undefined,
		...(timings?.predicted_per_second
			? { gen_tps: round1(timings.predicted_per_second), tps_source: 'server' as const }
			: computeTps({
					tokens: usage?.completion_tokens,
					chars: content.length + reasoning.length,
					genMs: ttft !== undefined ? latency - ttft : undefined
				})),
		draft_n: timings?.draft_n,
		draft_accepted: timings?.draft_n_accepted,
		cost_usd: usage?.cost ?? priced(opts.pricing, usage),
		finish_reason: finish
	};
	return {
		content,
		reasoning: reasoning || undefined,
		raw: {
			request: { ...body, messages: undefined },
			served_model: servedModel,
			usage,
			timings,
			finish_reason: finish
		},
		metrics
	};
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

function priced(pricing: Blueprint['pricing'], usage: StreamChunk['usage']): number | undefined {
	if (!pricing || !usage?.prompt_tokens) return undefined;
	const cost =
		(usage.prompt_tokens / 1e6) * pricing.input_per_mtok +
		((usage.completion_tokens ?? 0) / 1e6) * pricing.output_per_mtok;
	return Math.round(cost * 1e6) / 1e6;
}

export function requestBody(bp: Blueprint, maxTokens?: number): Record<string, unknown> {
	const body: Record<string, unknown> = { ...bp.request };
	if (maxTokens && body.max_tokens === undefined) body.max_tokens = maxTokens;
	return body;
}

export class OpenAICompatibleSubject implements Subject {
	async generate(req: GenerateRequest): Promise<GenerateResult> {
		const ep = req.blueprint.endpoint!;
		const apiKey = ep.api_key_env ? process.env[ep.api_key_env] : undefined;
		if (ep.api_key_env && !apiKey)
			throw new SubjectError(`environment variable ${ep.api_key_env} is not set`);
		return streamChat({
			baseUrl: ep.base_url,
			model: ep.model,
			apiKey,
			headers: ep.headers,
			messages: req.messages,
			body: requestBody(req.blueprint, req.test.max_tokens),
			timeoutMs: (req.blueprint.timeout_s ?? req.test.timeout_s ?? 900) * 1000,
			signal: req.signal,
			pricing: req.blueprint.pricing,
			onProgress: req.onProgress
		});
	}
}

export class LlamaCppSubject implements Subject {
	async generate(req: GenerateRequest): Promise<GenerateResult> {
		if (!req.endpoint) throw new SubjectError('llama-server is not running for this blueprint');
		return streamChat({
			baseUrl: req.endpoint.baseUrl,
			model: req.endpoint.model,
			apiKey: req.endpoint.apiKey,
			messages: req.messages,
			body: requestBody(req.blueprint, req.test.max_tokens),
			timeoutMs: (req.blueprint.timeout_s ?? req.test.timeout_s ?? 1800) * 1000,
			signal: req.signal,
			onProgress: req.onProgress
		});
	}
}
