import type { Component } from 'svelte';

export type WinState = 'normal' | 'minimized' | 'maximized';
export type WinPhase = 'opening' | 'open' | 'closing' | 'minimizing' | 'restoring';

export type AppDef = {
	id: string;
	title: string;
	icon: string;
	component: Component<{ win: Win; props: Record<string, unknown> }>;
	size: { w: number; h: number };
	min?: { w: number; h: number };
	/** One window per app; otherwise one per `props.key`. */
	singleton: boolean;
	/** Hidden in the static export (editing / running). */
	liveOnly?: boolean;
	desktop?: boolean;
	description?: string;
};

export type Win = {
	id: string;
	app: string;
	key: string;
	title: string;
	subtitle?: string;
	icon: string;
	props: Record<string, unknown>;
	x: number;
	y: number;
	w: number;
	h: number;
	z: number;
	state: WinState;
	phase: WinPhase;
	/** Geometry before maximize. */
	restore?: { x: number; y: number; w: number; h: number };
};

const LAYOUT_KEY = 'benchy.layout.v1';

type Saved = Record<string, { x: number; y: number; w: number; h: number }>;

function loadLayout(): Saved {
	try {
		return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}');
	} catch {
		return {};
	}
}

function saveLayout(s: Saved) {
	try {
		localStorage.setItem(LAYOUT_KEY, JSON.stringify(s));
	} catch {
		/* storage unavailable */
	}
}

export function desktopBounds() {
	const top = 30; // --topbar-h
	const bottom = 36; // --taskbar-h
	return { x: 0, y: top, w: window.innerWidth, h: window.innerHeight - top - bottom };
}

class WindowManager {
	windows = $state<Win[]>([]);
	apps = new Map<string, AppDef>();
	#z = 10;
	#n = 0;
	#layout: Saved = {};

	register(defs: AppDef[]) {
		for (const d of defs) this.apps.set(d.id, d);
		this.#layout = loadLayout();
	}

	get focused(): Win | undefined {
		return this.windows
			.filter((w) => w.state !== 'minimized' && w.phase !== 'closing')
			.reduce<Win | undefined>((top, w) => (!top || w.z > top.z ? w : top), undefined);
	}

	#keyFor(def: AppDef, props: Record<string, unknown>): string {
		return def.singleton ? def.id : `${def.id}:${String(props.key ?? JSON.stringify(props))}`;
	}

	open(appId: string, props: Record<string, unknown> = {}, title?: string): Win | undefined {
		const def = this.apps.get(appId);
		if (!def) return undefined;
		const key = this.#keyFor(def, props);
		const existing = this.windows.find((w) => w.key === key && w.phase !== 'closing');
		if (existing) {
			existing.props = { ...existing.props, ...props };
			if (title) existing.title = title;
			if (existing.state === 'minimized') this.restore(existing.id);
			this.focus(existing.id);
			return existing;
		}
		const b = desktopBounds();
		const saved = this.#layout[def.id];
		// Keep the desktop icon column free on wide screens.
		const left = b.w > 1100 ? 208 : 12;
		const w = Math.min(saved?.w ?? def.size.w, b.w - left - 12);
		const h = Math.min(saved?.h ?? def.size.h, b.h - 24);
		const open = this.windows.filter((x) => x.state !== 'minimized').length;
		const cascade = (open % 6) * 28;
		const x =
			saved && !this.windows.some((o) => o.app === def.id)
				? saved.x
				: Math.max(left, Math.min(b.w - w - 12, left + (b.w - left - w) / 2 - 40 + cascade));
		const y =
			saved && !this.windows.some((o) => o.app === def.id)
				? saved.y
				: Math.max(b.y + 10, Math.min(b.y + b.h - h - 10, b.y + (b.h - h) / 2 - 40 + cascade));
		const win: Win = {
			id: `w${++this.#n}`,
			app: def.id,
			key,
			title: title ?? def.title,
			icon: def.icon,
			props,
			x,
			y,
			w,
			h,
			z: ++this.#z,
			state: 'normal',
			phase: 'opening'
		};
		this.windows.push(win);
		setTimeout(() => this.#setPhase(win.id, 'open'), 220);
		return this.windows[this.windows.length - 1];
	}

	#find(id: string): Win | undefined {
		return this.windows.find((w) => w.id === id);
	}

	#setPhase(id: string, phase: WinPhase) {
		const w = this.#find(id);
		if (w) w.phase = phase;
	}

	focus(id: string) {
		const w = this.#find(id);
		if (w && w.z !== this.#z) w.z = ++this.#z;
	}

	close(id: string) {
		const w = this.#find(id);
		if (!w) return;
		this.#remember(w);
		w.phase = 'closing';
		setTimeout(() => {
			this.windows = this.windows.filter((x) => x.id !== id);
		}, 170);
	}

	minimize(id: string) {
		const w = this.#find(id);
		if (!w || w.state === 'minimized') return;
		w.phase = 'minimizing';
		setTimeout(() => {
			const x = this.#find(id);
			if (x) {
				x.state = 'minimized';
				x.phase = 'open';
			}
		}, 260);
	}

	restore(id: string) {
		const w = this.#find(id);
		if (!w) return;
		if (w.state === 'minimized') {
			w.state = w.restore ? 'maximized' : 'normal';
			if (w.state === 'maximized' && !w.restore) w.state = 'normal';
			w.phase = 'restoring';
			setTimeout(() => this.#setPhase(id, 'open'), 260);
		}
		this.focus(id);
	}

	/** Taskbar click: focus, minimize if already focused, restore if minimized. */
	toggleFromTaskbar(id: string) {
		const w = this.#find(id);
		if (!w) return;
		if (w.state === 'minimized') this.restore(id);
		else if (this.focused?.id === id) this.minimize(id);
		else this.focus(id);
	}

	toggleMax(id: string) {
		const w = this.#find(id);
		if (!w) return;
		const b = desktopBounds();
		if (w.state === 'maximized') {
			const r = w.restore ?? { x: w.x, y: w.y, w: w.w, h: w.h };
			Object.assign(w, r);
			w.state = 'normal';
			w.restore = undefined;
		} else {
			w.restore = { x: w.x, y: w.y, w: w.w, h: w.h };
			Object.assign(w, { x: b.x + 6, y: b.y + 6, w: b.w - 12, h: b.h - 12 });
			w.state = 'maximized';
		}
		this.focus(id);
	}

	move(id: string, x: number, y: number) {
		const w = this.#find(id);
		if (!w) return;
		const b = desktopBounds();
		w.x = Math.max(-w.w + 120, Math.min(b.w - 120, x));
		w.y = Math.max(b.y, Math.min(b.y + b.h - 40, y));
	}

	resize(id: string, geom: { x?: number; y?: number; w?: number; h?: number }) {
		const w = this.#find(id);
		if (!w) return;
		const def = this.apps.get(w.app);
		const min = def?.min ?? { w: 360, h: 240 };
		if (geom.w !== undefined) w.w = Math.max(min.w, geom.w);
		if (geom.h !== undefined) w.h = Math.max(min.h, geom.h);
		if (geom.x !== undefined) w.x = geom.x;
		if (geom.y !== undefined) w.y = Math.max(desktopBounds().y, geom.y);
	}

	/** Snap by dragging to an edge: left/right half or maximize at the top. */
	snap(id: string, edge: 'left' | 'right' | 'top') {
		const w = this.#find(id);
		if (!w) return;
		const b = desktopBounds();
		w.restore = { x: w.x, y: w.y, w: w.w, h: w.h };
		if (edge === 'top') return this.toggleMax(id);
		const half = Math.floor(b.w / 2);
		Object.assign(w, { x: edge === 'left' ? 6 : half + 3, y: b.y + 6, w: half - 9, h: b.h - 12 });
		w.state = 'normal';
	}

	endInteraction(id: string) {
		const w = this.#find(id);
		if (w && w.state === 'normal') this.#remember(w);
	}

	#remember(w: Win) {
		if (w.state !== 'normal') return;
		this.#layout[w.app] = {
			x: Math.round(w.x),
			y: Math.round(w.y),
			w: Math.round(w.w),
			h: Math.round(w.h)
		};
		saveLayout(this.#layout);
	}

	setTitle(id: string, title: string, subtitle?: string) {
		const w = this.#find(id);
		if (!w) return;
		w.title = title;
		w.subtitle = subtitle;
	}

	closeAll() {
		for (const w of this.windows) this.close(w.id);
	}

	resetLayout() {
		this.#layout = {};
		saveLayout(this.#layout);
	}
}

export const wm = new WindowManager();
