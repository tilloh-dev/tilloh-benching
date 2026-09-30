import { parse } from '../args.ts';
import { c, levelIcon, statusColor, table } from '../format.ts';
import { ServerClient } from '../client.ts';
import { Engine } from '../../engine/run/engine.ts';
import type { EngineEvent } from '../../engine/run/events.ts';
import type { RunRecord, RunSpec } from '../../engine/core/schema.ts';
import type { PreflightReport } from '../../engine/run/preflight.ts';
import type { AttemptRow } from '../../engine/core/rows.ts';

const HELP = `benchy run — run blueprints against tests

  -s, --suite <id>          use a suite's tests (and its default blueprints)
  -b, --blueprint <id>      blueprint to run (repeatable)
  -t, --test <id>           test to run (repeatable; overrides the suite's tests)
  -n, --reps <n>            repetitions per blueprint × test (default: suite or 1)
      --judge-profile <id>  judge profile from library/judges (default: opus-xhigh)
      --judge <kind>        dry-run | none — shorthands that skip the profile
      --judge-model <m>     ad-hoc claude judge model instead of a profile
      --judge-effort <e>    low | medium | high | xhigh | max (with --judge-model)
      --judge-mode <m>      force static | interactive for every test
      --label <text>        human-readable run label
      --force               start even if the preflight reports errors
      --detach              with a running server: submit and return immediately
      --local               never hand the run to a running server`;

function printPreflight(p: PreflightReport) {
	for (const i of p.items)
		console.log(`  ${levelIcon(i.level)} ${c.bold(i.scope.padEnd(28))} ${i.message}`);
}

function describe(a: AttemptRow): string {
	const score = a.score !== null ? c.bold(a.score.toFixed(1)) : c.gray('—');
	const time = a.latency_ms !== null ? `${(a.latency_ms / 1000).toFixed(1)}s` : '';
	const tps = a.gen_tps ? `${a.gen_tps} t/s` : '';
	return `${a.blueprint_id} × ${a.test_id} #${a.rep}  ${statusColor(a.status)}  score ${score}${a.gate_failed ? c.red(' gate') : ''}  ${c.gray([time, tps].filter(Boolean).join(' · '))}${a.error ? '  ' + c.red(a.error.slice(0, 160)) : ''}`;
}

function onEvent(runId: string, seen: Map<string, string>) {
	return (e: EngineEvent) => {
		if (e.type === 'attempt' && e.attempt.run_id === runId) {
			const a = e.attempt;
			const key = `${a.stage}:${a.status}:${a.score}:${a.error}`;
			if (seen.get(a.id) === key) return;
			seen.set(a.id, key);
			if (a.error) console.log(`  ${c.red('✘')} ${describe(a)}`);
			else if (a.stage === 'judged') console.log(`  ${c.green('✔')} ${describe(a)}`);
			else if (a.stage === 'checked')
				console.log(`  ${c.cyan('◆')} ${describe(a)} ${c.gray('(checked)')}`);
		} else if (
			e.type === 'log' &&
			(e.run_id === runId || e.run_id === null) &&
			e.level !== 'info'
		) {
			console.log(`  ${e.level === 'error' ? c.red('error') : c.yellow('warn')} ${e.message}`);
		} else if (e.type === 'log' && e.run_id === null && e.message.startsWith('llama:')) {
			console.log(`  ${c.gray(e.message)}`);
		}
	};
}

function summary(rows: AttemptRow[]) {
	console.log('');
	console.log(
		table(
			rows.map((r) => [
				r.blueprint_id,
				r.test_id,
				r.rep,
				statusColor(r.status),
				r.score?.toFixed(1),
				r.gate_failed ? c.red('yes') : '',
				r.latency_ms ? `${(r.latency_ms / 1000).toFixed(1)}s` : null,
				r.gen_tps
			]),
			['blueprint', 'test', '#', 'status', 'score', 'gate', 'time', 't/s']
		)
	);
}

export default async function run(args: string[]): Promise<number> {
	const p = parse(
		args,
		{
			suite: { type: 'string', short: 's' },
			blueprint: { type: 'string', short: 'b', multiple: true },
			test: { type: 'string', short: 't', multiple: true },
			reps: { type: 'string', short: 'n' },
			judge: { type: 'string' },
			'judge-profile': { type: 'string' },
			'judge-model': { type: 'string' },
			'judge-effort': { type: 'string' },
			'judge-mode': { type: 'string' },
			label: { type: 'string' },
			force: { type: 'boolean' },
			detach: { type: 'boolean' },
			local: { type: 'boolean' }
		},
		HELP
	);
	if (!p) return 0;
	const v = p.values;
	const engine = await Engine.open(v.root, { exclusive: false });
	const lib = await engine.library();
	const suite = v.suite ? lib.suites.get(v.suite as string) : undefined;
	if (v.suite && !suite) throw new Error(`unknown suite: ${v.suite}`);
	const tests = (v.test as string[] | undefined) ?? suite?.tests ?? [];
	const blueprints = (v.blueprint as string[] | undefined) ?? suite?.blueprints ?? [];
	if (!tests.length) throw new Error('no tests: pass --suite or --test');
	if (!blueprints.length) throw new Error('no blueprints: pass --blueprint');
	const spec: RunSpec = {
		suite: suite?.id,
		label: v.label as string | undefined,
		blueprints,
		tests,
		repetitions: v.reps ? Number(v.reps) : undefined,
		judge: {
			profile: v['judge-profile'] as string | undefined,
			kind: (v.judge as 'claude' | 'dry-run' | 'none' | undefined) ?? 'claude',
			model: v['judge-model'] as string | undefined,
			effort: v['judge-effort'] as never,
			mode_override: v['judge-mode'] as never
		}
	};

	const server = v.local ? null : await ServerClient.detect(v.root);
	if (server) {
		console.log(c.gray(`handing the run to the running server at ${server.base}`));
		const pre = await server.call<PreflightReport>('POST', '/api/preflight', spec);
		printPreflight(pre);
		if (!pre.ok && !v.force) return fail('preflight failed (use --force to start anyway)');
		const { run } = await server.call<{ run: RunRecord }>('POST', '/api/runs', {
			spec,
			start: true
		});
		console.log(`${c.bold('run')} ${run.id}`);
		if (v.detach) return 0;
		const seen = new Map<string, string>();
		await server.follow(
			(e) =>
				e.type === 'run' &&
				e.run.id === run.id &&
				['done', 'failed', 'cancelled'].includes(e.run.status),
			onEvent(run.id, seen)
		);
		const rows = await server.call<AttemptRow[]>(
			'GET',
			`/api/runs/${encodeURIComponent(run.id)}/attempts`
		);
		summary(rows);
		return 0;
	}

	await engine.close();
	const exclusive = await Engine.open(v.root, { exclusive: true });
	try {
		console.log(c.bold('preflight'));
		const pre = await exclusive.preflight(spec);
		printPreflight(pre);
		if (!pre.ok && !v.force) return fail('preflight failed (use --force to start anyway)');
		const run = await exclusive.createRun(spec);
		console.log(
			`\n${c.bold('run')} ${run.id}  ${c.gray(`${run.counts?.total} attempt(s), judge: ${run.judge.label ?? run.judge.kind}`)}`
		);
		const seen = new Map<string, string>();
		exclusive.on('event', onEvent(run.id, seen));
		const stop = () => exclusive.cancelRun(run.id);
		process.once('SIGINT', stop);
		const final = await exclusive.runToCompletion(run.id);
		process.off('SIGINT', stop);
		summary(exclusive.index.attemptRows((a) => a.run_id === run.id));
		console.log(`\n${c.bold(final?.status ?? 'unknown')}  data/runs/${run.id}`);
		return final?.status === 'done' ? 0 : 1;
	} finally {
		await exclusive.close();
	}
}

function fail(msg: string): number {
	console.error(c.red(msg));
	return 1;
}
