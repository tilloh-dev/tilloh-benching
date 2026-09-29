import { chromium } from 'playwright';
import { parse } from '../args.ts';
import { c, levelIcon } from '../format.ts';
import { Engine } from '../../engine/run/engine.ts';
import { exists } from '../../engine/util/fs.ts';
import { execCapture, which } from '../../engine/util/exec.ts';
import { findLlamaBinary, modeFor } from '../../engine/llama/manager.ts';
import { hostInfo } from '../../engine/run/host.ts';
import { runClaude } from '../../engine/util/claude.ts';
import { tmpdir } from 'node:os';

const HELP = `benchy doctor — check this host

      --probe     also make one tiny claude -p call (haiku) to prove login and isolation work`;

type Row = { level: 'ok' | 'warn' | 'error'; area: string; message: string };

export default async function doctor(args: string[]): Promise<number> {
	const p = parse(args, { probe: { type: 'boolean' } }, HELP);
	if (!p) return 0;
	const rows: Row[] = [];
	const add = (level: Row['level'], area: string, message: string) =>
		rows.push({ level, area, message });
	const engine = await Engine.open(p.values.root);
	const s = engine.settings;

	const major = Number(process.versions.node.split('.')[0]);
	add(
		major >= 24 ? 'ok' : 'error',
		'node',
		`v${process.versions.node}${major < 24 ? ' — BenchyOS needs Node 24+' : ''}`
	);
	const host = await hostInfo(s.host.name);
	add(
		'ok',
		'host',
		`${host.name} · ${host.platform} ${host.release}${host.wsl ? ' (WSL)' : ''} · ${host.cpus}× ${host.cpu} · ${host.mem_gb} GB`
	);
	if (host.gpus.length) for (const g of host.gpus) add('ok', 'gpu', g);
	else add('warn', 'gpu', 'no GPU detected (nvidia-smi / vulkaninfo / lspci)');

	add(
		(await exists(chromium.executablePath())) ? 'ok' : 'error',
		'chromium',
		(await exists(chromium.executablePath()))
			? chromium.executablePath()
			: 'missing — pnpm exec playwright install chromium'
	);
	const bwrap = await which(s.sandbox.bwrap);
	if (bwrap) {
		const r = await execCapture(bwrap, [
			'--unshare-all',
			'--ro-bind',
			'/usr',
			'/usr',
			'--symlink',
			'usr/bin',
			'/bin',
			'--symlink',
			'usr/lib',
			'/lib',
			'--symlink',
			'usr/lib64',
			'/lib64',
			'--',
			'/bin/true'
		]);
		add(
			r.code === 0 ? 'ok' : 'error',
			'sandbox',
			r.code === 0
				? `${bwrap} works`
				: `bwrap cannot create namespaces: ${r.stderr.trim().slice(0, 200)}`
		);
	} else
		add(
			'warn',
			'sandbox',
			'bubblewrap missing — program.run checks will be skipped (sudo apt install bubblewrap)'
		);
	add(
		(await which('openscad')) ? 'ok' : 'warn',
		'openscad',
		(await which('openscad')) ? 'installed' : 'missing — .scad models are skipped (optional)'
	);

	const claudeV = await execCapture(s.judge.claude_bin, ['--version'], { timeoutMs: 15_000 });
	add(
		claudeV.code === 0 ? 'ok' : 'error',
		'claude',
		claudeV.code === 0
			? `${claudeV.stdout.trim()} · judge ${s.judge.model} @ ${s.judge.effort}`
			: `${s.judge.claude_bin} not found`
	);
	if (p.values.probe && claudeV.code === 0) {
		const r = await runClaude({
			bin: s.judge.claude_bin,
			cwd: tmpdir(),
			prompt: 'Reply with the single word: ready',
			model: 'haiku',
			tools: [],
			timeoutMs: 120_000
		});
		const ok = !!r.json && !r.json.is_error && /ready/i.test(r.json.result ?? '');
		add(
			ok ? 'ok' : 'error',
			'claude -p',
			ok
				? `probe answered in ${r.durationMs} ms`
				: `probe failed: ${r.json?.result ?? r.stderr.slice(0, 200)}`
		);
	}

	const bin = await findLlamaBinary(s);
	if (bin) {
		const mode = modeFor(bin, s.llama.mode);
		add('ok', 'llama-server', `${bin} (${mode})`);
		add(
			'ok',
			'llama build',
			(await engine.llama.version(bin).catch((e) => (e as Error).message)) ?? 'unknown'
		);
		const conflicts = await engine.llama.conflicts(mode);
		if (conflicts.length) for (const x of conflicts) add('warn', 'gpu busy', x);
		else add('ok', 'gpu busy', `no other llama-server; BenchyOS will use port ${s.llama.port}`);
		if (s.llama.models_dir)
			add((await exists(s.llama.models_dir)) ? 'ok' : 'warn', 'models dir', s.llama.models_dir);
	} else
		add(
			'warn',
			'llama-server',
			'not found — only needed for llama-cpp blueprints (set llama.binary in benchy.local.yaml)'
		);

	const lib = await engine.library();
	const envs = new Set(
		[...lib.blueprints.values()].map((b) => b.endpoint?.api_key_env).filter((x): x is string => !!x)
	);
	for (const env of envs)
		add(
			process.env[env] ? 'ok' : 'warn',
			'api key',
			`${env} ${process.env[env] ? 'is set' : 'is not set (.env)'}`
		);
	add(
		lib.issues.length ? 'warn' : 'ok',
		'library',
		`${lib.blueprints.size} blueprints · ${lib.tests.size} tests · ${lib.suites.size} suites${lib.issues.length ? ` · ${lib.issues.length} issue(s), see benchy list` : ''}`
	);

	for (const r of rows)
		console.log(`  ${levelIcon(r.level)} ${c.bold(r.area.padEnd(14))} ${r.message}`);
	await engine.close();
	return rows.some((r) => r.level === 'error') ? 1 : 0;
}
