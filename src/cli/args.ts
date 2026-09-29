import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function defaultRoot(): string {
	if (process.env.BENCHY_ROOT) return resolve(process.env.BENCHY_ROOT);
	const cwd = process.cwd();
	if (existsSync(join(cwd, 'library')) || existsSync(join(cwd, 'benchy.config.yaml'))) return cwd;
	return REPO_ROOT;
}

export type Parsed = {
	values: Record<string, string | boolean | string[] | undefined> & { root: string };
	positionals: string[];
};

type OptionSpec = Record<
	string,
	{ type: 'string' | 'boolean'; short?: string; multiple?: boolean }
>;

/** Shared option parsing: every command accepts --root and --help. Returns null after printing help. */
export function parse(args: string[], options: OptionSpec, help: string): Parsed | null {
	const parsed = parseArgs({
		args,
		options: { ...options, root: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
		allowPositionals: true,
		strict: true
	});
	if (parsed.values.help) {
		console.log(help);
		return null;
	}
	const root = resolve((parsed.values.root as string | undefined) ?? defaultRoot());
	return { values: { ...parsed.values, root }, positionals: parsed.positionals };
}
