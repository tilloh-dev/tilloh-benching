import { readFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { Settings, type Effort, type JudgeMode } from './schema.ts';
import { deepMerge } from './canonical.ts';
import type { Workspace } from './workspace.ts';
import { exists } from '../util/fs.ts';

export type ResolvedSettings = {
	host: { name: string };
	server: { port: number; bind: string };
	concurrency: { generation: number; judge: number; checks: number };
	judge: {
		default_profile: string;
		model: string;
		effort: Effort;
		claude_bin: string;
		timeout_s: number;
		max_budget_usd?: number;
		mode_override?: JudgeMode;
	};
	llama: {
		binary?: string;
		port: number;
		bind?: string;
		connect_host?: string;
		models_dir?: string;
		startup_timeout_s: number;
		load_timeout_s: number;
		extra_args: string[];
		mode: 'auto' | 'linux' | 'wsl-exe';
	};
	sandbox: { bwrap: string; memory_mb: number; timeout_s: number };
};

export const DEFAULT_JUDGE_MODEL = 'claude-opus-5-5';
export const DEFAULT_JUDGE_PROFILE = 'opus-xhigh';

export function resolveSettings(raw: unknown): ResolvedSettings {
	const s = Settings.parse(raw ?? {});
	return {
		host: { name: s.host?.name ?? hostname().toLowerCase() },
		server: { port: s.server?.port ?? 8787, bind: s.server?.bind ?? '127.0.0.1' },
		concurrency: {
			generation: s.concurrency?.generation ?? 4,
			judge: s.concurrency?.judge ?? 2,
			checks: s.concurrency?.checks ?? 2
		},
		judge: {
			default_profile: s.judge?.default_profile ?? DEFAULT_JUDGE_PROFILE,
			model: s.judge?.model ?? DEFAULT_JUDGE_MODEL,
			effort: s.judge?.effort ?? 'xhigh',
			claude_bin: s.judge?.claude_bin ?? 'claude',
			timeout_s: s.judge?.timeout_s ?? 1800,
			max_budget_usd: s.judge?.max_budget_usd,
			mode_override: s.judge?.mode_override
		},
		llama: {
			binary: s.llama?.binary,
			port: s.llama?.port ?? 8099,
			bind: s.llama?.bind,
			connect_host: s.llama?.connect_host,
			models_dir: s.llama?.models_dir,
			startup_timeout_s: s.llama?.startup_timeout_s ?? 120,
			load_timeout_s: s.llama?.load_timeout_s ?? 900,
			extra_args: s.llama?.extra_args ?? [],
			mode: s.llama?.mode ?? 'auto'
		},
		sandbox: {
			bwrap: s.sandbox?.bwrap ?? 'bwrap',
			memory_mb: s.sandbox?.memory_mb ?? 1024,
			timeout_s: s.sandbox?.timeout_s ?? 30
		}
	};
}

async function readYamlIfExists(path: string): Promise<unknown> {
	if (!(await exists(path))) return {};
	return parseYaml(await readFile(path, 'utf8')) ?? {};
}

/** Tracked defaults (benchy.config.yaml) overlaid by host-specific values (benchy.local.yaml). */
export async function loadSettings(ws: Workspace): Promise<ResolvedSettings> {
	const base = await readYamlIfExists(ws.configFile);
	const local = await readYamlIfExists(ws.localConfigFile);
	return resolveSettings(deepMerge(base, local));
}

/** Loads `.env` into process.env without overriding variables that are already set. */
export async function loadEnv(ws: Workspace): Promise<void> {
	if (!(await exists(ws.envFile))) return;
	const before = { ...process.env };
	process.loadEnvFile(ws.envFile);
	for (const [key, value] of Object.entries(before)) process.env[key] = value;
}
