import type { Metrics } from '../core/schema.ts';

/**
 * Generation speed when the server does not report it: output tokens over the
 * time spent generating. Tokens come from usage, or from the text length
 * (about four characters per token) when the provider sends no usage.
 */
export function computeTps(o: {
	tokens?: number;
	chars?: number;
	/** Milliseconds spent generating, i.e. without time to first token. */
	genMs?: number;
}): Pick<Metrics, 'gen_tps' | 'tps_source'> {
	if (!o.genMs || o.genMs < 50) return {};
	const seconds = o.genMs / 1000;
	if (o.tokens)
		return { gen_tps: Math.round((o.tokens / seconds) * 10) / 10, tps_source: 'computed' };
	if (o.chars)
		return { gen_tps: Math.round((o.chars / 4 / seconds) * 10) / 10, tps_source: 'estimated' };
	return {};
}
