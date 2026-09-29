import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CheckIssue, EvidenceRef } from '../core/schema.ts';
import { extensionOf } from '../core/kinds.ts';
import { execCapture, which } from '../util/exec.ts';
import { ORIGIN, assetsRoot, threeRoot } from './browser.ts';
import { artifactsOfKind, num, skipped, type CheckImpl } from './types.ts';

export const svgRender: CheckImpl = {
	id: 'svg.render',
	description: 'Renders the SVG in Chromium; fails on XML errors.',
	kinds: ['svg'],
	async run(ctx) {
		const files = artifactsOfKind(ctx, ['svg']);
		if (!files.length) return skipped('no SVG artifact');
		const issues: CheckIssue[] = [];
		const evidence: EvidenceRef[] = [];
		const data: Record<string, unknown> = {};
		for (const art of files) {
			const file = art.path.replace(/^artifacts\//, '');
			await ctx.browser.withPage(
				{
					mounts: { '/artifact/': join(ctx.attemptDir, 'artifacts') },
					viewport: { width: 1000, height: 800 }
				},
				async (s) => {
					await s.page
						.goto(`${ORIGIN}/artifact/${file}`, { waitUntil: 'load', timeout: 10_000 })
						.catch((e) => {
							issues.push({
								check: 'svg.render',
								severity: 'error',
								kind: 'load-failed',
								message: (e as Error).message.split('\n')[0],
								file
							});
						});
					const info = await s.page.evaluate(() => {
						const root = document.documentElement;
						const isSvg = root.namespaceURI === 'http://www.w3.org/2000/svg';
						return {
							isSvg,
							elements: document.getElementsByTagName('*').length,
							error: isSvg ? null : (document.body?.innerText ?? '').slice(0, 400)
						};
					});
					if (!info.isSvg)
						issues.push({
							check: 'svg.render',
							severity: 'error',
							kind: 'xml-error',
							message: info.error || 'document is not SVG',
							file
						});
					for (const m of s.pageErrors)
						issues.push({
							check: 'svg.render',
							severity: 'error',
							kind: 'pageerror',
							message: m,
							file
						});
					for (const u of s.external)
						issues.push({
							check: 'svg.render',
							severity: 'warning',
							kind: 'external-request',
							message: `blocked: ${u}`,
							file
						});
					data[file] = { elements: info.elements };
					evidence.push(
						await ctx.saveEvidence(
							`svg-${evidence.length}.png`,
							await s.page.screenshot(),
							'image',
							`Rendered ${file}`
						)
					);
				}
			);
		}
		const status = issues.some((i) => i.severity === 'error')
			? 'fail'
			: issues.length
				? 'warn'
				: 'pass';
		return { status, issues, evidence, data };
	}
};

/** OpenSCAD source → STL (only if openscad is installed), so it can be rendered like the rest. */
async function scadToStl(
	source: string,
	timeoutMs: number
): Promise<{ stl?: Buffer; error?: string }> {
	const bin = await which('openscad');
	if (!bin) return { error: 'openscad not installed' };
	const dir = await mkdtemp(join(tmpdir(), 'benchy-scad-'));
	try {
		await writeFile(join(dir, 'model.scad'), source);
		const r = await execCapture(bin, ['-o', join(dir, 'model.stl'), join(dir, 'model.scad')], {
			timeoutMs
		});
		if (r.code !== 0) return { error: `openscad failed: ${r.stderr.slice(-800)}` };
		return { stl: await readFile(join(dir, 'model.stl')) };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

export const model3dRender: CheckImpl = {
	id: 'model3d.render',
	description:
		'Loads OBJ/STL/glTF/PLY (and OpenSCAD via openscad) with three.js and renders four views.',
	kinds: ['model3d'],
	async run(ctx) {
		const art = artifactsOfKind(ctx, ['model3d'])[0];
		if (!art) return skipped('no 3D model artifact');
		let file = art.path.replace(/^artifacts\//, '');
		let format = extensionOf(file);
		const issues: CheckIssue[] = [];
		const mounts: Record<string, string> = {
			'/artifact/': join(ctx.attemptDir, 'artifacts'),
			'/vendor/three/': threeRoot,
			'/assets/': assetsRoot
		};
		if (format === 'scad') {
			const conv = await scadToStl(
				await readFile(join(ctx.attemptDir, art.path), 'utf8'),
				num(ctx.options.timeout_ms, 60_000)
			);
			if (!conv.stl) {
				if (conv.error === 'openscad not installed')
					return skipped('OpenSCAD model, but openscad is not installed (apt install openscad)');
				return {
					status: 'fail',
					issues: [
						{
							check: 'model3d.render',
							severity: 'error',
							kind: 'scad-compile',
							message: conv.error!
						}
					],
					evidence: []
				};
			}
			const dir = await mkdtemp(join(tmpdir(), 'benchy-scad-out-'));
			await writeFile(join(dir, 'model.stl'), conv.stl);
			mounts['/converted/'] = dir;
			file = 'model.stl';
			format = 'stl';
		}
		const url = `${ORIGIN}/assets/model3d.html?file=${encodeURIComponent(mounts['/converted/'] ? `/converted/${file}` : `/artifact/${file}`)}&format=${format}`;
		const evidence: EvidenceRef[] = [];
		let stats: Record<string, unknown> | null = null;
		await ctx.browser.withPage({ mounts, viewport: { width: 900, height: 700 } }, async (s) => {
			await s.page.goto(url, { waitUntil: 'load', timeout: 20_000 });
			await s.page.waitForFunction(
				() => (window as unknown as { __benchy?: { ready: boolean } }).__benchy?.ready,
				null,
				{ timeout: 30_000 }
			);
			const state = await s.page.evaluate(
				() =>
					(
						window as unknown as {
							__benchy: {
								error: string | null;
								stats: Record<string, unknown> | null;
								views?: string[];
							};
						}
					).__benchy
			);
			if (state.error) {
				issues.push({
					check: 'model3d.render',
					severity: 'error',
					kind: 'load-failed',
					message: state.error,
					file
				});
				return;
			}
			stats = state.stats;
			if (stats?.empty)
				issues.push({
					check: 'model3d.render',
					severity: 'error',
					kind: 'empty-geometry',
					message: 'model contains no geometry',
					file
				});
			const views = state.views ?? [];
			// iso first: it becomes the thumbnail.
			const order = [3, 0, 1, 2].filter((i) => i < views.length);
			for (const i of order) {
				const name = await s.page.evaluate(
					(idx) => (window as unknown as { __view: (i: number) => string }).__view(idx),
					i
				);
				evidence.push(
					await ctx.saveEvidence(
						`model3d-${name}.png`,
						await s.page.screenshot(),
						'image',
						`3D view: ${name}`
					)
				);
			}
		});
		if (mounts['/converted/']) await rm(mounts['/converted/'], { recursive: true, force: true });
		const status = issues.some((i) => i.severity === 'error') ? 'fail' : 'pass';
		return { status, issues, evidence, data: stats ? { [file]: stats } : {} };
	}
};
