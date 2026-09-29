import { z } from 'zod';

/**
 * Domain schemas shared by engine, server, CLI and UI.
 *
 * Authored files (blueprints, tests, suites) are strict so a typo in YAML is
 * reported instead of silently ignored. Persisted run data is validated
 * leniently on read so older result files keep loading after schema growth.
 */

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
export const Id = z.string().regex(ID_PATTERN, 'ids use letters, digits, ".", "_" and "-"');

export const Scalar = z.union([z.string(), z.number(), z.boolean()]);
export type Scalar = z.infer<typeof Scalar>;

export const JsonObject = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------- blueprints

export const BLUEPRINT_KINDS = [
	'llama-cpp',
	'openai-compatible',
	'claude-code',
	'dry-run'
] as const;
export const BlueprintKind = z.enum(BLUEPRINT_KINDS);
export type BlueprintKind = z.infer<typeof BlueprintKind>;

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export const Effort = z.enum(EFFORT_LEVELS);
export type Effort = z.infer<typeof Effort>;

export const Endpoint = z.strictObject({
	base_url: z.string().url(),
	model: z.string().min(1),
	api_key_env: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional()
});

export const Pricing = z.strictObject({
	input_per_mtok: z.number().nonnegative(),
	output_per_mtok: z.number().nonnegative()
});

export const ClaudeSubject = z.strictObject({
	model: z.string().min(1),
	effort: Effort.optional(),
	mode: z.enum(['chat', 'agentic']).optional(),
	max_turns: z.number().int().positive().optional(),
	tools: z.array(z.string()).optional()
});

export const DryRunSubject = z.strictObject({
	profile: z.enum(['mixed', 'good', 'broken']).optional(),
	delay_ms: z.number().int().nonnegative().optional()
});

export const Origin = z.strictObject({
	source: z.string(),
	reconstructed: z.boolean().optional(),
	note: z.string().optional()
});

/** A blueprint as written on disk; `extends` may supply any field. */
export const BlueprintFile = z.strictObject({
	id: Id,
	label: z.string().optional(),
	description: z.string().optional(),
	kind: BlueprintKind.optional(),
	extends: Id.optional(),
	tags: z.array(z.string()).optional(),
	system_prompt: z.string().optional(),
	/** Merged into the chat-completions request body (sampling, reasoning, template kwargs). */
	request: JsonObject.optional(),
	/** llama-cpp only: llama-server flags without the leading "--", as in a router preset. */
	server: z.record(z.string(), Scalar).optional(),
	endpoint: Endpoint.optional(),
	pricing: Pricing.optional(),
	claude: ClaudeSubject.optional(),
	dry_run: DryRunSubject.optional(),
	timeout_s: z.number().positive().optional(),
	concurrency: z.number().int().positive().optional(),
	origin: Origin.optional()
});
export type BlueprintFile = z.infer<typeof BlueprintFile>;

/** A blueprint after `extends` resolution: kind is known and kind-specific parts exist. */
export const Blueprint = BlueprintFile.extend({
	kind: BlueprintKind,
	tags: z.array(z.string()),
	request: JsonObject
}).superRefine((bp, ctx) => {
	const need = (cond: boolean, message: string) => {
		if (!cond) ctx.addIssue({ code: 'custom', message });
	};
	if (bp.kind === 'llama-cpp') need(!!bp.server?.model, 'llama-cpp blueprints need server.model');
	if (bp.kind === 'openai-compatible')
		need(!!bp.endpoint, 'openai-compatible blueprints need endpoint');
	if (bp.kind === 'claude-code') need(!!bp.claude, 'claude-code blueprints need claude.model');
});
export type Blueprint = z.infer<typeof Blueprint>;

/** Fields that do not change what is being measured and therefore not the version hash. */
export const BLUEPRINT_COSMETIC_KEYS = [
	'id',
	'label',
	'description',
	'tags',
	'extends',
	'origin'
] as const;

// ---------------------------------------------------------------- tests

export const OutputFile = z.strictObject({
	path: z.string().min(1),
	kind: z.string().optional(),
	language: z.string().optional(),
	required: z.boolean().optional(),
	description: z.string().optional()
});
export type OutputFile = z.infer<typeof OutputFile>;

export const OUTPUT_MODES = ['single', 'files', 'text', 'workspace'] as const;
export const Output = z.strictObject({
	/**
	 * single    – one file; the whole response or its best code block
	 * files     – several files, emitted as fenced blocks tagged with a path
	 * text      – the response itself is the artifact (markdown / prose)
	 * workspace – agentic subjects write files; everything they leave is collected
	 */
	mode: z.enum(OUTPUT_MODES).optional(),
	files: z.array(OutputFile).optional(),
	/** Replaces Benchy's generated output-format instruction when set. */
	instructions: z.string().optional()
});
export type Output = z.infer<typeof Output>;

/** `html.parse` or `{ html.render: { wait_ms: 2000 } }` */
export const CheckEntry = z.union([
	z.string().min(1),
	z.record(z.string(), JsonObject.nullable()).refine((r) => Object.keys(r).length === 1, {
		message: 'a check entry maps exactly one check id to its options'
	})
]);
export type CheckEntry = z.infer<typeof CheckEntry>;

export const Criterion = z.strictObject({
	id: Id,
	title: z.string().min(1),
	description: z.string().optional(),
	weight: z.number().positive().optional(),
	/** A required criterion scored below the gate threshold fails the attempt's gate. */
	required: z.boolean().optional()
});
export type Criterion = z.infer<typeof Criterion>;

export const JUDGE_MODES = ['static', 'interactive'] as const;
export const JudgeMode = z.enum(JUDGE_MODES);
export type JudgeMode = z.infer<typeof JudgeMode>;

export const TestJudge = z.strictObject({
	mode: JudgeMode.optional(),
	guidance: z.string().optional(),
	include_reasoning: z.boolean().optional(),
	criteria: z.array(Criterion).optional()
});

export const TestInput = z.strictObject({
	path: z.string().min(1),
	/** inline: appended to the prompt as a fenced block. */
	as: z.enum(['inline']).optional(),
	label: z.string().optional()
});

export const TestFile = z.strictObject({
	id: Id,
	title: z.string().min(1),
	description: z.string().optional(),
	tags: z.array(z.string()).optional(),
	prompt_file: z.string().optional(),
	system: z.string().optional(),
	inputs: z.array(TestInput).optional(),
	output: Output.optional(),
	checks: z.array(CheckEntry).optional(),
	judge: TestJudge.optional(),
	timeout_s: z.number().positive().optional(),
	max_tokens: z.number().int().positive().optional()
});
export type TestFile = z.infer<typeof TestFile>;

/** A loaded test: prompt text resolved, defaults applied. */
export type BenchTest = Omit<TestFile, 'output' | 'checks' | 'judge' | 'tags'> & {
	tags: string[];
	prompt: string;
	inputs_resolved: { path: string; label: string; content: string }[];
	output: { mode: (typeof OUTPUT_MODES)[number]; files: OutputFile[]; instructions?: string };
	checks: CheckSpec[];
	judge: {
		mode: JudgeMode;
		guidance?: string;
		include_reasoning: boolean;
		criteria: ResolvedCriterion[];
	};
};

export type ResolvedCriterion = {
	id: string;
	title: string;
	description?: string;
	weight: number;
	required: boolean;
};

export type CheckSpec = { id: string; options: Record<string, unknown> };

// ---------------------------------------------------------------- suites

export const SuiteFile = z.strictObject({
	id: Id,
	title: z.string().min(1),
	description: z.string().optional(),
	tests: z.array(Id).min(1),
	repetitions: z.number().int().positive().optional(),
	blueprints: z.array(Id).optional()
});
export type Suite = z.infer<typeof SuiteFile>;

// ---------------------------------------------------------------- settings

export const Settings = z.strictObject({
	host: z.strictObject({ name: z.string().optional() }).optional(),
	server: z
		.strictObject({ port: z.number().int().optional(), bind: z.string().optional() })
		.optional(),
	concurrency: z
		.strictObject({
			generation: z.number().int().positive().optional(),
			judge: z.number().int().positive().optional(),
			checks: z.number().int().positive().optional()
		})
		.optional(),
	judge: z
		.strictObject({
			model: z.string().optional(),
			effort: Effort.optional(),
			claude_bin: z.string().optional(),
			timeout_s: z.number().positive().optional(),
			max_budget_usd: z.number().positive().optional(),
			/** Force every test into one mode (e.g. "static" to save limits). */
			mode_override: JudgeMode.optional()
		})
		.optional(),
	llama: z
		.strictObject({
			binary: z.string().optional(),
			port: z.number().int().optional(),
			/** Address llama-server binds to. wsl-exe needs 0.0.0.0. */
			bind: z.string().optional(),
			/** Address Benchy connects to. wsl-exe defaults to the WSL gateway. */
			connect_host: z.string().optional(),
			models_dir: z.string().optional(),
			startup_timeout_s: z.number().positive().optional(),
			load_timeout_s: z.number().positive().optional(),
			extra_args: z.array(z.string()).optional(),
			mode: z.enum(['auto', 'linux', 'wsl-exe']).optional()
		})
		.optional(),
	sandbox: z
		.strictObject({
			bwrap: z.string().optional(),
			memory_mb: z.number().int().positive().optional(),
			timeout_s: z.number().positive().optional()
		})
		.optional()
});
export type SettingsFile = z.infer<typeof Settings>;

// ---------------------------------------------------------------- runs & attempts

export const CHECK_STATUSES = ['ok', 'warnings', 'broken', 'failed'] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const RUN_STATUSES = [
	'queued',
	'running',
	'done',
	'failed',
	'cancelled',
	'interrupted'
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const ATTEMPT_STAGES = [
	'pending',
	'generating',
	'generated',
	'checking',
	'checked',
	'judging',
	'judged'
] as const;
export type AttemptStage = (typeof ATTEMPT_STAGES)[number];

export const JUDGE_KINDS = ['claude', 'dry-run', 'none'] as const;
export type JudgeKind = (typeof JUDGE_KINDS)[number];

export const RunSpec = z.strictObject({
	label: z.string().optional(),
	note: z.string().optional(),
	suite: Id.optional(),
	blueprints: z.array(Id).min(1),
	tests: z.array(Id).min(1),
	repetitions: z.number().int().positive().max(50).optional(),
	judge: z
		.strictObject({
			kind: z.enum(JUDGE_KINDS).optional(),
			model: z.string().optional(),
			effort: Effort.optional(),
			mode_override: JudgeMode.optional()
		})
		.optional()
});
export type RunSpec = z.infer<typeof RunSpec>;

export type Metrics = {
	latency_ms?: number;
	ttft_ms?: number;
	load_ms?: number;
	prompt_tokens?: number;
	completion_tokens?: number;
	reasoning_tokens?: number;
	total_tokens?: number;
	prompt_tps?: number;
	gen_tps?: number;
	draft_n?: number;
	draft_accepted?: number;
	cost_usd?: number;
	num_turns?: number;
	finish_reason?: string;
};

export type ArtifactRef = {
	/** Relative to the attempt directory, e.g. "artifacts/index.html". */
	path: string;
	kind: string;
	bytes: number;
	sha256: string;
	declared: boolean;
	source: 'response' | 'fence' | 'file-block' | 'workspace' | 'legacy';
};

export type EvidenceRef = {
	path: string;
	kind: 'image' | 'log' | 'text' | 'json';
	label: string;
	check?: string;
};

export type CheckIssue = {
	check: string;
	severity: 'info' | 'warning' | 'error';
	kind: string;
	message: string;
	file?: string;
	line?: number;
	col?: number;
};

export type CheckResult = {
	id: string;
	status: 'pass' | 'warn' | 'fail' | 'skipped' | 'error';
	duration_ms: number;
	issues: CheckIssue[];
	evidence: EvidenceRef[];
	data?: Record<string, unknown>;
};

export type ChecksFile = {
	status: CheckStatus;
	checks_hash: string;
	finished_at: string;
	results: CheckResult[];
};

export type JudgeSummary = {
	fingerprint: string;
	score: number;
	gate_failed: boolean;
	judged_at: string;
	judge: string;
};

export type HumanRating = {
	rated_at: string;
	rater?: string;
	score?: number;
	criteria?: Record<string, number>;
	notes?: string;
};

export type Attempt = {
	id: string;
	run_id: string;
	blueprint_id: string;
	blueprint_hash: string;
	test_id: string;
	task_hash: string;
	rep: number;
	stage: AttemptStage;
	status: CheckStatus | null;
	error?: { stage: AttemptStage; message: string };
	created_at: string;
	started_at?: string;
	generated_at?: string;
	finished_at?: string;
	metrics: Metrics;
	artifacts: ArtifactRef[];
	extraction?: { method: string; notes: string[] };
	evidence: EvidenceRef[];
	checks?: { status: CheckStatus; failed: string[]; warned: string[] };
	judgement?: JudgeSummary;
	judge_error?: string;
	human?: { score: number | null; rated_at: string };
};

export type BlueprintSnapshot = { hash: string; blueprint: Blueprint };
export type TestSnapshot = {
	task_hash: string;
	rubric_hash: string;
	checks_hash: string;
	test: BenchTest;
};

export type HostInfo = {
	name: string;
	platform: string;
	release: string;
	arch: string;
	node: string;
	cpu: string;
	cpus: number;
	mem_gb: number;
	wsl: boolean;
	gpus: string[];
};

export type LlamaRunInfo = {
	mode: 'linux' | 'wsl-exe';
	binary: string;
	build?: string;
	port: number;
	connect_url: string;
	preset_file: string;
	/** Preset section per blueprint id, exactly as written to the INI. */
	sections: Record<string, Record<string, string>>;
	props: Record<string, unknown>;
	models?: unknown;
	gpu?: string[];
	started_at?: string;
	stopped_at?: string;
};

export type RunRecord = {
	id: string;
	created_at: string;
	started_at?: string;
	finished_at?: string;
	status: RunStatus;
	spec: RunSpec & { repetitions: number };
	host: HostInfo;
	judge: { kind: JudgeKind; model?: string; effort?: Effort; mode_override?: JudgeMode };
	blueprints: Record<string, BlueprintSnapshot>;
	tests: Record<string, TestSnapshot>;
	llama?: LlamaRunInfo;
	legacy?: { source: string; imported_at: string };
	error?: string;
	counts?: { total: number; done: number; failed: number };
};

// ---------------------------------------------------------------- judge verdicts

export const VerdictCriterion = z.object({
	id: z.string(),
	score: z.number().min(0).max(10),
	rationale: z.string(),
	evidence: z.array(z.string())
});

export const Verdict = z.object({
	criteria: z.array(VerdictCriterion),
	summary: z.string(),
	strengths: z.array(z.string()),
	weaknesses: z.array(z.string()),
	confidence: z.number().min(0).max(1),
	flags: z.object({
		prompt_injection_suspected: z.boolean(),
		output_incomplete: z.boolean(),
		notes: z.string().optional()
	})
});
export type Verdict = z.infer<typeof Verdict>;

export type JudgeIdentity = {
	kind: 'claude' | 'dry-run';
	model: string;
	effort?: Effort;
	mode: JudgeMode;
	charter_version: string;
};

export type Judgement = {
	fingerprint: string;
	judge: JudgeIdentity;
	rubric_hash: string;
	/** The criteria as scored, so a judgement stays readable after the rubric changes. */
	criteria: ResolvedCriterion[];
	created_at: string;
	duration_ms: number;
	cost_usd?: number;
	usage?: Record<string, unknown>;
	num_turns?: number;
	verdict?: Verdict;
	score?: number;
	gate_failed?: boolean;
	gates_failed?: string[];
	missing_criteria?: string[];
	error?: string;
};

export const CriteriaSuggestion = z.object({
	criteria: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			description: z.string(),
			weight: z.number(),
			required: z.boolean()
		})
	),
	judge_mode: z.enum(JUDGE_MODES),
	guidance: z.string()
});
export type CriteriaSuggestion = z.infer<typeof CriteriaSuggestion>;
