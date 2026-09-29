#!/usr/bin/env node
import { c } from './format.ts';

const HELP = `${c.bold('benchy')} — benchmark local and remote models, judged by Claude Code

${c.bold('Usage')}
  benchy <command> [options]

${c.bold('Commands')}
  serve                         start BenchyOS (web UI + API) on localhost
  run                           run blueprints against tests
  resume <run-id>               continue an interrupted run (--retry-failed)
  judge <run|attempt>…          (re-)judge existing results without regenerating
  recheck <run|attempt>…        re-run automated checks (fresh screenshots and logs)
  list [blueprints|tests|suites|runs|checks]
  criteria <test>               let Claude propose judge criteria for a test
  import-preset <models.ini>    create llama-cpp blueprints from a router preset
  import-legacy <runs-dir>      import llm-check results (runs/*/results.json)
  export <out-dir>              write a read-only static copy of the results site
  doctor                        check this host: node, chromium, bwrap, claude, llama-server, GPU

${c.bold('Global options')}
  --root <dir>                  workspace (default: current dir if it has library/, else the repo)

Run ${c.cyan('benchy <command> --help')} for command options.`;

async function main(): Promise<number> {
	const argv = process.argv.slice(2);
	const command = argv[0];
	if (!command || command === '--help' || command === '-h' || command === 'help') {
		console.log(HELP);
		return 0;
	}
	const rest = argv.slice(1);
	const modules: Record<string, () => Promise<{ default: (args: string[]) => Promise<number> }>> = {
		serve: () => import('./commands/serve.ts'),
		run: () => import('./commands/run.ts'),
		resume: () => import('./commands/resume.ts'),
		judge: () => import('./commands/judge.ts'),
		recheck: () => import('./commands/recheck.ts'),
		list: () => import('./commands/list.ts'),
		criteria: () => import('./commands/criteria.ts'),
		'import-preset': () => import('./commands/import-preset.ts'),
		'import-legacy': () => import('./commands/import-legacy.ts'),
		export: () => import('./commands/export.ts'),
		doctor: () => import('./commands/doctor.ts')
	};
	const load = modules[command];
	if (!load) {
		console.error(`${c.red('unknown command')} ${command}\n\n${HELP}`);
		return 2;
	}
	return (await load()).default(rest);
}

main().then(
	(code) => process.exit(code),
	(e) => {
		console.error(c.red('error:'), (e as Error).message);
		if (process.env.BENCHY_DEBUG) console.error((e as Error).stack);
		process.exit(1);
	}
);
