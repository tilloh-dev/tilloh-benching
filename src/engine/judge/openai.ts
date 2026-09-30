import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BenchTest, JudgeProfile, Verdict as VerdictType } from '../core/schema.ts';
import { Verdict } from '../core/schema.ts';
import { kindForPath, kindInfo } from '../core/kinds.ts';
import { exists, walkFiles } from '../util/fs.ts';
import { CHARTER, verdictSchema } from './charter.ts';

/**
 * Judge through any OpenAI-compatible chat API. It cannot use tools, so the
 * blind workspace is packed into one message: task, criteria, check results,
 * the submission's text files and the screenshots as images.
 */

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

const MAX_IMAGES = 8;

export async function buildJudgeMessages(o: {
	dir: string;
	profile: JudgeProfile;
	test: BenchTest;
	hasReasoning: boolean;
}): Promise<{ system: string; parts: Part[] }> {
	const read = (rel: string) => readFile(join(o.dir, rel), 'utf8').catch(() => '');
	let budget = o.profile.max_chars ?? 120_000;
	const take = (label: string, text: string): string => {
		if (budget <= 0) return `## ${label}\n\n(omitted: text budget exhausted)\n`;
		const cut = text.length > budget ? text.slice(0, budget) + '\n… (truncated)' : text;
		budget -= cut.length;
		return `## ${label}\n\n\`\`\`\n${cut}\n\`\`\`\n`;
	};
	const parts: Part[] = [];
	const text: string[] = [
		await read('TASK.md'),
		'## CRITERIA.json\n\n```json\n' + (await read('CRITERIA.json')) + '\n```\n',
		await read('CHECKS.md')
	];
	const files = (await walkFiles(join(o.dir, 'submission'))).filter(
		(f) => kindInfo(kindForPath(f)).textual
	);
	for (const f of files) text.push(take(`submission/${f}`, await read(`submission/${f}`)));
	const response = await read('response.md');
	if (response && !files.includes('response.md'))
		text.push(take('response.md (the full model answer)', response));
	if (o.hasReasoning)
		text.push(take('reasoning.md (intent only, never proof)', await read('reasoning.md')));
	parts.push({ type: 'text', text: text.join('\n\n') });

	if (o.profile.images !== false && (await exists(join(o.dir, 'evidence')))) {
		const images = (await walkFiles(join(o.dir, 'evidence')))
			.filter((f) => f.endsWith('.png'))
			.slice(0, MAX_IMAGES);
		for (const img of images) {
			const data = await readFile(join(o.dir, 'evidence', img));
			parts.push({ type: 'text', text: `Screenshot evidence/${img}:` });
			parts.push({
				type: 'image_url',
				image_url: { url: `data:image/png;base64,${data.toString('base64')}` }
			});
		}
	}
	parts.push({
		type: 'text',
		text: `Score every criterion (${o.test.judge.criteria.map((c) => c.id).join(', ')}) 0–10 as described. You cannot run the submission; judge from the code, the check results and the screenshots. Answer with one JSON object only.`
	});
	const system = `${CHARTER}\n\nYou have no tools in this setting: everything you may inspect is in the user message.`;
	return { system, parts };
}

/** Pulls the first JSON object out of a reply, tolerating code fences and prose around it. */
export function parseJsonReply(content: string): unknown {
	const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
	const raw = (fenced ? fenced[1] : content).trim();
	try {
		return JSON.parse(raw);
	} catch {
		const start = raw.indexOf('{');
		const end = raw.lastIndexOf('}');
		if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
		throw new Error('reply contains no JSON object');
	}
}

export async function judgeViaChat(o: {
	dir: string;
	profile: JudgeProfile;
	test: BenchTest;
	hasReasoning: boolean;
	signal: AbortSignal;
	timeoutMs: number;
}): Promise<{
	verdict?: VerdictType;
	error?: string;
	cost_usd?: number;
	usage?: Record<string, unknown>;
}> {
	const ep = o.profile.endpoint;
	if (!ep) return { error: 'judge profile has no endpoint' };
	const apiKey = ep.api_key_env ? process.env[ep.api_key_env] : undefined;
	if (ep.api_key_env && !apiKey)
		return { error: `API key ${ep.api_key_env} is not set (BenchyOS → Settings → API keys)` };
	const { system, parts } = await buildJudgeMessages(o);
	const schema = verdictSchema(o.test.judge.criteria);
	const call = async (responseFormat: unknown) => {
		const res = await fetch(ep.base_url.replace(/\/+$/, '') + '/chat/completions', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
				...ep.headers
			},
			body: JSON.stringify({
				...o.profile.request,
				model: o.profile.model,
				stream: false,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: parts }
				],
				response_format: responseFormat
			}),
			signal: AbortSignal.any([o.signal, AbortSignal.timeout(o.timeoutMs)])
		});
		return { status: res.status, body: await res.text() };
	};
	try {
		let r = await call({
			type: 'json_schema',
			json_schema: { name: 'verdict', strict: true, schema }
		});
		// Not every provider supports json_schema; json_object plus the schema in the prompt is the fallback.
		if (r.status === 400 || r.status === 422) {
			parts.push({
				type: 'text',
				text: `The JSON must match this schema:\n${JSON.stringify(schema)}`
			});
			r = await call({ type: 'json_object' });
		}
		if (r.status < 200 || r.status >= 300)
			return { error: `HTTP ${r.status}: ${r.body.slice(0, 600)}` };
		const data = JSON.parse(r.body) as {
			choices?: { message?: { content?: string } }[];
			usage?: Record<string, unknown> & { cost?: number };
		};
		const content = data.choices?.[0]?.message?.content ?? '';
		const parsed = Verdict.safeParse(parseJsonReply(content));
		if (!parsed.success)
			return {
				error: `verdict does not match the schema: ${parsed.error.message.slice(0, 500)}`,
				usage: data.usage
			};
		return {
			verdict: parsed.data,
			usage: data.usage,
			cost_usd: typeof data.usage?.cost === 'number' ? data.usage.cost : undefined
		};
	} catch (e) {
		return { error: `judge request failed: ${(e as Error).message}` };
	}
}
