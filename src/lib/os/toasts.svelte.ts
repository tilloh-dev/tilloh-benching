export type Toast = {
	id: number;
	kind: 'info' | 'ok' | 'warn' | 'error';
	title: string;
	body?: string;
};

class Toasts {
	items = $state<Toast[]>([]);
	#n = 0;

	push(kind: Toast['kind'], title: string, body?: string, ms = 4500) {
		const id = ++this.#n;
		this.items.push({ id, kind, title, body });
		if (ms > 0) setTimeout(() => this.dismiss(id), ms);
		return id;
	}

	dismiss(id: number) {
		this.items = this.items.filter((t) => t.id !== id);
	}

	error(e: unknown, title = 'Something went wrong') {
		this.push('error', title, (e as Error)?.message ?? String(e), 8000);
	}
}

export const toasts = new Toasts();
