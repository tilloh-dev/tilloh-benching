/**
 * Payload shapes shared by the API server, the static export and the UI.
 * Types only — safe to import from the browser bundle.
 */
import type {
	Attempt,
	BenchTest,
	Blueprint,
	BlueprintFile,
	BlueprintSnapshot,
	ChecksFile,
	HostInfo,
	HumanRating,
	JudgeProfile,
	Judgement,
	RunRecord,
	Suite,
	TestFile,
	TestSnapshot
} from './core/schema.ts';
import type { AttemptRow, RunRow } from './core/rows.ts';

export type LibraryIssue = { file: string; message: string };

export type BlueprintEntry = {
	id: string;
	file: BlueprintFile;
	resolved: Blueprint | null;
	hash: string | null;
};

export type TestEntry = {
	id: string;
	file: TestFile;
	prompt: string;
	resolved: BenchTest | null;
	hashes: { task_hash: string; rubric_hash: string; checks_hash: string } | null;
};

export type CheckInfo = { id: string; description: string; kinds: string[] };

export type JudgeEntry = {
	profile: JudgeProfile;
	/** Built in (no YAML yet); saving it writes library/judges/<id>.yaml. */
	builtin: boolean;
	default: boolean;
	/** Whether the API key the profile needs is set; null when it needs none. */
	key_set: boolean | null;
};

export type LibraryPayload = {
	blueprints: BlueprintEntry[];
	tests: TestEntry[];
	suites: Suite[];
	judges: JudgeEntry[];
	issues: LibraryIssue[];
	checks: CheckInfo[];
};

export type LlamaView = {
	mode: string;
	binary: string;
	build?: string;
	section: Record<string, string> | null;
	/** argv the router used to launch this model, from /models. */
	args: string[] | null;
	props: unknown;
	load_ms?: number;
	gpu?: string[];
};

export type AttemptDetail = {
	attempt: Attempt;
	row: AttemptRow;
	run: Pick<RunRecord, 'id' | 'created_at' | 'host' | 'judge' | 'status'> & {
		label: string | null;
		legacy: boolean;
	};
	blueprint: BlueprintSnapshot | null;
	test: TestSnapshot | null;
	llama: LlamaView | null;
	checks: ChecksFile | null;
	judgements: Judgement[];
	human: HumanRating | null;
	/** URLs (relative to the app) for the raw texts. */
	files: { response: string; reasoning: string | null; raw: string | null; base: string };
};

export type EngineStatus = {
	host: string;
	exclusive: boolean;
	llama: { state: string; mode?: string; loaded?: string; url?: string; error?: string };
	active_runs: string[];
	judge_jobs: number;
};

export type StatusPayload = {
	app: { name: 'benchy'; version: string; mode: 'live' | 'static'; exported_at?: string };
	host: HostInfo;
	engine: EngineStatus | null;
	settings: {
		judge: { model: string; effort: string; default_profile: string };
		llama_port: number;
	} | null;
};

export type IndexPayload = {
	status: StatusPayload;
	runs: RunRow[];
	attempts: AttemptRow[];
};

export type RunDetail = { run: RunRecord; attempts: AttemptRow[] };

export type SecretInfo = {
	name: string;
	set: boolean;
	/** Where the current value comes from: the .env file, or the environment BenchyOS started in. */
	source: 'env-file' | 'environment' | null;
	/** Blueprints and judge profiles that read this key. */
	used_by: string[];
};
