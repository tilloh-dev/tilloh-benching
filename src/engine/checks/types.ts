import type { ArtifactRef, BenchTest, CheckResult, EvidenceRef } from '../core/schema.ts';
import type { ResolvedSettings } from '../core/settings.ts';
import type { BrowserPool } from './browser.ts';

export type CheckContext = {
	test: BenchTest;
	attemptDir: string;
	artifacts: ArtifactRef[];
	extractionNotes: string[];
	options: Record<string, unknown>;
	settings: ResolvedSettings;
	browser: BrowserPool;
	signal: AbortSignal;
	/** Writes a file under evidence/ and returns its ref (path relative to the attempt dir). */
	saveEvidence: (
		name: string,
		data: string | Uint8Array,
		kind: EvidenceRef['kind'],
		label: string
	) => Promise<EvidenceRef>;
};

export type CheckImpl = {
	id: string;
	description: string;
	/** Artifact kinds this check looks at; empty means it inspects the attempt as a whole. */
	kinds: string[];
	run: (ctx: CheckContext) => Promise<Omit<CheckResult, 'id' | 'duration_ms'>>;
};

export function artifactsOfKind(ctx: CheckContext, kinds: string[]): ArtifactRef[] {
	const wanted = typeof ctx.options.file === 'string' ? `artifacts/${ctx.options.file}` : null;
	return ctx.artifacts.filter((a) => (wanted ? a.path === wanted : kinds.includes(a.kind)));
}

export function skipped(reason: string): Omit<CheckResult, 'id' | 'duration_ms'> {
	return {
		status: 'skipped',
		issues: [{ check: '', severity: 'info', kind: 'skipped', message: reason }],
		evidence: []
	};
}

export function num(v: unknown, fallback: number): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
