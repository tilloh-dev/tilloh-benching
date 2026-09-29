export function nowIso(): string {
	return new Date().toISOString();
}

/** Compact UTC stamp for ids: 2026-09-29T1012Z */
export function compactStamp(date = new Date()): string {
	const iso = date.toISOString();
	return `${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason);
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true }
		);
	});
}
