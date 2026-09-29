import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { parse } from '../args.ts';
import { c } from '../format.ts';
import { Engine } from '../../engine/run/engine.ts';
import { importPreset } from '../../engine/legacy/preset-import.ts';

const HELP = `benchy import-preset <models.ini> — one llama-cpp blueprint per [section]

      --section <name>    import only these sections (repeatable)
      --prefix <text>     prefix for blueprint ids
      --tag <tag>         extra tag for every imported blueprint (repeatable)
      --strip-models-dir  store model paths relative to llama.models_dir (portable across hosts)
      --overwrite         replace existing blueprints with the same id`;

export default async function importPresetCmd(args: string[]): Promise<number> {
	const p = parse(
		args,
		{
			section: { type: 'string', multiple: true },
			prefix: { type: 'string' },
			tag: { type: 'string', multiple: true },
			overwrite: { type: 'boolean' },
			'strip-models-dir': { type: 'boolean' }
		},
		HELP
	);
	if (!p) return 0;
	const file = p.positionals[0];
	if (!file) {
		console.log(HELP);
		return 2;
	}
	const engine = await Engine.open(p.values.root);
	const result = await importPreset(engine.ws, await readFile(file, 'utf8'), {
		sections: p.values.section as string[] | undefined,
		prefix: p.values.prefix as string | undefined,
		tags: (p.values.tag as string[] | undefined) ?? [],
		overwrite: !!p.values.overwrite,
		relative: !!p.values['strip-models-dir'],
		home: homedir(),
		source: file
	});
	for (const id of result.created) console.log(`  ${c.green('+')} ${id}`);
	for (const id of result.skipped)
		console.log(`  ${c.gray('=')} ${id} ${c.gray('(exists; --overwrite to replace)')}`);
	return 0;
}
