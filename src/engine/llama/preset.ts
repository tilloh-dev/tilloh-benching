import { isAbsolute, join } from 'node:path';
import type { Blueprint, Scalar } from '../core/schema.ts';

/** Preset keys whose values are file paths (resolved against llama.models_dir if relative). */
export const PATH_KEYS = new Set([
	'model',
	'mmproj',
	'model-draft',
	'md',
	'chat-template-file',
	'lora',
	'control-vector',
	'model-vocoder'
]);

/** Keys BenchyOS owns (per server, not per model) or that would break the router's naming. */
export const RESERVED_KEYS = new Set([
	'host',
	'port',
	'alias',
	'models-preset',
	'models-max',
	'models-dir'
]);

function isAbsolutePathLike(p: string): boolean {
	return isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('//');
}

export function scalarToIni(v: Scalar): string {
	if (typeof v === 'boolean') return v ? 'true' : 'false';
	return String(v);
}

export type SectionOptions = {
	modelsDir?: string;
	/** Converts a POSIX path for the target binary (identity on Linux, wslpath -m for .exe). */
	hostPath?: (p: string) => Promise<string>;
};

export async function presetSection(
	bp: Blueprint,
	opts: SectionOptions = {}
): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(bp.server ?? {})) {
		if (RESERVED_KEYS.has(key)) continue;
		let v = scalarToIni(value);
		if (PATH_KEYS.has(key)) {
			if (!isAbsolutePathLike(v) && opts.modelsDir) v = join(opts.modelsDir, v);
			if (v.startsWith('/') && opts.hostPath) v = await opts.hostPath(v);
		}
		out[key] = v;
	}
	return out;
}

export function renderIni(
	sections: Record<string, Record<string, string>>,
	header?: string
): string {
	const lines: string[] = [];
	if (header) for (const l of header.split('\n')) lines.push(`# ${l}`);
	for (const [name, keys] of Object.entries(sections)) {
		if (lines.length) lines.push('');
		lines.push(`[${name}]`);
		for (const [k, v] of Object.entries(keys)) lines.push(`${k} = ${v}`);
	}
	return lines.join('\n') + '\n';
}

/** Parses a router preset INI (the format of tilloh-backup/llama.cpp/presets/models.ini). */
export function parseIni(text: string): Record<string, Record<string, string>> {
	const out: Record<string, Record<string, string>> = {};
	let current: Record<string, string> | null = null;
	for (const rawLine of text.split('\n')) {
		const line = rawLine.replace(/\r$/, '');
		if (/^\s*[#;]/.test(line) || !line.trim()) continue;
		const sec = /^\s*\[([^\]]+)\]/.exec(line);
		if (sec) {
			current = out[sec[1].trim()] = {};
			continue;
		}
		if (!current) continue;
		const eq = line.indexOf('=');
		if (eq < 0) continue;
		const key = line.slice(0, eq).trim();
		const value = line
			.slice(eq + 1)
			.replace(/\s+[#;].*$/, '')
			.trim();
		if (key) current[key] = value;
	}
	return out;
}

/** INI string → typed scalar, so imported blueprints read naturally in YAML. */
export function iniValue(v: string): Scalar {
	if (v === 'true') return true;
	if (v === 'false') return false;
	if (/^-?\d+$/.test(v) && v.length < 16) return Number(v);
	if (/^-?\d*\.\d+$/.test(v)) return Number(v);
	return v;
}
