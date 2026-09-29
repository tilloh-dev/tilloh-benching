import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright';

/**
 * One headless Chromium shared by all checks of a process. Every check gets a
 * fresh context. Pages load from a virtual origin (http://benchy.local) served
 * from disk via request interception, so ES modules work and nothing real is
 * ever fetched: any other request is aborted and reported.
 */

export const ORIGIN = 'http://benchy.local';

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.htm': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.obj': 'text/plain; charset=utf-8',
	'.stl': 'application/octet-stream',
	'.gltf': 'model/gltf+json',
	'.glb': 'model/gltf-binary',
	'.ply': 'application/octet-stream',
	'.wasm': 'application/wasm',
	'.txt': 'text/plain; charset=utf-8'
};

export function mimeFor(path: string): string {
	return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export const threeRoot = dirname(dirname(fileURLToPath(import.meta.resolve('three'))));
export const assetsRoot = join(dirname(fileURLToPath(import.meta.url)), 'assets');

export type Mounts = Record<string, string>;

export class PageHangError extends Error {
	constructor(ms: number) {
		super(
			`page stopped responding (no progress for ${Math.round(ms / 1000)} s — main thread blocked?)`
		);
		this.name = 'PageHangError';
	}
}

export type PageSession = {
	page: Page;
	context: BrowserContext;
	external: string[];
	consoleErrors: string[];
	consoleWarnings: string[];
	pageErrors: string[];
	/** Local paths requested but not delivered (e.g. a style.css the model never wrote). */
	missing: string[];
};

export class BrowserPool {
	#browser: Promise<Browser> | null = null;

	async browser(): Promise<Browser> {
		this.#browser ??= chromium.launch({
			headless: true,
			args: [
				'--use-angle=swiftshader',
				'--enable-unsafe-swiftshader',
				'--autoplay-policy=no-user-gesture-required',
				'--disable-background-timer-throttling'
			]
		});
		return this.#browser;
	}

	/**
	 * Opens a page with the given mount points under the virtual origin. A page
	 * that blocks its main thread would hang every Playwright call forever, so
	 * the whole session is bounded: on timeout the context is torn down and
	 * PageHangError is thrown.
	 */
	async withPage<T>(
		opts: { mounts: Mounts; viewport?: { width: number; height: number }; timeoutMs?: number },
		fn: (s: PageSession) => Promise<T>
	): Promise<T> {
		const browser = await this.browser();
		const context = await browser.newContext({
			viewport: opts.viewport ?? { width: 1280, height: 800 },
			deviceScaleFactor: 1,
			serviceWorkers: 'block'
		});
		const session: PageSession = {
			page: null as unknown as Page,
			context,
			external: [],
			consoleErrors: [],
			consoleWarnings: [],
			pageErrors: [],
			missing: []
		};
		await context.route('**/*', (route) => handleRoute(route, opts.mounts, session));
		const page = await context.newPage();
		session.page = page;
		page.on('console', (msg) => {
			const text = msg.text().slice(0, 1000);
			if (msg.type() === 'error') session.consoleErrors.push(text);
			else if (msg.type() === 'warning') session.consoleWarnings.push(text);
		});
		page.on('pageerror', (err) =>
			session.pageErrors.push(`${err.name}: ${err.message}`.slice(0, 1000))
		);
		const timeoutMs = opts.timeoutMs ?? 90_000;
		let timer: NodeJS.Timeout | undefined;
		const work = fn(session);
		work.catch(() => undefined); // may reject after a timeout tore the context down
		const hang = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new PageHangError(timeoutMs)), timeoutMs);
		});
		try {
			return await Promise.race([work, hang]);
		} finally {
			clearTimeout(timer);
			const closed = await Promise.race([
				context.close().then(
					() => true,
					() => true
				),
				new Promise<boolean>((r) => setTimeout(() => r(false), 10_000))
			]);
			// A renderer that will not even close takes the whole browser with it.
			if (!closed) await this.close();
		}
	}

	/** page.evaluate that gives up instead of hanging on a blocked main thread. */
	static async evaluateWithin<R>(page: Page, fn: () => R, ms = 5000): Promise<R | null> {
		let timer: NodeJS.Timeout | undefined;
		const p = page.evaluate(fn);
		p.catch(() => undefined);
		try {
			return await Promise.race([
				p,
				new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)))
			]);
		} catch {
			return null;
		} finally {
			clearTimeout(timer);
		}
	}

	async close(): Promise<void> {
		if (!this.#browser) return;
		const b = await this.#browser.catch(() => null);
		this.#browser = null;
		await b?.close().catch(() => undefined);
	}
}

async function handleRoute(route: Route, mounts: Mounts, session: PageSession): Promise<void> {
	const url = new URL(route.request().url());
	if (url.origin !== ORIGIN) {
		if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
		session.external.push(route.request().url().slice(0, 300));
		return route.abort('blockedbyclient');
	}
	const path = decodeURIComponent(url.pathname);
	for (const [prefix, dir] of Object.entries(mounts)) {
		if (!path.startsWith(prefix)) continue;
		const rel = normalize(path.slice(prefix.length));
		if (rel.startsWith('..')) break;
		try {
			const body = await readFile(join(dir, rel));
			return route.fulfill({
				status: 200,
				body,
				headers: { 'content-type': mimeFor(rel), 'cache-control': 'no-store' }
			});
		} catch {
			if (!path.endsWith('/favicon.ico')) session.missing.push(path);
			return route.fulfill({ status: 404, body: 'not found' });
		}
	}
	if (!path.endsWith('/favicon.ico')) session.missing.push(path);
	return route.fulfill({ status: 404, body: 'not found' });
}
