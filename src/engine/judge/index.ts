import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import type {
	Attempt,
	BenchTest,
	ChecksFile,
	Effort,
	JudgeIdentity,
	JudgeMode,
	Judgement,
	Verdict as VerdictType
} from '../core/schema.ts';
import { Verdict } from '../core/schema.ts';
import type { ResolvedSettings } from '../core/settings.ts';
import type { Workspace } from '../core/workspace.ts';
import { hashOf } from '../core/hash.ts';
import { scoreVerdict } from '../core/scoring.ts';
import { isRetryableClaudeFailure, runClaude, type ClaudeRunResult } from '../util/claude.ts';
import { nowIso, sleep } from '../util/time.ts';
import { mimeFor } from '../checks/browser.ts';
import { CHARTER, CHARTER_VERSION, judgePrompt, verdictSchema } from './charter.ts';
import { buildJudgeWorkspace } from './workspace.ts';
import { createHash } from 'node:crypto';

export type JudgeConfig = {
	kind: 'claude' | 'dry-run';
	model: string;
	effort?: Effort;
	mode_override?: JudgeMode;
};

export function judgeIdentity(cfg: JudgeConfig, test: BenchTest): JudgeIdentity {
	return {
		kind: cfg.kind,
		model: cfg.kind === 'dry-run' ? 'dry-run' : cfg.model,
		effort: cfg.kind === 'dry-run' ? undefined : cfg.effort,
		mode: cfg.mode_override ?? test.judge.mode,
		charter_version: CHARTER_VERSION
	};
}

export function judgeFingerprint(identity: JudgeIdentity, rubricHash: string): string {
	return hashOf({ ...identity, rubric_hash: rubricHash }, 10);
}

export function judgeLabel(identity: JudgeIdentity): string {
	if (identity.kind === 'dry-run') return 'dry-run';
	return `${identity.model}${identity.effort ? `@${identity.effort}` : ''}·${identity.mode}`;
}

/** Serves the submission read-only on 127.0.0.1 for the interactive judge's browser. */
function serveDir(dir: string): Promise<{ server: Server; url: string }> {
	return new Promise((resolve, reject) => {
		const server = createServer(async (req, res) => {
			const path = normalize(
				decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
			).replace(/^\/+/, '');
			if (path.startsWith('..')) {
				res.writeHead(403).end();
				return;
			}
			try {
				const body = await readFile(join(dir, path || 'index.html'));
				res
					.writeHead(200, {
						'content-type': mimeFor(path || 'index.html'),
						'cache-control': 'no-store'
					})
					.end(body);
			} catch {
				res.writeHead(404).end('not found');
			}
		});
		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (!addr || typeof addr === 'string') return reject(new Error('no port'));
			resolve({ server, url: `http://127.0.0.1:${addr.port}` });
		});
	});
}

function playwrightMcpConfig(origin: string, outDir: string) {
	const require = createRequire(import.meta.url);
	const cli = join(require.resolve('@playwright/mcp/package.json'), '..', 'cli.js');
	return {
		mcpServers: {
			browser: {
				command: process.execPath,
				args: [
					cli,
					'--headless',
					'--isolated',
					'--executable-path',
					chromium.executablePath(),
					'--allowed-origins',
					origin,
					'--viewport-size',
					'1280,800',
					'--output-dir',
					outDir
				]
			}
		}
	};
}

const SANDBOXED_BASH = {
	sandbox: {
		enabled: true,
		autoAllowBashIfSandboxed: true,
		allowUnsandboxedCommands: false,
		network: { allowedDomains: [] }
	}
};

export type JudgeInput = {
	ws: Workspace;
	settings: ResolvedSettings;
	attempt: Attempt;
	attemptDir: string;
	test: BenchTest;
	rubricHash: string;
	checks: ChecksFile | null;
	config: JudgeConfig;
	signal: AbortSignal;
	log?: (line: string) => void;
};

export async function judgeAttempt(input: JudgeInput): Promise<Judgement> {
	const identity = judgeIdentity(input.config, input.test);
	const fingerprint = judgeFingerprint(identity, input.rubricHash);
	const started = performance.now();
	const base = {
		fingerprint,
		judge: identity,
		rubric_hash: input.rubricHash,
		criteria: input.test.judge.criteria,
		created_at: nowIso()
	};
	if (identity.kind === 'dry-run') {
		const verdict = dryRunVerdict(input.test, input.attempt, input.checks);
		return {
			...base,
			duration_ms: Math.round(performance.now() - started),
			verdict,
			...scoreVerdict(input.test.judge.criteria, verdict)
		};
	}

	const jw = await buildJudgeWorkspace({
		ws: input.ws,
		attempt: input.attempt,
		attemptDir: input.attemptDir,
		test: input.test,
		checks: input.checks
	});
	let served: { server: Server; url: string } | null = null;
	try {
		const interactive = identity.mode === 'interactive';
		const hasHtml = input.attempt.artifacts.some((a) => a.kind === 'html' || a.kind === 'svg');
		const hasProgram = input.attempt.artifacts.some((a) => a.kind === 'program');
		const entry = input.attempt.artifacts
			.find((a) => a.kind === 'html')
			?.path.replace(/^artifacts\//, '');
		if (interactive && hasHtml) served = await serveDir(join(jw.dir, 'submission'));
		const tools = ['Read', 'Glob', 'Grep', ...(interactive && hasProgram ? ['Bash'] : [])];
		const prompt = judgePrompt({
			criteria: input.test.judge.criteria,
			interactive: interactive
				? { url: served && entry ? `${served.url}/${entry}` : undefined, programs: hasProgram }
				: null,
			hasReasoning: jw.hasReasoning
		});
		const run = () =>
			runClaude({
				bin: input.settings.judge.claude_bin,
				cwd: jw.dir,
				prompt,
				model: identity.model,
				effort: identity.effort,
				tools,
				appendSystemPrompt: CHARTER,
				jsonSchema: verdictSchema(input.test.judge.criteria),
				isolation: interactive ? 'restricted' : 'safe',
				mcpConfig: served ? playwrightMcpConfig(served.url, join(jw.dir, '.browser')) : undefined,
				allowedTools: served ? ['mcp__browser__*'] : undefined,
				settings: tools.includes('Bash') ? SANDBOXED_BASH : undefined,
				maxBudgetUsd: input.settings.judge.max_budget_usd,
				timeoutMs: input.settings.judge.timeout_s * 1000,
				signal: input.signal
			});

		let r: ClaudeRunResult | null = null;
		const backoff = [30_000, 120_000, 300_000];
		for (let attempt = 0; ; attempt++) {
			r = await run();
			if (r.json && !r.json.is_error && r.json.structured_output) break;
			if (attempt >= backoff.length || !isRetryableClaudeFailure(r)) break;
			input.log?.(`judge: retryable failure, waiting ${backoff[attempt] / 1000}s`);
			await sleep(backoff[attempt], input.signal);
		}
		const j = r!.json;
		const common = {
			...base,
			duration_ms: Math.round(performance.now() - started),
			cost_usd: j?.total_cost_usd,
			usage: j?.usage as Record<string, unknown> | undefined,
			num_turns: j?.num_turns
		};
		if (r!.timedOut)
			return { ...common, error: `judge timed out after ${input.settings.judge.timeout_s}s` };
		if (!j)
			return {
				...common,
				error: `claude -p returned no JSON (exit ${r!.exitCode}): ${r!.stderr.slice(0, 600)}`
			};
		if (j.is_error || !j.structured_output)
			return {
				...common,
				error: `judge failed: ${(j.result ?? j.subtype ?? 'no structured output').slice(0, 600)}`
			};
		const parsed = Verdict.safeParse(j.structured_output);
		if (!parsed.success)
			return {
				...common,
				error: `verdict does not match the schema: ${parsed.error.message.slice(0, 600)}`
			};
		return {
			...common,
			verdict: parsed.data,
			...scoreVerdict(input.test.judge.criteria, parsed.data)
		};
	} finally {
		served?.server.close();
		await jw.cleanup();
	}
}

/** Deterministic stand-in judge for tests and demos: scores follow the check status. */
export function dryRunVerdict(
	test: BenchTest,
	attempt: Attempt,
	checks: ChecksFile | null
): VerdictType {
	const base =
		{ ok: 8, warnings: 6.5, broken: 3.5, failed: 0 }[
			checks?.status ?? attempt.status ?? 'failed'
		] ?? 5;
	const criteria = test.judge.criteria.map((c) => {
		const h = parseInt(
			createHash('sha256')
				.update(`${attempt.blueprint_id}:${attempt.test_id}:${attempt.rep}:${c.id}`)
				.digest('hex')
				.slice(0, 6),
			16
		);
		const jitter = ((h % 31) - 15) / 10;
		const score = Math.max(0, Math.min(10, Math.round((base + jitter) * 2) / 2));
		return {
			id: c.id,
			score,
			rationale: `Dry-run judge: derived from check status "${checks?.status ?? 'none'}".`,
			evidence: checks ? [`CHECKS.md: ${checks.status}`] : []
		};
	});
	return {
		criteria,
		summary:
			'Dry-run verdict. No model judged this attempt; scores follow the automated checks with deterministic jitter.',
		strengths: base >= 6 ? ['Passes the automated checks'] : [],
		weaknesses: base < 6 ? ['Automated checks report problems'] : [],
		confidence: 0.2,
		flags: {
			prompt_injection_suspected: false,
			output_incomplete: (checks?.status ?? 'failed') === 'failed'
		}
	};
}
