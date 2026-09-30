import { parse } from '../args.ts';
import { c } from '../format.ts';
import { ServerClient } from '../client.ts';
import { Engine } from '../../engine/run/engine.ts';
import { parseAttemptId } from '../../engine/core/workspace.ts';

const HELP = `benchy judge <run-id | attempt-id>… — (re-)judge without regenerating

      --profile <id>        judge profile from library/judges (default: the run's judge,
                            else settings judge.default_profile, opus-xhigh)
      --judge dry-run       shorthand for --profile dry-run
      --judge-mode <m>      static | interactive (default: each test's mode)
      --rubric <r>          current (library, default) | snapshot (as of the run)
      --only-unjudged       skip attempts that already have a score`;

export default async function judge(args: string[]): Promise<number> {
	const p = parse(
		args,
		{
			profile: { type: 'string' },
			judge: { type: 'string' },
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
		profile: (v.profile as string | undefined) ?? (v.judge === 'dry-run' ? 'dry-run' : undefined),
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
					.filter(
						(a) =>
							!v['only-unjudged'] ||
							(override.profile ? !a.judgements?.[override.profile] : !a.judgement)
					)
					.map((a) => a.id)
			);
	}
	await reader.close();
	if (!ids.length) {
		console.log(c.yellow('nothing to judge'));
		return 0;
	}
	console.log(
		`judging ${ids.length} attempt(s) with ${override.profile ?? "the run's judge profile"}`
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
