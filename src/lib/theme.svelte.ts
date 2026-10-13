import { browser } from '$app/env';

export type Theme = 'system' | 'light' | 'dark';
export const THEMES: Theme[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'duet-theme';

class ThemeStore {
	value = $state<Theme>('system');

	init() {
		if (!browser) return;
		const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
		this.value = saved && THEMES.includes(saved) ? saved : 'system';
		this.#apply();
	}

	set(theme: Theme) {
		this.value = theme;
		if (!browser) return;
		localStorage.setItem(STORAGE_KEY, theme);
		this.#apply();
	}

	/** Cycle system → light → dark → system. */
	cycle() {
		const next = THEMES[(THEMES.indexOf(this.value) + 1) % THEMES.length];
		this.set(next);
	}

	/** Resolve 'system' to the effective light/dark value for display. */
	get resolved(): 'light' | 'dark' {
		if (this.value !== 'system') return this.value;
		if (!browser) return 'light';
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}

	#apply() {
		document.documentElement.setAttribute('data-theme', this.value);
	}
}

export const theme = new ThemeStore();
