import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical.ts';

export function sha256(data: string | Uint8Array): string {
	return createHash('sha256').update(data).digest('hex');
}

/** Short, stable content hash of any JSON-able value. */
export function hashOf(value: unknown, length = 12): string {
	return sha256(canonicalJson(value)).slice(0, length);
}
