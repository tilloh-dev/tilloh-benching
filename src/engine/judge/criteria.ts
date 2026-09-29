import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CriteriaSuggestion } from '../core/schema.ts';
import type { ResolvedSettings } from '../core/settings.ts';
import { runClaude } from '../util/claude.ts';

const SUGGEST_SYSTEM = `You design evaluation rubrics for BenchyOS, a benchmark that runs AI models against tasks and has an independent judge score each result per criterion on a 0–10 scale.

Write criteria that:
- together cover every explicit requirement of the task, grouped sensibly (not one criterion per bullet if bullets belong together);
- add quality dimensions the task implies (correctness, robustness, visual or writing quality, originality where the task asks for creativity);
- are observable: a judge reading the files, screenshots and logs (and, for interactive mode, using the result in a browser) can verify them;
- have short kebab-case ids, a title of a few words and a one- or two-sentence description of what earns a high score;
- carry weights 1–3 (3 = central to the task) and required: true only for hard requirements whose absence makes the result unusable.

Choose judge_mode "interactive" only when requirements can only be verified by using the result (clicking, typing, playing, running with other inputs); otherwise "static".
guidance: at most three sentences of judging notes (pitfalls to check, what to try).`;

const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		criteria: {
			type: 'array',
			minItems: 3,
			maxItems: 10,
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
					title: { type: 'string' },
					description: { type: 'string' },
					weight: { type: 'number', minimum: 1, maximum: 3 },
					required: { type: 'boolean' }
				},
				required: ['id', 'title', 'description', 'weight', 'required']
			}
		},
		judge_mode: { type: 'string', enum: ['static', 'interactive'] },
		guidance: { type: 'string' }
	},
	required: ['criteria', 'judge_mode', 'guidance']
};

export async function suggestCriteria(o: {
	settings: ResolvedSettings;
	title: string;
	prompt: string;
	output: string;
	model?: string;
	signal?: AbortSignal;
}): Promise<CriteriaSuggestion> {
	const cwd = await mkdtemp(join(tmpdir(), 'benchy-criteria-'));
	try {
		const r = await runClaude({
			bin: o.settings.judge.claude_bin,
			cwd,
			prompt: `Design the rubric for this benchmark task.\n\n# ${o.title}\n\n## Prompt given to the model\n\n${o.prompt}\n\n## Expected output\n\n${o.output}`,
			model: o.model ?? o.settings.judge.model,
			effort: 'high',
			tools: [],
			appendSystemPrompt: SUGGEST_SYSTEM,
			jsonSchema: SCHEMA,
			timeoutMs: 600_000,
			signal: o.signal
		});
		if (!r.json || r.json.is_error || !r.json.structured_output) {
			throw new Error(
				`criteria suggestion failed: ${r.json?.result ?? r.stderr.slice(0, 400) ?? 'no output'}`
			);
		}
		return CriteriaSuggestion.parse(r.json.structured_output);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
}
