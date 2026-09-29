import type { BenchTest, Blueprint, Metrics } from '../core/schema.ts';
import type { ChatMessage } from '../artifacts/prompt.ts';

export type GenerateRequest = {
	blueprint: Blueprint;
	test: BenchTest;
	rep: number;
	messages: ChatMessage[];
	/** Directory an agentic subject may write into (becomes the artifacts dir). */
	workDir: string;
	signal: AbortSignal;
	/** Set by the orchestrator for llama-cpp blueprints once the router is up. */
	endpoint?: { baseUrl: string; model: string; apiKey?: string };
	onProgress?: (p: { phase: 'reasoning' | 'content'; chars: number }) => void;
};

export type GenerateResult = {
	content: string;
	reasoning?: string;
	raw: unknown;
	metrics: Metrics;
	/** Agentic subjects: files were written to workDir directly. */
	wroteFiles?: boolean;
};

export interface Subject {
	generate(req: GenerateRequest): Promise<GenerateResult>;
}

export class SubjectError extends Error {
	readonly raw?: unknown;
	constructor(message: string, raw?: unknown) {
		super(message);
		this.name = 'SubjectError';
		this.raw = raw;
	}
}
