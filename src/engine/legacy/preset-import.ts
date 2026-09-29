import { join } from 'node:path';
import type { Workspace } from '../core/workspace.ts';
import { saveBlueprint } from '../core/library.ts';
import { ID_PATTERN, type Scalar } from '../core/schema.ts';
import { exists } from '../util/fs.ts';
import { PATH_KEYS, iniValue, parseIni } from '../llama/preset.ts';

export function sanitizeId(name: string): string {
	const id = name
		.trim()
		.replace(/[^A-Za-z0-9._-]+/g, '-')
		.replace(/^[^A-Za-z0-9]+/, '')
		.slice(0, 96);
	return ID_PATTERN.test(id) ? id : `bp-${id || 'unnamed'}`;
}

/** Everything up to and including the models directory, on Linux and Windows layouts. */
const MODELS_DIR_PREFIX = /^(?:[A-Za-z]:)?[\\/].*?[\\/]llama\.cpp[\\/]models[\\/]/;

/**
 * One router-preset [section] → llama-cpp blueprint fields. With `relative`,
 * model paths lose their host-specific prefix and resolve against
 * llama.models_dir — the same blueprint then works on every host.
 */
export function sectionToServer(
	keys: Record<string, string>,
	home?: string,
	relative = false
): Record<string, Scalar> {
	const server: Record<string, Scalar> = {};
	for (const [k, raw] of Object.entries(keys)) {
		if (k === 'alias') continue;
		let v = home ? raw.replace(/\/home\/USER\b/g, home) : raw;
		if (relative && PATH_KEYS.has(k)) v = v.replace(MODELS_DIR_PREFIX, '');
		server[k] = iniValue(v);
	}
	return server;
}

export async function importPreset(
	ws: Workspace,
	ini: string,
	o: {
		sections?: string[];
		prefix?: string;
		tags?: string[];
		overwrite?: boolean;
		home?: string;
		relative?: boolean;
		source: string;
	}
): Promise<{ created: string[]; skipped: string[] }> {
	const sections = parseIni(ini);
	const created: string[] = [];
	const skipped: string[] = [];
	for (const [name, keys] of Object.entries(sections)) {
		if (o.sections && !o.sections.includes(name)) continue;
		if (!keys.model) continue;
		const id = sanitizeId(`${o.prefix ?? ''}${name}`);
		if (!o.overwrite && (await exists(join(ws.blueprints, `${id}.yaml`)))) {
			skipped.push(id);
			continue;
		}
		await saveBlueprint(ws, {
			id,
			label: name,
			kind: 'llama-cpp',
			tags: ['local', 'llama.cpp', ...(o.tags ?? [])],
			server: sectionToServer(keys, o.home, o.relative),
			origin: { source: o.source, note: `router preset section [${name}]` }
		});
		created.push(id);
	}
	return { created, skipped };
}
