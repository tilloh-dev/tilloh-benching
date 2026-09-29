import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { z } from 'zod';
import {
	Blueprint,
	BlueprintFile,
	SuiteFile,
	TestFile,
	BLUEPRINT_COSMETIC_KEYS,
	type BenchTest,
	type CheckEntry,
	type CheckSpec,
	type ResolvedCriterion,
	type Suite
} from './schema.ts';
import { deepMerge } from './canonical.ts';
import { hashOf } from './hash.ts';
import { kindForPath, kindInfo } from './kinds.ts';
import type { Workspace } from './workspace.ts';
import { ensureDir, exists, listDirs, listFiles, safeRelative } from '../util/fs.ts';

export type LibraryIssue = { file: string; message: string };

export type Library = {
	blueprintFiles: Map<string, BlueprintFile>;
	blueprints: Map<string, Blueprint>;
	tests: Map<string, BenchTest>;
	testFiles: Map<string, TestFile>;
	suites: Map<string, Suite>;
	issues: LibraryIssue[];
};

export const DEFAULT_CRITERIA: ResolvedCriterion[] = [
	{
		id: 'task-fulfilment',
		title: 'Fulfils the task',
		description: 'Every explicit requirement of the prompt is met, verifiably.',
		weight: 3,
		required: true
	},
	{
		id: 'quality',
		title: 'Overall quality',
		description: 'Correctness, robustness and craftsmanship of the result.',
		weight: 2,
		required: false
	}
];

function formatZodError(error: z.ZodError): string {
	return error.issues
		.map((i) => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
		.join('; ');
}

async function readYaml(path: string): Promise<unknown> {
	return parseYaml(await readFile(path, 'utf8'));
}

// ---------------------------------------------------------------- blueprints

export function resolveBlueprints(
	files: Map<string, BlueprintFile>,
	issues: LibraryIssue[],
	fileOf: (id: string) => string = (id) => `blueprints/${id}.yaml`
): Map<string, Blueprint> {
	const out = new Map<string, Blueprint>();
	const resolving = new Set<string>();

	const resolveOne = (id: string): Record<string, unknown> | null => {
		const file = files.get(id);
		if (!file) return null;
		if (resolving.has(id)) {
			issues.push({ file: fileOf(id), message: `extends cycle through "${id}"` });
			return null;
		}
		if (!file.extends) return { ...file };
		resolving.add(id);
		const parent = resolveOne(file.extends);
		resolving.delete(id);
		if (!parent) {
			issues.push({ file: fileOf(id), message: `extends unknown blueprint "${file.extends}"` });
			return null;
		}
		// The child keeps its own identity; everything else inherits.
		const { id: _pid, label: _pl, description: _pd, origin: _po, ...inheritable } = parent;
		return deepMerge(inheritable, file) as Record<string, unknown>;
	};

	for (const id of files.keys()) {
		const merged = resolveOne(id);
		if (!merged) continue;
		const parsed = Blueprint.safeParse({ tags: [], request: {}, ...merged });
		if (parsed.success) out.set(id, parsed.data);
		else issues.push({ file: fileOf(id), message: formatZodError(parsed.error) });
	}
	return out;
}

/** Version hash: everything that changes what is measured, nothing cosmetic. */
export function blueprintHash(bp: Blueprint): string {
	const measured: Record<string, unknown> = { ...bp };
	for (const key of BLUEPRINT_COSMETIC_KEYS) delete measured[key];
	return hashOf(measured);
}

// ---------------------------------------------------------------- tests

export function normalizeChecks(entries: CheckEntry[]): CheckSpec[] {
	return entries.map((entry) => {
		if (typeof entry === 'string') return { id: entry, options: {} };
		const [id, options] = Object.entries(entry)[0];
		return { id, options: options ?? {} };
	});
}

export function defaultChecksFor(
	files: { path: string; kind?: string }[],
	mode: string
): CheckSpec[] {
	const ids = new Set<string>();
	if (mode === 'text') for (const c of kindInfo('markdown').defaultChecks) ids.add(c);
	for (const f of files) {
		for (const c of kindInfo(f.kind ?? kindForPath(f.path)).defaultChecks) ids.add(c);
	}
	return [...ids].map((id) => ({ id, options: {} }));
}

export function normalizeTest(
	file: TestFile,
	prompt: string,
	inputs: BenchTest['inputs_resolved'] = []
): BenchTest {
	const files = (file.output?.files ?? []).map((f) => ({
		...f,
		kind: f.kind ?? kindForPath(f.path),
		required: f.required ?? true
	}));
	const mode =
		file.output?.mode ?? (files.length > 1 ? 'files' : files.length === 1 ? 'single' : 'text');
	const criteria: ResolvedCriterion[] = file.judge?.criteria?.length
		? file.judge.criteria.map((c) => ({
				id: c.id,
				title: c.title,
				description: c.description,
				weight: c.weight ?? 1,
				required: c.required ?? false
			}))
		: DEFAULT_CRITERIA;
	return {
		...file,
		tags: file.tags ?? [],
		prompt,
		inputs_resolved: inputs,
		output: { mode, files, instructions: file.output?.instructions },
		checks: file.checks ? normalizeChecks(file.checks) : defaultChecksFor(files, mode),
		judge: {
			mode: file.judge?.mode ?? 'static',
			guidance: file.judge?.guidance,
			include_reasoning: file.judge?.include_reasoning ?? false,
			criteria
		}
	};
}

export function testHashes(test: BenchTest): {
	task_hash: string;
	rubric_hash: string;
	checks_hash: string;
} {
	return {
		task_hash: hashOf({
			prompt: test.prompt,
			system: test.system ?? null,
			inputs: test.inputs_resolved.map((i) => [i.path, i.content]),
			output: test.output,
			max_tokens: test.max_tokens ?? null
		}),
		rubric_hash: hashOf({
			criteria: test.judge.criteria,
			guidance: test.judge.guidance ?? null,
			mode: test.judge.mode,
			include_reasoning: test.judge.include_reasoning
		}),
		checks_hash: hashOf(test.checks)
	};
}

async function loadTest(ws: Workspace, dirName: string, issues: LibraryIssue[]) {
	const dir = join(ws.tests, dirName);
	const yamlPath = join(dir, 'test.yaml');
	const rel = relative(ws.library, yamlPath);
	if (!(await exists(yamlPath))) {
		issues.push({ file: rel, message: 'missing test.yaml' });
		return null;
	}
	let raw: unknown;
	try {
		raw = await readYaml(yamlPath);
	} catch (e) {
		issues.push({ file: rel, message: `invalid YAML: ${(e as Error).message}` });
		return null;
	}
	const parsed = TestFile.safeParse(raw);
	if (!parsed.success) {
		issues.push({ file: rel, message: formatZodError(parsed.error) });
		return null;
	}
	const file = parsed.data;
	if (file.id !== dirName) {
		issues.push({ file: rel, message: `id "${file.id}" must match its directory "${dirName}"` });
		return null;
	}
	const promptPath = join(dir, file.prompt_file ?? 'prompt.md');
	let prompt: string;
	try {
		prompt = (await readFile(promptPath, 'utf8')).trim();
	} catch {
		issues.push({
			file: rel,
			message: `prompt file not found: ${file.prompt_file ?? 'prompt.md'}`
		});
		return null;
	}
	const inputs: BenchTest['inputs_resolved'] = [];
	for (const input of file.inputs ?? []) {
		const safe = safeRelative(input.path);
		if (!safe) {
			issues.push({ file: rel, message: `input path escapes the test directory: ${input.path}` });
			return null;
		}
		try {
			inputs.push({
				path: safe,
				label: input.label ?? safe,
				content: await readFile(join(dir, safe), 'utf8')
			});
		} catch {
			issues.push({ file: rel, message: `input not found: ${safe}` });
			return null;
		}
	}
	return { file, test: normalizeTest(file, prompt, inputs) };
}

// ---------------------------------------------------------------- loading

export async function loadLibrary(ws: Workspace): Promise<Library> {
	const issues: LibraryIssue[] = [];
	const blueprintFiles = new Map<string, BlueprintFile>();
	for (const name of await listFiles(ws.blueprints)) {
		if (!/\.ya?ml$/.test(name)) continue;
		const rel = `blueprints/${name}`;
		try {
			const parsed = BlueprintFile.safeParse(await readYaml(join(ws.blueprints, name)));
			if (!parsed.success) {
				issues.push({ file: rel, message: formatZodError(parsed.error) });
				continue;
			}
			const expected = name.replace(/\.ya?ml$/, '');
			if (parsed.data.id !== expected) {
				issues.push({
					file: rel,
					message: `id "${parsed.data.id}" must match file name "${expected}"`
				});
				continue;
			}
			blueprintFiles.set(parsed.data.id, parsed.data);
		} catch (e) {
			issues.push({ file: rel, message: `invalid YAML: ${(e as Error).message}` });
		}
	}
	const blueprints = resolveBlueprints(blueprintFiles, issues);

	const tests = new Map<string, BenchTest>();
	const testFiles = new Map<string, TestFile>();
	for (const dirName of await listDirs(ws.tests)) {
		const loaded = await loadTest(ws, dirName, issues);
		if (loaded) {
			tests.set(loaded.file.id, loaded.test);
			testFiles.set(loaded.file.id, loaded.file);
		}
	}

	const suites = new Map<string, Suite>();
	for (const name of await listFiles(ws.suites)) {
		if (!/\.ya?ml$/.test(name)) continue;
		const rel = `suites/${name}`;
		try {
			const parsed = SuiteFile.safeParse(await readYaml(join(ws.suites, name)));
			if (!parsed.success) {
				issues.push({ file: rel, message: formatZodError(parsed.error) });
				continue;
			}
			const unknown = parsed.data.tests.filter((t) => !tests.has(t));
			if (unknown.length)
				issues.push({ file: rel, message: `unknown tests: ${unknown.join(', ')}` });
			suites.set(parsed.data.id, parsed.data);
		} catch (e) {
			issues.push({ file: rel, message: `invalid YAML: ${(e as Error).message}` });
		}
	}

	return { blueprintFiles, blueprints, tests, testFiles, suites, issues };
}

// ---------------------------------------------------------------- saving

function toYaml(value: unknown): string {
	return stringifyYaml(value, { lineWidth: 0, blockQuote: 'literal' });
}

/** Remove undefined / empty containers so saved YAML stays tidy. */
function prune<T>(value: T): T {
	if (Array.isArray(value)) return value.map(prune) as T;
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			if (v === undefined) continue;
			const p = prune(v);
			if (p && typeof p === 'object' && !Array.isArray(p) && Object.keys(p).length === 0) continue;
			out[k] = p;
		}
		return out as T;
	}
	return value;
}

export async function saveBlueprint(ws: Workspace, input: unknown): Promise<BlueprintFile> {
	const bp = BlueprintFile.parse(input);
	await ensureDir(ws.blueprints);
	await writeFile(join(ws.blueprints, `${bp.id}.yaml`), toYaml(prune(bp)));
	return bp;
}

export async function deleteBlueprint(ws: Workspace, id: string): Promise<void> {
	await rm(join(ws.blueprints, `${id}.yaml`), { force: true });
}

export async function saveTest(ws: Workspace, input: unknown, prompt: string): Promise<TestFile> {
	const test = TestFile.parse(input);
	const dir = join(ws.tests, test.id);
	await ensureDir(dir);
	await writeFile(join(dir, 'test.yaml'), toYaml(prune(test)));
	await writeFile(join(dir, test.prompt_file ?? 'prompt.md'), prompt.trimEnd() + '\n');
	return test;
}

export async function deleteTest(ws: Workspace, id: string): Promise<void> {
	await rm(join(ws.tests, id), { recursive: true, force: true });
}

export async function saveSuite(ws: Workspace, input: unknown): Promise<Suite> {
	const suite = SuiteFile.parse(input);
	await ensureDir(ws.suites);
	await writeFile(join(ws.suites, `${suite.id}.yaml`), toYaml(prune(suite)));
	return suite;
}

export async function deleteSuite(ws: Workspace, id: string): Promise<void> {
	await rm(join(ws.suites, `${id}.yaml`), { force: true });
}
