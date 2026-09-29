import { describe, expect, it } from 'vitest';
import {
	blueprintHash,
	loadLibrary,
	saveBlueprint,
	testHashes
} from '../../src/engine/core/library.ts';
import { tempWorkspace } from '../helpers.ts';

const BASE = `id: qwen-base
kind: llama-cpp
label: Qwen base
server:
  model: /models/qwen.gguf
  ctx-size: 65536
  cache-type-k: q8_0
request:
  temperature: 0.6
`;

const VARIANT = `id: qwen-high
extends: qwen-base
label: Qwen high effort
server:
  reasoning-effort: high
  ctx-size: 131072
request:
  temperature: null
`;

describe('blueprints', () => {
	it('resolves extends by deep merge and lets null delete inherited keys', async () => {
		// arrange
		const ws = await tempWorkspace({
			'library/blueprints/qwen-base.yaml': BASE,
			'library/blueprints/qwen-high.yaml': VARIANT
		});

		// act
		const lib = await loadLibrary(ws);
		const high = lib.blueprints.get('qwen-high')!;

		// assume
		expect(lib.issues).toEqual([]);
		expect(high.kind).toBe('llama-cpp');
		expect(high.label).toBe('Qwen high effort');
		expect(high.server).toEqual({
			model: '/models/qwen.gguf',
			'ctx-size': 131072,
			'cache-type-k': 'q8_0',
			'reasoning-effort': 'high'
		});
		expect(high.request).toEqual({});
	});

	it('keeps the version hash stable across cosmetic edits only', async () => {
		// arrange
		const ws = await tempWorkspace({ 'library/blueprints/qwen-base.yaml': BASE });
		const before = blueprintHash((await loadLibrary(ws)).blueprints.get('qwen-base')!);

		// act
		await saveBlueprint(ws, {
			id: 'qwen-base',
			kind: 'llama-cpp',
			label: 'Renamed',
			tags: ['x'],
			server: { model: '/models/qwen.gguf', 'ctx-size': 65536, 'cache-type-k': 'q8_0' },
			request: { temperature: 0.6 }
		});
		const cosmetic = blueprintHash((await loadLibrary(ws)).blueprints.get('qwen-base')!);
		await saveBlueprint(ws, {
			id: 'qwen-base',
			kind: 'llama-cpp',
			server: { model: '/models/qwen.gguf', 'ctx-size': 32768, 'cache-type-k': 'q8_0' },
			request: { temperature: 0.6 }
		});
		const measured = blueprintHash((await loadLibrary(ws)).blueprints.get('qwen-base')!);

		// assume
		expect(cosmetic).toBe(before);
		expect(measured).not.toBe(before);
	});

	it('reports cycles, unknown parents and kind-specific gaps instead of throwing', async () => {
		// arrange
		const ws = await tempWorkspace({
			'library/blueprints/a.yaml': 'id: a\nextends: b\n',
			'library/blueprints/b.yaml': 'id: b\nextends: a\n',
			'library/blueprints/orphan.yaml': 'id: orphan\nextends: nope\n',
			'library/blueprints/remote.yaml': 'id: remote\nkind: openai-compatible\n',
			'library/blueprints/typo.yaml': 'id: typo\nkind: dry-run\ntemprature: 1\n'
		});

		// act
		const lib = await loadLibrary(ws);
		const messages = lib.issues.map((i) => `${i.file}: ${i.message}`).join('\n');

		// assume
		expect(lib.blueprints.size).toBe(0);
		expect(messages).toMatch(/extends cycle/);
		expect(messages).toMatch(/unknown blueprint "nope"/);
		expect(messages).toMatch(/need endpoint/);
		expect(messages).toMatch(/typo\.yaml: .*temprature/);
	});
});

describe('tests', () => {
	it('loads prompt, derives output mode and default checks, and hashes task and rubric separately', async () => {
		// arrange
		const ws = await tempWorkspace({
			'library/tests/clock/test.yaml': `id: clock
title: SVG clock
output:
  files:
    - path: index.html
judge:
  criteria:
    - id: hands
      title: Three hands
      weight: 2
      required: true
`,
			'library/tests/clock/prompt.md': 'Build a clock.\n'
		});

		// act
		const lib = await loadLibrary(ws);
		const test = lib.tests.get('clock')!;
		const h1 = testHashes(test);
		const h2 = testHashes({
			...test,
			judge: { ...test.judge, guidance: 'Be strict.' }
		});

		// assume
		expect(lib.issues).toEqual([]);
		expect(test.prompt).toBe('Build a clock.');
		expect(test.output.mode).toBe('single');
		expect(test.output.files[0].kind).toBe('html');
		expect(test.checks.map((c) => c.id)).toEqual(['html.parse', 'html.render']);
		expect(test.judge.criteria[0]).toEqual({
			id: 'hands',
			title: 'Three hands',
			description: undefined,
			weight: 2,
			required: true
		});
		expect(h2.task_hash).toBe(h1.task_hash);
		expect(h2.rubric_hash).not.toBe(h1.rubric_hash);
	});
});

describe('partial nested blocks', () => {
	it('lets a variant override one nested field and validates the resolved result', async () => {
		// arrange
		const ws = await tempWorkspace({
			'library/blueprints/cc.yaml':
				'id: cc\nkind: claude-code\nclaude: { model: claude-sonnet-5-5, effort: high, mode: chat }\n',
			'library/blueprints/cc-agentic.yaml':
				'id: cc-agentic\nextends: cc\nclaude: { mode: agentic }\n',
			'library/blueprints/broken.yaml': 'id: broken\nkind: claude-code\nclaude: { mode: chat }\n'
		});

		// act
		const lib = await loadLibrary(ws);

		// assume
		expect(lib.blueprints.get('cc-agentic')?.claude).toEqual({
			model: 'claude-sonnet-5-5',
			effort: 'high',
			mode: 'agentic'
		});
		expect(lib.blueprints.has('broken')).toBe(false);
		expect(lib.issues.map((i) => i.file)).toEqual(['blueprints/broken.yaml']);
	});
});
