import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CheckIssue } from '../core/schema.ts';
import { artifactsOfKind, skipped, type CheckImpl } from './types.ts';

/** Implicit first check: did the model deliver what the test asked for? */
export const outputFiles: CheckImpl = {
	id: 'output.files',
	description: 'Declared files are present; flags truncation and undeclared extras.',
	kinds: [],
	async run(ctx) {
		const issues: CheckIssue[] = [];
		const present = new Set(ctx.artifacts.map((a) => a.path.replace(/^artifacts\//, '')));
		for (const f of ctx.test.output.files) {
			if (f.required !== false && !present.has(f.path) && ctx.test.output.mode !== 'text') {
				issues.push({
					check: 'output.files',
					severity: 'error',
					kind: 'missing-file',
					message: `required file not delivered: ${f.path}`
				});
			}
		}
		for (const note of ctx.extractionNotes) {
			if (/truncated/.test(note))
				issues.push({
					check: 'output.files',
					severity: 'warning',
					kind: 'truncated',
					message: note
				});
			else if (/missing required/.test(note)) continue;
			else
				issues.push({ check: 'output.files', severity: 'info', kind: 'extraction', message: note });
		}
		for (const a of ctx.artifacts) {
			if (!a.declared)
				issues.push({
					check: 'output.files',
					severity: 'info',
					kind: 'extra-file',
					message: `extra file: ${a.path.replace(/^artifacts\//, '')}`
				});
			if (a.bytes === 0)
				issues.push({
					check: 'output.files',
					severity: 'error',
					kind: 'empty-file',
					message: `empty file: ${a.path}`
				});
		}
		const status = issues.some((i) => i.severity === 'error')
			? 'fail'
			: issues.some((i) => i.severity === 'warning')
				? 'warn'
				: 'pass';
		return { status, issues, evidence: [], data: { files: [...present] } };
	}
};

export const jsonParse: CheckImpl = {
	id: 'json.parse',
	description: 'Every JSON artifact parses.',
	kinds: ['json'],
	async run(ctx) {
		const files = artifactsOfKind(ctx, ['json']);
		if (!files.length) return skipped('no JSON artifact');
		const issues: CheckIssue[] = [];
		for (const art of files) {
			try {
				JSON.parse(await readFile(join(ctx.attemptDir, art.path), 'utf8'));
			} catch (e) {
				issues.push({
					check: 'json.parse',
					severity: 'error',
					kind: 'json',
					message: (e as Error).message,
					file: art.path
				});
			}
		}
		return { status: issues.length ? 'fail' : 'pass', issues, evidence: [] };
	}
};

export const textStats: CheckImpl = {
	id: 'text.stats',
	description: 'Word, heading and code-block counts for prose answers (informational).',
	kinds: ['markdown', 'text'],
	async run(ctx) {
		const files = artifactsOfKind(ctx, ['markdown', 'text']);
		if (!files.length) return skipped('no text artifact');
		const data: Record<string, unknown> = {};
		const issues: CheckIssue[] = [];
		const min = typeof ctx.options.min_words === 'number' ? ctx.options.min_words : 0;
		const max = typeof ctx.options.max_words === 'number' ? ctx.options.max_words : Infinity;
		for (const art of files) {
			const text = await readFile(join(ctx.attemptDir, art.path), 'utf8');
			const words = (text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
			const stats = {
				words,
				lines: text.split('\n').length,
				headings: (text.match(/^#{1,6}\s/gm) ?? []).length,
				code_blocks: Math.floor((text.match(/^```/gm) ?? []).length / 2),
				list_items: (text.match(/^\s*([-*+]|\d+\.)\s/gm) ?? []).length
			};
			data[art.path] = stats;
			if (words < min)
				issues.push({
					check: 'text.stats',
					severity: 'warning',
					kind: 'too-short',
					message: `${words} words, expected at least ${min}`
				});
			if (words > max)
				issues.push({
					check: 'text.stats',
					severity: 'warning',
					kind: 'too-long',
					message: `${words} words, expected at most ${max}`
				});
		}
		return { status: issues.length ? 'warn' : 'pass', issues, evidence: [], data };
	}
};
