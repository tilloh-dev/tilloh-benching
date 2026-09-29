/** Isomorphic helpers: safe to import from the UI bundle. */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON with object keys sorted recursively, so equal data always serializes equally. */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortDeep);
	if (isPlainObject(value)) {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value).sort()) {
			const v = value[key];
			if (v !== undefined) out[key] = sortDeep(v);
		}
		return out;
	}
	return value;
}

/**
 * Deep merge used for blueprint `extends`: objects merge key by key, everything
 * else (arrays included) is replaced by the child value. `null` in the child
 * deletes the inherited key.
 */
export function deepMerge<T>(base: T, override: unknown): T {
	if (!isPlainObject(base) || !isPlainObject(override)) {
		return (override === undefined ? base : override) as T;
	}
	const out: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(override)) {
		if (value === undefined) continue;
		if (value === null) {
			delete out[key];
			continue;
		}
		out[key] = key in out ? deepMerge(out[key], value) : value;
	}
	return out as T;
}
