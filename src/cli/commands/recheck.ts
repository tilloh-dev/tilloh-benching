import { parse } from '../args.ts';
import { c, statusColor } from '../format.ts';
import { Engine } from '../../engine/run/engine.ts';
import { parseAttemptId } from '../../engine/core/workspace.ts';

const HELP = `benchy recheck <run-id | attempt-id>… — re-run the automated checks (fresh screenshots and logs)

      --stuck      only attempts left in the "checking" stage (e.g. after a crash)

Generation and judgements are kept.`;

export default async function recheck(args: string[]): Promise<number> {
	const p = parse(args, { stuck: { type: 'boolean' } }, HELP);
	if (!p) return 0;
	if (!p.positionals.length) {
		console.log(HELP);
		return 2;
	}
	const engine = await Engine.open(p.values.root, { exclusive: true });
	try {
		const ids: string[] = [];
		for (const t of p.positionals) {
			if (parseAttemptId(t)) ids.push(t);
			else
				ids.push(
					...engine.index
						.attemptsOfRun(t)
						.filter((a) => !p.values.stuck || a.stage === 'checking')
						.map((a) => a.id)
				);
		}
		console.log(`re-checking ${ids.length} attempt(s)…`);
		engine.on('event', (e) => {
			if (
				e.type === 'attempt' &&
				ids.includes(e.attempt.id) &&
				(e.attempt.stage === 'checked' || e.attempt.stage === 'judged') &&
				e.attempt.status
			) {
				console.log(`  ${statusColor(e.attempt.status)}  ${e.attempt.id}`);
			}
		});
		await engine.recheck(ids);
		console.log(c.green('done'));
		return 0;
	} finally {
		await engine.close();
	}
}
