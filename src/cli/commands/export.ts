import { join, resolve } from 'node:path';
import { parse, REPO_ROOT } from '../args.ts';
import { c } from '../format.ts';
import { Engine } from '../../engine/run/engine.ts';
import { exportStatic } from '../../engine/export/static.ts';

const HELP = `benchy export <out-dir> — write a read-only static copy of the results site

      --run <id>     export only these runs (repeatable; default: all)

Serve the result with any static web server, e.g. python3 -m http.server --directory <out-dir>.`;

export default async function exportCmd(args: string[]): Promise<number> {
	const p = parse(args, { run: { type: 'string', multiple: true } }, HELP);
	if (!p) return 0;
	const out = p.positionals[0];
	if (!out) {
		console.log(HELP);
		return 2;
	}
	const engine = await Engine.open(p.values.root);
	try {
		const r = await exportStatic(engine, resolve(out), {
			uiDir: join(REPO_ROOT, 'build', 'ui'),
			runs: p.values.run as string[] | undefined
		});
		console.log(
			`${c.green('exported')} ${r.runs} run(s), ${r.attempts} attempt(s) → ${resolve(out)}`
		);
		return 0;
	} finally {
		await engine.close();
	}
}
