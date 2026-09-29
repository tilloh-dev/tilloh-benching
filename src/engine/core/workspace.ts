import { resolve, join } from 'node:path';

/**
 * A BenchyOS workspace is a directory holding `library/` (authored definitions),
 * `data/` (results) and the config files. By default it is the repository root.
 */
export type Workspace = {
	root: string;
	library: string;
	blueprints: string;
	tests: string;
	suites: string;
	data: string;
	runs: string;
	cache: string;
	configFile: string;
	localConfigFile: string;
	envFile: string;
};

export function workspaceAt(root: string): Workspace {
	const abs = resolve(root);
	const library = join(abs, 'library');
	const data = join(abs, 'data');
	return {
		root: abs,
		library,
		blueprints: join(library, 'blueprints'),
		tests: join(library, 'tests'),
		suites: join(library, 'suites'),
		data,
		runs: join(data, 'runs'),
		cache: join(data, '.cache'),
		configFile: join(abs, 'benchy.config.yaml'),
		localConfigFile: join(abs, 'benchy.local.yaml'),
		envFile: join(abs, '.env')
	};
}

export function runDir(ws: Workspace, runId: string): string {
	return join(ws.runs, runId);
}

export function attemptDir(
	ws: Workspace,
	runId: string,
	blueprintId: string,
	testId: string,
	rep: number
): string {
	return join(ws.runs, runId, blueprintId, testId, String(rep));
}

export function attemptId(runId: string, blueprintId: string, testId: string, rep: number): string {
	return `${runId}/${blueprintId}/${testId}/${rep}`;
}

export function parseAttemptId(
	id: string
): { runId: string; blueprintId: string; testId: string; rep: number } | null {
	const parts = id.split('/');
	if (parts.length !== 4) return null;
	const rep = Number(parts[3]);
	if (!Number.isInteger(rep) || rep < 1) return null;
	return { runId: parts[0], blueprintId: parts[1], testId: parts[2], rep };
}
