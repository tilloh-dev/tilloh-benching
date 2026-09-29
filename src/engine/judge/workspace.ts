import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Attempt, BenchTest, ChecksFile } from '../core/schema.ts';
import type { Workspace } from '../core/workspace.ts';
import { ensureDir, exists } from '../util/fs.ts';

/**
 * A neutral directory for one judgement. Nothing in it names the model, the
 * blueprint or the run, so the judge stays blind.
 */
export type JudgeWorkspace = { dir: string; hasReasoning: boolean; cleanup: () => Promise<void> };

export function taskMarkdown(test: BenchTest): string {
	const parts = [`# Task: ${test.title}`, ''];
	if (test.system) parts.push('## System instructions', '', test.system, '');
	parts.push('## Prompt', '', test.prompt, '');
	for (const input of test.inputs_resolved)
		parts.push(`### Input: ${input.label}`, '', '```', input.content, '```', '');
	parts.push('## Expected output', '');
	if (test.output.mode === 'text')
		parts.push('A direct answer (prose / Markdown). The answer is in submission/response.md.');
	else if (test.output.files.length) {
		for (const f of test.output.files)
			parts.push(
				`- \`${f.path}\`${f.required === false ? ' (optional)' : ''}${f.description ? ` — ${f.description}` : ''}`
			);
	} else parts.push('Files in submission/.');
	return parts.join('\n') + '\n';
}

export function checksMarkdown(checks: ChecksFile | null): string {
	if (!checks) return '# Automated checks\n\nNo automated checks were run.\n';
	const lines = ['# Automated checks', '', `Overall status: **${checks.status}**`, ''];
	for (const r of checks.results) {
		lines.push(`## ${r.id} — ${r.status}`);
		if (r.data && Object.keys(r.data).length)
			lines.push('', '```json', JSON.stringify(r.data, null, 1).slice(0, 3000), '```');
		const issues = r.issues.filter((i) => i.kind !== 'skipped' || r.status === 'skipped');
		if (issues.length) {
			lines.push('');
			for (const i of issues.slice(0, 40)) {
				const loc = i.file ? ` (${i.file}${i.line ? `:${i.line}` : ''})` : '';
				lines.push(`- [${i.severity}] ${i.kind}: ${i.message}${loc}`);
			}
			if (issues.length > 40) lines.push(`- … ${issues.length - 40} more`);
		}
		if (r.evidence.length)
			lines.push('', `Evidence: ${r.evidence.map((e) => `${e.path} (${e.label})`).join(', ')}`);
		lines.push('');
	}
	return lines.join('\n');
}

export async function buildJudgeWorkspace(o: {
	ws: Workspace;
	attempt: Attempt;
	attemptDir: string;
	test: BenchTest;
	checks: ChecksFile | null;
}): Promise<JudgeWorkspace> {
	// Outside the repository: Claude Code discovers CLAUDE.md and .claude/ by walking up from cwd.
	const base = join(tmpdir(), 'benchy-judge');
	await ensureDir(base);
	const dir = await mkdtemp(join(base, 'j-'));
	await writeFile(join(dir, 'TASK.md'), taskMarkdown(o.test));
	await writeFile(
		join(dir, 'CRITERIA.json'),
		JSON.stringify(
			{ guidance: o.test.judge.guidance ?? null, criteria: o.test.judge.criteria },
			null,
			2
		)
	);
	await writeFile(join(dir, 'CHECKS.md'), checksMarkdown(o.checks));
	const response = await readFile(join(o.attemptDir, 'response.md'), 'utf8').catch(() => '');
	await writeFile(join(dir, 'response.md'), response);
	let hasReasoning = false;
	if (o.test.judge.include_reasoning) {
		const reasoning = await readFile(join(o.attemptDir, 'reasoning.md'), 'utf8').catch(() => '');
		if (reasoning) {
			await writeFile(join(dir, 'reasoning.md'), reasoning);
			hasReasoning = true;
		}
	}
	await ensureDir(join(dir, 'submission'));
	if (await exists(join(o.attemptDir, 'artifacts'))) {
		await cp(join(o.attemptDir, 'artifacts'), join(dir, 'submission'), { recursive: true });
	}
	await ensureDir(join(dir, 'evidence'));
	if (await exists(join(o.attemptDir, 'evidence'))) {
		await cp(join(o.attemptDir, 'evidence'), join(dir, 'evidence'), { recursive: true });
	}
	return { dir, hasReasoning, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
