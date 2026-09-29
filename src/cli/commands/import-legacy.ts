import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parse } from '../args.ts';
import { c } from '../format.ts';
import { Engine } from '../../engine/run/engine.ts';
import { importLegacyRuns } from '../../engine/legacy/llm-check.ts';

const HELP = `benchy import-legacy <runs-dir> — import llm-check results (one run per model directory)

      --preset <models.ini>   router preset to reconstruct llama.cpp settings from
      --no-recheck            keep llm-check's validation instead of re-running BenchyOS's checks
      --overwrite             replace runs that were imported before`;

export default async function importLegacy(args: string[]): Promise<number> {
	const p = parse(
		args,
		{
			preset: { type: 'string' },
			'no-recheck': { type: 'boolean' },
			overwrite: { type: 'boolean' }
		},
		HELP
	);
	if (!p) return 0;
	const dir = p.positionals[0];
	if (!dir) {
		console.log(HELP);
		return 2;
	}
	const engine = await Engine.open(p.values.root, { exclusive: true });
	try {
		const lib = await engine.library();
		const result = await importLegacyRuns(engine.ws, lib, resolve(dir), {
			presetIni: p.values.preset ? await readFile(p.values.preset as string, 'utf8') : undefined,
			home: homedir(),
			recheck: !p.values['no-recheck'],
			overwrite: !!p.values.overwrite
		});
		await engine.index.scan();
		for (const r of result.runs) console.log(`  ${c.green('+')} ${r}`);
		for (const r of result.skipped)
			console.log(`  ${c.gray('=')} ${r} ${c.gray('(already imported)')}`);
		if (!p.values['no-recheck'] && result.attempts.length) {
			console.log(c.gray(`re-running checks for ${result.attempts.length} attempt(s)…`));
			let done = 0;
			engine.on('event', (e) => {
				if (e.type === 'attempt' && e.attempt.stage === 'checked') {
					done++;
					if (done % 10 === 0) console.log(c.gray(`  ${done}/${result.attempts.length}`));
				}
			});
			await engine.recheck(result.attempts);
		}
		console.log(
			`${c.bold('imported')} ${result.runs.length} run(s), ${result.attempts.length} attempt(s). Judge them with: benchy judge <run-id>`
		);
		return 0;
	} finally {
		await engine.close();
	}
}
