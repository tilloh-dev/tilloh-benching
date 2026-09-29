import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml, stringify } from 'yaml';
import { parse } from '../args.ts';
import { c } from '../format.ts';
import { Engine } from '../../engine/run/engine.ts';
import { suggestCriteria } from '../../engine/judge/criteria.ts';
import { taskMarkdown } from '../../engine/judge/workspace.ts';

const HELP = `benchy criteria <test-id> — let Claude propose judge criteria

      --model <m>     model to ask (default: judge model from settings)
      --write         replace judge.criteria (and mode/guidance) in the test's test.yaml`;

export default async function criteria(args: string[]): Promise<number> {
	const p = parse(args, { model: { type: 'string' }, write: { type: 'boolean' } }, HELP);
	if (!p) return 0;
	const id = p.positionals[0];
	if (!id) {
		console.log(HELP);
		return 2;
	}
	const engine = await Engine.open(p.values.root);
	const lib = await engine.library();
	const test = lib.tests.get(id);
	if (!test) throw new Error(`unknown test: ${id}`);
	console.log(c.gray(`asking ${p.values.model ?? engine.settings.judge.model}…`));
	const expected = taskMarkdown(test).split('## Expected output')[1]?.trim() ?? '';
	const s = await suggestCriteria({
		settings: engine.settings,
		title: test.title,
		prompt: test.prompt,
		output: expected,
		model: p.values.model as string | undefined
	});
	console.log(
		stringify(
			{ judge: { mode: s.judge_mode, guidance: s.guidance, criteria: s.criteria } },
			{ lineWidth: 100 }
		)
	);
	if (p.values.write) {
		const path = join(engine.ws.tests, id, 'test.yaml');
		const doc = parseYaml(await readFile(path, 'utf8')) as Record<string, unknown>;
		doc.judge = {
			...(doc.judge as object),
			mode: s.judge_mode,
			guidance: s.guidance,
			criteria: s.criteria
		};
		await writeFile(path, stringify(doc, { lineWidth: 0 }));
		console.log(c.green(`written to ${path}`));
	}
	return 0;
}
