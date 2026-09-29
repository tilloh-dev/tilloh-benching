import { describe, expect, it } from 'vitest';
import {
	extractArtifacts,
	parseBlocks,
	stripThinking
} from '../../src/engine/artifacts/extract.ts';
import { normalizeTest } from '../../src/engine/core/library.ts';
import { buildMessages, outputInstructions } from '../../src/engine/artifacts/prompt.ts';

const single = normalizeTest(
	{ id: 't', title: 'T', output: { files: [{ path: 'index.html' }] } },
	'Build a page.'
);
const multi = normalizeTest(
	{
		id: 'm',
		title: 'M',
		output: {
			files: [{ path: 'main.py' }, { path: 'README.md' }, { path: 'extra.txt', required: false }]
		}
	},
	'Write a CLI.'
);
const text = normalizeTest({ id: 'x', title: 'X' }, 'Write an essay.');

describe('parseBlocks', () => {
	it('reads language, path hints from the info string and the preceding line, and unclosed fences', () => {
		// arrange
		const src = [
			'Here:',
			'```python path=main.py',
			'print(1)',
			'```',
			'',
			'**README.md**',
			'```markdown',
			'# Hi',
			'```',
			'```html',
			'<p>cut'
		].join('\n');

		// act
		const blocks = parseBlocks(src);

		// assume
		expect(blocks.map((b) => [b.lang, b.path, b.closed])).toEqual([
			['python', 'main.py', true],
			['markdown', 'README.md', true],
			['html', undefined, false]
		]);
	});
});

describe('extractArtifacts', () => {
	it('takes the largest matching fenced block for a single html file', () => {
		// arrange
		const response =
			'Sure!\n```html\n<p>small</p>\n```\n\n```html\n<!DOCTYPE html>\n<html><body>big</body></html>\n```\nDone.';

		// act
		const ex = extractArtifacts(single, response);

		// assume
		expect(ex.files).toHaveLength(1);
		expect(ex.files[0].content).toContain('big');
		expect(ex.method).toBe('fence-lang');
	});

	it('accepts a bare document without fences and cuts surrounding prose', () => {
		// act
		const ex = extractArtifacts(
			single,
			'Here you go:\n<!DOCTYPE html>\n<html><body>x</body></html>\nEnjoy!'
		);

		// assume
		expect(ex.method).toBe('raw-document');
		expect(ex.files[0].content.trim()).toBe('<!DOCTYPE html>\n<html><body>x</body></html>');
	});

	it('flags truncated output from an unclosed fence', () => {
		// act
		const ex = extractArtifacts(single, '```html\n<!DOCTYPE html>\n<html><body>unfinished');

		// assume
		expect(ex.files).toHaveLength(1);
		expect(ex.notes.join(' ')).toMatch(/truncated/);
	});

	it('maps several files by path and keeps named extras as undeclared', () => {
		// arrange
		const response =
			'```python path=main.py\nprint("hi")\n```\n```markdown README.md\n# Readme\n```\n```yaml path=config.yaml\na: 1\n```';

		// act
		const ex = extractArtifacts(multi, response);

		// assume
		expect(ex.files.map((f) => [f.path, f.declared, f.kind])).toEqual([
			['main.py', true, 'program'],
			['README.md', true, 'markdown'],
			['config.yaml', false, 'code']
		]);
		expect(ex.notes).toEqual([]);
	});

	it('reports missing required files, but not missing optional ones', () => {
		// act
		const ex = extractArtifacts(multi, '```python path=main.py\nx = 1\n```');

		// assume
		expect(ex.notes).toEqual(['missing required file: README.md']);
	});

	it('uses the whole response for text tests and strips leaked thinking', () => {
		// act
		const ex = extractArtifacts(text, '<think>plan the essay</think>\n# Essay\n\nBody.');

		// assume
		expect(ex.files[0].path).toBe('response.md');
		expect(ex.files[0].content).toBe('# Essay\n\nBody.\n');
		expect(ex.notes[0]).toMatch(/think/);
	});

	it('rejects extra files whose path would escape the artifacts directory', () => {
		// act
		const ex = extractArtifacts(
			multi,
			'```python path=main.py\nx=1\n```\n```markdown path=README.md\n#\n```\n```sh path=../../evil.sh\nrm -rf /\n```'
		);

		// assume
		expect(ex.files.map((f) => f.path)).toEqual(['main.py', 'README.md']);
	});
});

describe('stripThinking', () => {
	it('leaves content alone when there is no leading think block', () => {
		// act
		const r = stripThinking('plain <think> in the middle</think>');

		// assume
		expect(r.reasoning).toBeNull();
	});
});

describe('prompt building', () => {
	it('adds the output contract after blueprint and test system text', () => {
		// arrange
		const bp = {
			id: 'b',
			kind: 'dry-run' as const,
			tags: [],
			request: {},
			system_prompt: 'Be terse.'
		};

		// act
		const msgs = buildMessages(bp, { ...single, system: 'You are a web developer.' });

		// assume
		expect(msgs[0].role).toBe('system');
		expect(msgs[0].content.split('\n\n')).toEqual([
			'Be terse.',
			'You are a web developer.',
			outputInstructions(single)
		]);
		expect(msgs[1]).toEqual({ role: 'user', content: 'Build a page.' });
	});
});
