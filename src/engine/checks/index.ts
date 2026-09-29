import { join } from 'node:path';
import type {
	CheckResult,
	CheckSpec,
	CheckStatus,
	ChecksFile,
	EvidenceRef
} from '../core/schema.ts';
import { writeFileAtomic } from '../util/fs.ts';
import { nowIso } from '../util/time.ts';
import { htmlParse, htmlRender } from './html.ts';
import { jsonParse, outputFiles, textStats } from './misc.ts';
import { programRun } from './program.ts';
import { model3dRender, svgRender } from './visual.ts';
import type { CheckContext, CheckImpl } from './types.ts';
import { PageHangError } from './browser.ts';

/** Safety net per check; browser sessions and sandboxed programs have tighter limits of their own. */
const CHECK_TIMEOUT_MS = 240_000;

function withTimeout<T>(p: Promise<T>, ms: number, id: string): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	p.catch(() => undefined);
	return Promise.race([
		p,
		new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error(`${id} did not finish within ${ms / 1000} s`)), ms);
		})
	]).finally(() => clearTimeout(timer));
}

export const CHECKS: Record<string, CheckImpl> = Object.fromEntries(
	[
		outputFiles,
		htmlParse,
		htmlRender,
		svgRender,
		model3dRender,
		programRun,
		jsonParse,
		textStats
	].map((c) => [c.id, c])
);

export function listChecks() {
	return Object.values(CHECKS).map((c) => ({
		id: c.id,
		description: c.description,
		kinds: c.kinds
	}));
}

export function overallStatus(results: CheckResult[], hasArtifacts: boolean): CheckStatus {
	if (!hasArtifacts) return 'failed';
	if (results.some((r) => r.status === 'fail')) return 'broken';
	// A crashed check is an infrastructure problem, not proof the artifact is broken.
	if (results.some((r) => r.status === 'warn' || r.status === 'error')) return 'warnings';
	return 'ok';
}

export async function runChecks(
	base: Omit<CheckContext, 'options' | 'saveEvidence'>,
	specs: CheckSpec[],
	checksHash: string
): Promise<{ file: ChecksFile; evidence: EvidenceRef[] }> {
	const results: CheckResult[] = [];
	const evidence: EvidenceRef[] = [];
	const all: CheckSpec[] = [
		{ id: 'output.files', options: {} },
		...specs.filter((s) => s.id !== 'output.files')
	];
	for (const spec of all) {
		const impl = CHECKS[spec.id];
		const started = performance.now();
		if (!impl) {
			results.push({
				id: spec.id,
				status: 'error',
				duration_ms: 0,
				issues: [
					{
						check: spec.id,
						severity: 'error',
						kind: 'unknown-check',
						message: `unknown check "${spec.id}"`
					}
				],
				evidence: []
			});
			continue;
		}
		const ctx: CheckContext = {
			...base,
			options: spec.options,
			saveEvidence: async (name, data, kind, label) => {
				const rel = `evidence/${name}`;
				await writeFileAtomic(join(base.attemptDir, rel), data);
				const ref: EvidenceRef = { path: rel, kind, label, check: spec.id };
				evidence.push(ref);
				return ref;
			}
		};
		try {
			const r = await withTimeout(impl.run(ctx), CHECK_TIMEOUT_MS, spec.id);
			results.push({
				id: spec.id,
				duration_ms: Math.round(performance.now() - started),
				...r,
				issues: r.issues.map((i) => ({ ...i, check: i.check || spec.id }))
			});
		} catch (e) {
			if (e instanceof PageHangError) {
				// The artifact froze the browser: that is the artifact's fault, not the check's.
				results.push({
					id: spec.id,
					status: 'fail',
					duration_ms: Math.round(performance.now() - started),
					issues: [{ check: spec.id, severity: 'error', kind: 'page-hang', message: e.message }],
					evidence: []
				});
				continue;
			}
			results.push({
				id: spec.id,
				status: 'error',
				duration_ms: Math.round(performance.now() - started),
				issues: [
					{
						check: spec.id,
						severity: 'error',
						kind: 'check-crashed',
						message: (e as Error).message.split('\n')[0]
					}
				],
				evidence: []
			});
		}
	}
	return {
		file: {
			status: overallStatus(results, base.artifacts.length > 0),
			checks_hash: checksHash,
			finished_at: nowIso(),
			results
		},
		evidence
	};
}
