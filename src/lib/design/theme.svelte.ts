export type ThemeChoice = 'system' | 'dark' | 'light';

const KEY = 'benchyos.theme';

/** Theme follows the OS unless the person forces dark or light; the choice is remembered per browser. */
class Theme {
	choice = $state<ThemeChoice>('system');

	init() {
		try {
			const saved = localStorage.getItem(KEY) as ThemeChoice | null;
			if (saved === 'dark' || saved === 'light' || saved === 'system') this.choice = saved;
		} catch {
			/* storage unavailable */
		}
		this.#apply();
	}

	set(choice: ThemeChoice) {
		this.choice = choice;
		try {
			localStorage.setItem(KEY, choice);
		} catch {
			/* storage unavailable */
		}
		this.#apply();
	}

	/** system → dark → light → system */
	cycle() {
		this.set(this.choice === 'system' ? 'dark' : this.choice === 'dark' ? 'light' : 'system');
	}

	get resolved(): 'dark' | 'light' {
		if (this.choice !== 'system') return this.choice;
		return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches
			? 'light'
			: 'dark';
	}

	#apply() {
		const root = document.documentElement;
		if (this.choice === 'system') delete root.dataset.theme;
		else root.dataset.theme = this.choice;
	}
}

export const theme = new Theme();
