import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'parse5';
import type { CheckIssue } from '../core/schema.ts';
import { BrowserPool, ORIGIN, PageHangError, type PageSession } from './browser.ts';
import { artifactsOfKind, num, skipped, type CheckContext, type CheckImpl } from './types.ts';

// parse5 reports spec-level parse errors; these codes are cosmetic noise in practice.
const IGNORED_PARSE_ERRORS = new Set([
	'non-void-html-element-start-tag-with-trailing-solidus',
	'missing-doctype'
]);

type Node = {
	nodeName: string;
	tagName?: string;
	attrs?: { name: string; value: string }[];
	childNodes?: Node[];
	content?: Node;
};

function walk(node: Node, fn: (n: Node) => void) {
	fn(node);
	for (const c of node.childNodes ?? []) walk(c, fn);
	if (node.content) walk(node.content, fn);
}

export const htmlParse: CheckImpl = {
	id: 'html.parse',
	description: 'Strict HTML5 parse: doctype, document structure, parse errors, duplicate ids.',
	kinds: ['html'],
	async run(ctx) {
		const files = artifactsOfKind(ctx, ['html']);
		if (!files.length) return skipped('no HTML artifact');
		const issues: CheckIssue[] = [];
		const data: Record<string, unknown> = {};
		for (const art of files) {
			const file = art.path.replace(/^artifacts\//, '');
			const text = await readFile(join(ctx.attemptDir, art.path), 'utf8');
			const errors: CheckIssue[] = [];
			const doc = parse(text, {
				sourceCodeLocationInfo: true,
				onParseError: (e) => {
					if (IGNORED_PARSE_ERRORS.has(e.code)) return;
					if (errors.length < 50) {
						errors.push({
							check: 'html.parse',
							severity: 'warning',
							kind: `parse:${e.code}`,
							message: e.code,
							file,
							line: e.startLine,
							col: e.startCol
						});
					}
				}
			}) as unknown as Node;
			issues.push(...errors);
			const hasDoctype = /^\s*(<!--[\s\S]*?-->\s*)*<!doctype html/i.test(text);
			if (!hasDoctype)
				issues.push({
					check: 'html.parse',
					severity: 'warning',
					kind: 'missing-doctype',
					message: 'no <!DOCTYPE html>',
					file
				});
			for (const tag of ['html', 'head', 'body']) {
				if (!new RegExp(`<${tag}[\\s>]`, 'i').test(text)) {
					issues.push({
						check: 'html.parse',
						severity: 'warning',
						kind: `missing-${tag}`,
						message: `no explicit <${tag}> element`,
						file
					});
				}
			}
			const ids = new Map<string, number>();
			let scripts = 0;
			let externals = 0;
			walk(doc, (n) => {
				const id = n.attrs?.find((a) => a.name === 'id')?.value;
				if (id) ids.set(id, (ids.get(id) ?? 0) + 1);
				if (n.tagName === 'script') scripts++;
				const src = n.attrs?.find(
					(a) => a.name === 'src' || (n.tagName === 'link' && a.name === 'href')
				)?.value;
				if (src && /^(https?:)?\/\//i.test(src)) externals++;
			});
			for (const [id, count] of ids) {
				if (count > 1)
					issues.push({
						check: 'html.parse',
						severity: 'warning',
						kind: 'duplicate-id',
						message: `id "${id}" used ${count}×`,
						file
					});
			}
			if (externals)
				issues.push({
					check: 'html.parse',
					severity: 'warning',
					kind: 'external-reference',
					message: `${externals} external script/style reference(s)`,
					file
				});
			data[file] = {
				bytes: text.length,
				lines: text.split('\n').length,
				scripts,
				doctype: hasDoctype
			};
		}
		return {
			status: issues.some((i) => i.severity !== 'info') ? 'warn' : 'pass',
			issues,
			evidence: [],
			data
		};
	}
};

type Step =
	| { click: string | [number, number] }
	| { press: string }
	| { move: [number, number] }
	| { drag: [[number, number], [number, number]] }
	| { type: string }
	| { wait: number }
	| { scroll: number }
	| { screenshot: string };

async function runStep(
	ctx: CheckContext,
	page: import('playwright').Page,
	step: Step,
	shots: { label: string; data: Buffer }[]
) {
	if ('click' in step) {
		if (typeof step.click === 'string') await page.click(step.click, { timeout: 3000 });
		else await page.mouse.click(step.click[0], step.click[1]);
	} else if ('press' in step) await page.keyboard.press(step.press);
	else if ('move' in step) await page.mouse.move(step.move[0], step.move[1], { steps: 8 });
	else if ('drag' in step) {
		const [[x1, y1], [x2, y2]] = step.drag;
		await page.mouse.move(x1, y1);
		await page.mouse.down();
		await page.mouse.move(x2, y2, { steps: 12 });
		await page.mouse.up();
	} else if ('type' in step) await page.keyboard.type(step.type, { delay: 20 });
	else if ('wait' in step) await page.waitForTimeout(Math.min(step.wait, 15_000));
	else if ('scroll' in step) await page.mouse.wheel(0, step.scroll);
	else if ('screenshot' in step)
		shots.push({ label: step.screenshot, data: await page.screenshot() });
	ctx.signal.throwIfAborted();
}

export const htmlRender: CheckImpl = {
	id: 'html.render',
	description:
		'Loads the page in headless Chromium with the network blocked; records errors and screenshots.',
	kinds: ['html'],
	async run(ctx) {
		const art = artifactsOfKind(ctx, ['html'])[0];
		if (!art) return skipped('no HTML artifact');
		const file = art.path.replace(/^artifacts\//, '');
		const viewport = {
			width: num((ctx.options.viewport as { width?: number })?.width, 1280),
			height: num((ctx.options.viewport as { height?: number })?.height, 800)
		};
		const times = (Array.isArray(ctx.options.screenshots) ? ctx.options.screenshots : [400, 2500])
			.map((t) => num(t, 1000))
			.sort((a, b) => a - b);
		const steps = (
			Array.isArray(ctx.options.interactions) ? ctx.options.interactions : []
		) as Step[];
		const issues: CheckIssue[] = [];
		const shots: { label: string; data: Buffer }[] = [];
		let data: Record<string, unknown> = {};

		const holder: { s?: PageSession; hung?: boolean } = {};
		try {
			await ctx.browser.withPage(
				{
					mounts: { '/artifact/': join(ctx.attemptDir, 'artifacts') },
					viewport,
					timeoutMs: num(ctx.options.timeout_ms, 90_000)
				},
				async (s) => {
					holder.s = s;
					const started = performance.now();
					try {
						await s.page.goto(`${ORIGIN}/artifact/${file}`, {
							waitUntil: 'load',
							timeout: num(ctx.options.load_timeout_ms, 15_000)
						});
					} catch (e) {
						issues.push({
							check: 'html.render',
							severity: 'error',
							kind: 'load-timeout',
							message: (e as Error).message.split('\n')[0]
						});
					}
					data.load_ms = Math.round(performance.now() - started);
					let elapsed = 0;
					for (const t of times) {
						await s.page.waitForTimeout(Math.max(0, t - elapsed));
						elapsed = t;
						shots.push({ label: `t=${t}ms`, data: await s.page.screenshot() });
					}
					for (const step of steps) {
						try {
							await runStep(ctx, s.page, step, shots);
						} catch (e) {
							if (holder.hung) return;
							issues.push({
								check: 'html.render',
								severity: 'warning',
								kind: 'interaction-failed',
								message: `${JSON.stringify(step)}: ${(e as Error).message.split('\n')[0]}`
							});
						}
					}
					if (steps.length && !steps.some((st) => 'screenshot' in st))
						shots.push({ label: 'after interactions', data: await s.page.screenshot() });
					const info = await BrowserPool.evaluateWithin(s.page, () => {
						const body = document.body;
						const text = (body?.innerText ?? '').trim();
						const visual = document.querySelectorAll('canvas, svg, img, video').length;
						return {
							title: document.title,
							dom_nodes: document.getElementsByTagName('*').length,
							text_chars: text.length,
							visual_elements: visual,
							canvases: document.querySelectorAll('canvas').length,
							blank: text.length === 0 && visual === 0
						};
					});
					data = { ...data, ...(info ?? {}) };
				}
			);
		} catch (e) {
			if (!(e instanceof PageHangError)) throw e;
			holder.hung = true;
			issues.push({
				check: 'html.render',
				severity: 'error',
				kind: 'page-hang',
				message: e.message
			});
		}
		const s = holder.s;
		if (s) {
			for (const m of s.pageErrors)
				issues.push({ check: 'html.render', severity: 'error', kind: 'pageerror', message: m });
			for (const m of s.consoleErrors)
				issues.push({ check: 'html.render', severity: 'error', kind: 'console.error', message: m });
			for (const u of s.external)
				issues.push({
					check: 'html.render',
					severity: 'warning',
					kind: 'external-request',
					message: `blocked: ${u}`
				});
			for (const p of s.missing)
				issues.push({
					check: 'html.render',
					severity: 'warning',
					kind: 'missing-resource',
					message: `not delivered: ${p}`
				});
			data.console_warnings = s.consoleWarnings.slice(0, 20);
		}
		if (data.blank)
			issues.push({
				check: 'html.render',
				severity: 'warning',
				kind: 'blank-page',
				message: 'page renders no text and no visual elements'
			});

		// Final state first: it becomes the thumbnail.
		const evidence = [];
		for (const [i, shot] of [...shots].reverse().entries()) {
			evidence.push(
				await ctx.saveEvidence(
					`html-render-${shots.length - 1 - i}.png`,
					shot.data,
					'image',
					`Screenshot ${shot.label}`
				)
			);
		}
		const status = issues.some((i) => i.severity === 'error')
			? 'fail'
			: issues.some((i) => i.severity === 'warning')
				? 'warn'
				: 'pass';
		return { status, issues, evidence, data };
	}
};
