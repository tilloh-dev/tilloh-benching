import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runClaude, type ClaudeJson } from '../util/claude.ts';
import { computeTps } from './tps.ts';
import { SubjectError, type GenerateRequest, type GenerateResult, type Subject } from './types.ts';

const AGENTIC_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'];

/** Bash only inside Claude Code's own sandbox; file writes only inside the work dir. */
const AGENTIC_SETTINGS = {
	sandbox: { enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false },
	permissions: {
		allow: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
		deny: ['WebFetch', 'WebSearch']
	}
};

export class ClaudeCodeSubject implements Subject {
	readonly bin: string;

	constructor(bin = 'claude') {
		this.bin = bin;
	}

	async generate(req: GenerateRequest): Promise<GenerateResult> {
		const cfg = req.blueprint.claude!;
		const agentic = cfg.mode === 'agentic' || req.test.output.mode === 'workspace';
		const system = req.messages
			.filter((m) => m.role === 'system')
			.map((m) => m.content)
			.join('\n\n');
		const prompt = req.messages
			.filter((m) => m.role === 'user')
			.map((m) => m.content)
			.join('\n\n');
		// Always an empty scratch dir outside the repository: nothing to peek at, and no
		// CLAUDE.md or .claude/ of this repo for Claude Code to discover by walking up.
		const cwd = await mkdtemp(join(tmpdir(), 'benchy-claude-'));
		try {
			const r = await runClaude({
				bin: this.bin,
				cwd,
				prompt,
				model: cfg.model,
				effort: cfg.effort,
				tools: agentic ? (cfg.tools ?? AGENTIC_TOOLS) : [],
				appendSystemPrompt: system || undefined,
				settings: agentic ? AGENTIC_SETTINGS : undefined,
				isolation: agentic ? 'restricted' : 'safe',
				permissionMode: agentic ? 'acceptEdits' : undefined,
				timeoutMs: (req.blueprint.timeout_s ?? req.test.timeout_s ?? 1800) * 1000,
				signal: req.signal
			});
			if (agentic) await cp(cwd, req.workDir, { recursive: true });
			const j = r.json;
			if (r.timedOut) throw new SubjectError('claude -p timed out', r.stderr);
			if (!j)
				throw new SubjectError(
					`claude -p produced no JSON (exit ${r.exitCode}): ${r.stderr.slice(0, 500)}`
				);
			if (j.is_error)
				throw new SubjectError(`claude -p failed: ${j.result ?? j.subtype ?? 'unknown error'}`, j);
			return {
				content: j.result ?? '',
				raw: { ...j, result: undefined },
				wroteFiles: agentic,
				metrics: {
					latency_ms: j.duration_ms ?? r.durationMs,
					ttft_ms: j.ttft_ms,
					prompt_tokens:
						(j.usage?.input_tokens ?? 0) +
						(j.usage?.cache_read_input_tokens ?? 0) +
						(j.usage?.cache_creation_input_tokens ?? 0),
					completion_tokens: j.usage?.output_tokens,
					reasoning_tokens: j.usage?.output_tokens_details?.thinking_tokens,
					cost_usd: j.total_cost_usd,
					num_turns: j.num_turns,
					...claudeTps(j),
					finish_reason: j.terminal_reason ?? j.subtype
				}
			};
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	}
}

/**
 * claude -p reports no speed. API time excludes tool runs; with a single turn
 * the time to first token is taken off as well. Multi-turn values stay rough.
 */
function claudeTps(j: ClaudeJson) {
	const api = j.duration_api_ms ?? j.duration_ms;
	if (!api) return {};
	const genMs = (j.num_turns ?? 1) <= 1 && j.ttft_ms && api > j.ttft_ms ? api - j.ttft_ms : api;
	return computeTps({ tokens: j.usage?.output_tokens, chars: j.result?.length, genMs });
}
