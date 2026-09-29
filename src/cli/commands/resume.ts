import { parse } from '../args.ts';
import { c, statusColor } from '../format.ts';
import { Engine } from '../../engine/run/engine.ts';

const HELP = `benchy resume <run-id> — continue an interrupted or cancelled run where it stopped

      --retry-failed   also regenerate attempts that failed or produced nothing usable`;

export default async function resume(args: string[]): Promise<number> {
	const p = parse(args, { 'retry-failed': { type: 'boolean' } }, HELP);
	if (!p) return 0;
	const id = p.positionals[0];
	if (!id) {
		console.log(HELP);
		return 2;
	}
	const engine = await Engine.open(p.values.root, { exclusive: true });
	try {
		if (!engine.index.runs.has(id)) throw new Error(`unknown run: ${id}`);
		if (p.values['retry-failed'])
			console.log(c.gray(`reset ${await engine.retryFailed(id)} failed attempt(s)`));
		engine.on('event', (e) => {
			if (e.type === 'attempt' && e.attempt.run_id === id && e.attempt.stage === 'judged') {
				console.log(
					`  ${c.green('✔')} ${e.attempt.blueprint_id} × ${e.attempt.test_id} #${e.attempt.rep}  ${statusColor(e.attempt.status)}  ${e.attempt.score?.toFixed(1) ?? '—'}`
				);
			}
			if (e.type === 'log' && e.level !== 'info')
				console.log(`  ${c.yellow(e.level)} ${e.message}`);
		});
		const run = await engine.runToCompletion(id);
		console.log(
			`${c.bold(run?.status ?? '?')}  ${run?.counts?.done}/${run?.counts?.total} complete`
		);
		return run?.status === 'done' ? 0 : 1;
	} finally {
		await engine.close();
	}
}
