import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { chromium } from 'playwright';
import type { BenchTest, Blueprint, JudgeProfile } from '../core/schema.ts';
import type { ResolvedSettings } from '../core/settings.ts';
import { exists } from '../util/fs.ts';
import { execCapture, which } from '../util/exec.ts';
import { findLlamaBinary, modeFor, type LlamaManager } from '../llama/manager.ts';
import { toPosixPath } from '../llama/platform.ts';
import { PATH_KEYS } from '../llama/preset.ts';

export type PreflightLevel = 'ok' | 'warn' | 'error';
export type PreflightItem = { scope: string; level: PreflightLevel; message: string };
export type PreflightReport = { ok: boolean; items: PreflightItem[] };

const BROWSER_CHECKS = new Set(['html.render', 'svg.render', 'model3d.render']);

async function claudeVersion(bin: string): Promise<string | null> {
	const r = await execCapture(bin, ['--version'], { timeoutMs: 15_000 });
	return r.code === 0 ? r.stdout.trim() : null;
}

async function modelFileExists(path: string, settings: ResolvedSettings): Promise<boolean> {
	let p = path;
	if (!isAbsolute(p) && !/^[A-Za-z]:[\\/]/.test(p) && settings.llama.models_dir) {
		p = join(settings.llama.models_dir.replace(/^~\//, homedir() + '/'), p);
	}
	if (/^[A-Za-z]:[\\/]/.test(p)) p = await toPosixPath(p);
	return exists(p);
}

export async function preflight(o: {
	settings: ResolvedSettings;
	blueprints: Blueprint[];
	tests: BenchTest[];
	judge: JudgeProfile | null;
	llama: LlamaManager;
	llamaBusy: boolean;
}): Promise<PreflightReport> {
	const items: PreflightItem[] = [];
	const add = (scope: string, level: PreflightLevel, message: string) =>
		items.push({ scope, level, message });

	const llamaBps = o.blueprints.filter((b) => b.kind === 'llama-cpp');
	if (llamaBps.length) {
		const binary = await findLlamaBinary(o.settings);
		if (!binary)
			add('llama.cpp', 'error', 'llama-server not found — set llama.binary in benchy.local.yaml');
		else {
			const mode = modeFor(binary, o.settings.llama.mode);
			add('llama.cpp', 'ok', `${binary} (${mode})`);
			if (o.llamaBusy)
				add('llama.cpp', 'warn', 'another BenchyOS run is using llama-server; this run will wait');
			else {
				const conflicts = await o.llama.conflicts(mode);
				for (const c of conflicts) add('llama.cpp', 'error', `GPU busy: ${c}`);
			}
		}
		for (const bp of llamaBps) {
			for (const key of PATH_KEYS) {
				const v = bp.server?.[key];
				if (typeof v !== 'string') continue;
				if (!(await modelFileExists(v, o.settings))) add(bp.id, 'error', `${key} not found: ${v}`);
			}
			if (!items.some((i) => i.scope === bp.id)) add(bp.id, 'ok', `model ${bp.server?.model}`);
		}
	}

	for (const bp of o.blueprints.filter((b) => b.kind === 'openai-compatible')) {
		const env = bp.endpoint?.api_key_env;
		if (env && !process.env[env]) add(bp.id, 'error', `API key variable ${env} is not set (.env)`);
		else add(bp.id, 'ok', `${bp.endpoint?.base_url} · ${bp.endpoint?.model}`);
	}

	const j = o.judge;
	if (!j) add('judge', 'ok', 'no judging in this run');
	else if (j.kind === 'openai-compatible') {
		const env = j.endpoint?.api_key_env;
		if (env && !process.env[env])
			add('judge', 'error', `${j.id}: API key ${env} is not set (Settings → API keys)`);
		else add('judge', 'ok', `${j.label ?? j.id} · ${j.endpoint?.base_url} · ${j.model}`);
	} else add('judge', 'ok', j.label ?? j.id);

	const needsClaude =
		o.blueprints.some((b) => b.kind === 'claude-code') || o.judge?.kind === 'claude';
	if (needsClaude) {
		const v = await claudeVersion(o.settings.judge.claude_bin);
		if (!v) add('claude', 'error', `${o.settings.judge.claude_bin} not found or not working`);
		else add('claude', 'ok', v);
	}
	for (const bp of o.blueprints.filter((b) => b.kind === 'claude-code'))
		add(bp.id, 'ok', `claude -p · ${bp.claude?.model}`);
	for (const bp of o.blueprints.filter((b) => b.kind === 'dry-run'))
		add(bp.id, 'ok', 'canned responses, no network');

	const checkIds = new Set(o.tests.flatMap((t) => t.checks.map((c) => c.id)));
	if ([...checkIds].some((c) => BROWSER_CHECKS.has(c))) {
		if (await exists(chromium.executablePath())) add('checks', 'ok', 'headless Chromium installed');
		else
			add(
				'checks',
				'error',
				'Playwright Chromium missing — run: pnpm exec playwright install chromium'
			);
	}
	if (checkIds.has('program.run')) {
		if (await which(o.settings.sandbox.bwrap)) add('checks', 'ok', 'bubblewrap sandbox available');
		else add('checks', 'error', 'bubblewrap missing — sudo apt install bubblewrap');
	}
	if (
		checkIds.has('model3d.render') &&
		o.tests.some((t) => t.output.files.some((f) => f.path.endsWith('.scad')))
	) {
		if (!(await which('openscad')))
			add(
				'checks',
				'warn',
				'openscad missing — .scad models will be skipped (sudo apt install openscad)'
			);
	}
	return { ok: !items.some((i) => i.level === 'error'), items };
}
