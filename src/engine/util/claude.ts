import { spawn } from 'node:child_process';
import type { Effort } from '../core/schema.ts';

export type ClaudeRunOptions = {
	bin: string;
	cwd: string;
	prompt: string;
	model: string;
	effort?: Effort;
	/** Built-in tools to expose; [] disables all tools. */
	tools: string[];
	/** Tools that run without a permission prompt (print mode has nobody to ask), e.g. mcp__browser__*. */
	allowedTools?: string[];
	appendSystemPrompt?: string;
	jsonSchema?: unknown;
	mcpConfig?: unknown;
	settings?: unknown;
	permissionMode?: 'acceptEdits' | 'dontAsk' | 'bypassPermissions' | 'manual' | 'auto' | 'plan';
	maxBudgetUsd?: number;
	addDirs?: string[];
	/**
	 * Keeps the person's own setup (CLAUDE.md, hooks, skills, plugins, MCP servers)
	 * out of the run, so it measures the task and not their config.
	 * - safe:       --safe-mode; strongest, but also drops --mcp-config servers
	 * - restricted: --restricted; ignores user/project/local settings but honours
	 *               --settings and --mcp-config (interactive judge, agentic subjects)
	 */
	isolation?: 'safe' | 'restricted';
	timeoutMs: number;
	signal?: AbortSignal;
};

export type ClaudeJson = {
	type?: string;
	subtype?: string;
	is_error?: boolean;
	result?: string;
	structured_output?: unknown;
	duration_ms?: number;
	ttft_ms?: number;
	num_turns?: number;
	total_cost_usd?: number;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
		output_tokens_details?: { thinking_tokens?: number };
	};
	api_error_status?: number | null;
	terminal_reason?: string;
	permission_denials?: unknown[];
	modelUsage?: Record<string, unknown>;
};

export type ClaudeRunResult = {
	exitCode: number | null;
	json: ClaudeJson | null;
	stdout: string;
	stderr: string;
	durationMs: number;
	timedOut: boolean;
};

export function claudeArgs(o: ClaudeRunOptions): string[] {
	const args = ['-p', '--output-format', 'json', '--no-session-persistence', '--strict-mcp-config'];
	args.push(o.isolation === 'restricted' ? '--restricted' : '--safe-mode');
	args.push('--model', o.model);
	if (o.effort) args.push('--effort', o.effort);
	args.push('--tools', o.tools.join(','));
	if (o.allowedTools?.length) args.push('--allowedTools', o.allowedTools.join(','));
	if (o.appendSystemPrompt) args.push('--append-system-prompt', o.appendSystemPrompt);
	if (o.jsonSchema) args.push('--json-schema', JSON.stringify(o.jsonSchema));
	if (o.mcpConfig) args.push('--mcp-config', JSON.stringify(o.mcpConfig));
	if (o.settings) args.push('--settings', JSON.stringify(o.settings));
	if (o.permissionMode) args.push('--permission-mode', o.permissionMode);
	if (o.maxBudgetUsd) args.push('--max-budget-usd', String(o.maxBudgetUsd));
	for (const d of o.addDirs ?? []) args.push('--add-dir', d);
	return args;
}

/** Runs `claude -p` with the prompt on stdin and parses its single JSON result. */
export function runClaude(o: ClaudeRunOptions): Promise<ClaudeRunResult> {
	const started = performance.now();
	const env = { ...process.env };
	// A nested session must not think it runs inside the caller's Claude Code session.
	delete env.CLAUDECODE;
	delete env.CLAUDE_CODE_ENTRYPOINT;
	return new Promise((resolve, reject) => {
		const child = spawn(o.bin, claudeArgs(o), { cwd: o.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		const kill = () => {
			if (child.exitCode === null) child.kill('SIGTERM');
			setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 5000).unref();
		};
		const timer = setTimeout(() => {
			timedOut = true;
			kill();
		}, o.timeoutMs);
		o.signal?.addEventListener('abort', kill, { once: true });
		child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
		child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
		child.on('error', (e) => {
			clearTimeout(timer);
			reject(new Error(`cannot start ${o.bin}: ${e.message}`));
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({
				exitCode: code,
				json: parseClaudeJson(stdout),
				stdout,
				stderr,
				durationMs: Math.round(performance.now() - started),
				timedOut
			});
		});
		child.stdin.on('error', () => undefined);
		child.stdin.end(o.prompt);
	});
}

export function parseClaudeJson(stdout: string): ClaudeJson | null {
	const trimmed = stdout.trim();
	if (!trimmed) return null;
	try {
		return JSON.parse(trimmed) as ClaudeJson;
	} catch {
		const lines = trimmed.split('\n').reverse();
		for (const line of lines) {
			try {
				const parsed = JSON.parse(line) as ClaudeJson;
				if (parsed.type === 'result') return parsed;
			} catch {
				/* keep looking */
			}
		}
		return null;
	}
}

/** Heuristic: is this failure worth a delayed retry (rate or usage limit, overload)? */
export function isRetryableClaudeFailure(r: ClaudeRunResult): boolean {
	const status = r.json?.api_error_status ?? 0;
	if (status === 429 || status === 529 || (status >= 500 && status < 600)) return true;
	const text = `${r.json?.result ?? ''} ${r.stderr}`.toLowerCase();
	return /rate.?limit|overloaded|usage limit|too many requests|try again/.test(text);
}
