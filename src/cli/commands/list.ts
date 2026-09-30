import { parse } from '../args.ts';
import { c, statusColor, table } from '../format.ts';
import { Engine } from '../../engine/run/engine.ts';
import { blueprintHash } from '../../engine/core/library.ts';
import { listChecks } from '../../engine/checks/index.ts';

const HELP = `benchy list [blueprints|tests|suites|judges|runs|checks]   (default: everything)`;

export default async function list(args: string[]): Promise<number> {
	const p = parse(args, {}, HELP);
	if (!p) return 0;
	const what = p.positionals[0] ?? 'all';
	const engine = await Engine.open(p.values.root);
	const lib = await engine.library();
	const show = (k: string) => what === 'all' || what === k;
	if (show('blueprints')) {
		console.log(c.bold(`\nBlueprints (${lib.blueprints.size})`));
		console.log(
			table(
				[...lib.blueprints.values()].map((b) => [b.id, b.kind, b.label ?? '', blueprintHash(b)]),
				['id', 'kind', 'label', 'version']
			)
		);
	}
	if (show('tests')) {
		console.log(c.bold(`\nTests (${lib.tests.size})`));
		console.log(
			table(
				[...lib.tests.values()].map((t) => [
					t.id,
					t.output.mode,
					t.output.files.map((f) => f.path).join(', '),
					t.checks.map((x) => x.id).join(', '),
					`${t.judge.criteria.length} · ${t.judge.mode}`
				]),
				['id', 'output', 'files', 'checks', 'criteria']
			)
		);
	}
	if (show('suites')) {
		console.log(c.bold(`\nSuites (${lib.suites.size})`));
		console.log(
			table(
				[...lib.suites.values()].map((s) => [s.id, s.title, s.tests.length, s.repetitions ?? 1]),
				['id', 'title', 'tests', 'reps']
			)
		);
	}
	if (show('judges')) {
		const def = engine.settings.judge.default_profile;
		console.log(c.bold(`\nJudge profiles (${lib.judges.size})`));
		console.log(
			table(
				[...lib.judges.values()].map((j) => [
					j.id + (j.id === def ? ' *' : ''),
					j.kind,
					j.model ?? '',
					j.effort ?? '',
					j.endpoint?.api_key_env
						? `${j.endpoint.api_key_env} ${process.env[j.endpoint.api_key_env] ? 'set' : 'missing'}`
						: ''
				]),
				['id (* default)', 'kind', 'model', 'effort', 'api key']
			)
		);
	}
	if (show('runs')) {
		const runs = engine.index.runRows();
		console.log(c.bold(`\nRuns (${runs.length})`));
		console.log(
			table(
				runs
					.slice(0, 40)
					.map((r) => [
						r.id,
						statusColor(r.status),
						r.label ?? '',
						r.blueprints.length,
						r.tests.length,
						`${r.counts.judged}/${r.counts.total}`,
						r.mean_score?.toFixed(1),
						r.judge
					]),
				['id', 'status', 'label', 'bps', 'tests', 'judged', 'mean', 'judge']
			)
		);
	}
	if (show('checks')) {
		console.log(c.bold('\nChecks'));
		console.log(
			table(
				listChecks().map((x) => [x.id, x.kinds.join(', ') || '(all)', x.description]),
				['id', 'kinds', 'description']
			)
		);
	}
	if (lib.issues.length) {
		console.log(c.yellow(`\nLibrary issues (${lib.issues.length})`));
		for (const i of lib.issues) console.log(`  ${c.yellow('!')} ${i.file}: ${i.message}`);
	}
	return 0;
}
