import type { BenchTest, Blueprint } from '../core/schema.ts';
import { languageForPath } from '../core/kinds.ts';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * The output contract Benchy adds so extraction is reliable across models.
 * Tests can replace it with `output.instructions`.
 */
export function outputInstructions(test: BenchTest, agentic = false): string {
	if (test.output.instructions) return test.output.instructions;
	const { mode, files } = test.output;
	// A prose answer stays a prose answer, even for an agent that could write files.
	if ((agentic && mode !== 'text') || mode === 'workspace') {
		const list = files.length
			? files.map((f) => `- \`${f.path}\`${f.description ? ` — ${f.description}` : ''}`).join('\n')
			: '- whatever files the task needs';
		return `Create the result as files in the current working directory:\n${list}\nDo not ask questions; finish the task in one go.`;
	}
	if (mode === 'text') {
		return 'Answer directly in Markdown. Do not wrap the whole answer in a code block.';
	}
	if (mode === 'single' && files.length === 1) {
		const f = files[0];
		const lang = languageForPath(f.path);
		return [
			`Deliver the complete file \`${f.path}\` in exactly one fenced code block (\`\`\`${lang}).`,
			'Do not split the file, do not abbreviate or elide any part of it, and do not add other code blocks.',
			'Text outside the code block is ignored.'
		].join(' ');
	}
	const list = files
		.map(
			(f) =>
				`- \`${f.path}\`${f.required === false ? ' (optional)' : ''}${f.description ? ` — ${f.description}` : ''}`
		)
		.join('\n');
	return [
		'Deliver every file below in its own fenced code block. Put the language and the path in the',
		'info string, for example ```python path=main.py. Always write complete files, never elide parts.',
		'',
		list
	].join('\n');
}

export function buildMessages(bp: Blueprint, test: BenchTest, agentic = false): ChatMessage[] {
	const system = [bp.system_prompt, test.system, outputInstructions(test, agentic)]
		.filter((s): s is string => !!s && s.trim().length > 0)
		.join('\n\n');
	let user = test.prompt;
	for (const input of test.inputs_resolved) {
		const lang = languageForPath(input.path);
		user += `\n\n### ${input.label}\n\n\`\`\`${lang}\n${input.content.replace(/\n$/, '')}\n\`\`\``;
	}
	const messages: ChatMessage[] = [];
	if (system) messages.push({ role: 'system', content: system });
	messages.push({ role: 'user', content: user });
	return messages;
}
