import { browser } from '$app/env';

const STORAGE_KEY = 'duet-confirm-delete';

/** Whether deleting a single task asks first. Stored per device. */
class ConfirmDeleteStore {
	value = $state(true);

	constructor() {
		if (browser) this.value = localStorage.getItem(STORAGE_KEY) !== 'off';
	}

	set(on: boolean) {
		this.value = on;
		if (!browser) return;
		if (on) localStorage.removeItem(STORAGE_KEY);
		else localStorage.setItem(STORAGE_KEY, 'off');
	}
}

export const confirmDelete = new ConfirmDeleteStore();
