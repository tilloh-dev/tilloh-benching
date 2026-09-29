/** Serializes async work per key inside one process (e.g. read-modify-write of a JSON file). */
export class KeyedMutex {
	#tails = new Map<string, Promise<unknown>>();

	async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
		const prev = this.#tails.get(key) ?? Promise.resolve();
		let release!: () => void;
		const next = new Promise<void>((r) => (release = r));
		const tail = prev.then(() => next);
		this.#tails.set(key, tail);
		await prev.catch(() => undefined);
		try {
			return await fn();
		} finally {
			release();
			if (this.#tails.get(key) === tail) this.#tails.delete(key);
		}
	}
}

/** Minimal counting semaphore. */
export class Semaphore {
	#available: number;
	#waiters: (() => void)[] = [];

	constructor(size: number) {
		this.#available = Math.max(1, size);
	}

	async acquire(): Promise<() => void> {
		if (this.#available > 0) {
			this.#available--;
		} else {
			await new Promise<void>((r) => this.#waiters.push(r));
		}
		let released = false;
		return () => {
			if (released) return;
			released = true;
			const next = this.#waiters.shift();
			if (next) next();
			else this.#available++;
		};
	}

	async use<T>(fn: () => Promise<T>): Promise<T> {
		const release = await this.acquire();
		try {
			return await fn();
		} finally {
			release();
		}
	}
}
