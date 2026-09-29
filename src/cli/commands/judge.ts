import { parse } from '../args.ts';
import { c } from '../format.ts';
import { ServerClient } from '../client.ts';
import { Engine } from '../../engine/run/engine.ts';
import { parseAttemptId } from '../../engine/core/workspace.ts';

const HELP = `benchy judge <run-id | attempt-id>… — (re-)judge without regenerating

      --judge <kind>        claude | dry-run (default: claude)
      --judge-model <m>     default: settings (claude-opus-5-5)
      --judge-effort <e>    low | medium | high | xhigh | max
      --judge-mode <m>      static | interactive (default: each test's mode)
      --rubric <r>          current (library, default) | snapshot (as of the run)
      --only-unjudged       skip attempts that already have a score`;

export default async function judge(args: string[]): Promise<number> {
	const p = parse(
		args,
		{
			judge: { type: 'string' },
			'judge-model': { type: 'string' },
			'judge-effort': { type: 'string' },
			'judge-mode': { type: 'string' },
			rubric: { type: 'string' },
			'only-unjudged': { type: 'boolean' }
		},
		HELP
	);
	if (!p) return 0;
	if (!p.positionals.length) {
		console.log(HELP);
		return 2;
	}
	const v = p.values;
	const override = {
		kind: (v.judge as 'claude' | 'dry-run' | undefined) ?? 'claude',
		model: v['judge-model'] as string | undefined,
		effort: v['judge-effort'] as never,
		mode_override: v['judge-mode'] as never
	};
	const rubric = (v.rubric as 'current' | 'snapshot' | undefined) ?? 'current';
	const reader = await Engine.open(v.root);
	const ids: string[] = [];
	for (const target of p.positionals) {
		if (parseAttemptId(target)) ids.push(target);
		else
			ids.push(
				...reader.index
					.attemptsOfRun(target)
					.filter((a) => !v['only-unjudged'] || !a.judgement)
					.map((a) => a.id)
			);
	}
	await reader.close();
	if (!ids.length) {
		console.log(c.yellow('nothing to judge'));
		return 0;
	}
	console.log(
		`judging ${ids.length} attempt(s) with ${override.kind}${override.model ? ' ' + override.model : ''}`
	);
	const server = await ServerClient.detect(v.root);
	if (server) {
		await server.call('POST', '/api/judge', { ids, override, rubric });
		console.log(c.gray(`queued on ${server.base}; follow progress in BenchyOS`));
		return 0;
	}
	const engine = await Engine.open(v.root, { exclusive: true });
	try {
		engine.on('event', (e) => {
			if (
				e.type === 'attempt' &&
				ids.includes(e.attempt.id) &&
				(e.attempt.stage === 'judged' || e.attempt.stage === 'checked')
			) {
				const a = e.attempt;
				if (a.stage === 'judged')
					console.log(
						`  ${c.green('✔')} ${a.id}  ${c.bold(a.score?.toFixed(1) ?? '—')}${a.gate_failed ? c.red(' gate') : ''}`
					);
			}
			if (e.type === 'log' && e.level !== 'info')
				console.log(`  ${c.yellow(e.level)} ${e.message}`);
		});
		await engine.rejudge(ids, override, rubric);
	} finally {
		await engine.close();
	}
	return 0;
}
