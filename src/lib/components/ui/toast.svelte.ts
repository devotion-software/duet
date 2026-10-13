export type ToastKind = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
	id: number;
	kind: ToastKind;
	message: string;
	timeout: number;
}

let seq = 0;

class ToastStore {
	items = $state<Toast[]>([]);

	push(message: string, kind: ToastKind = 'info', timeout = 4000) {
		const id = ++seq;
		this.items.push({ id, kind, message, timeout });
		if (timeout > 0) setTimeout(() => this.dismiss(id), timeout);
		return id;
	}

	dismiss(id: number) {
		this.items = this.items.filter((t) => t.id !== id);
	}

	success(m: string, timeout?: number) {
		return this.push(m, 'success', timeout);
	}
	error(m: string, timeout = 6000) {
		return this.push(m, 'error', timeout);
	}
	info(m: string, timeout?: number) {
		return this.push(m, 'info', timeout);
	}
	warning(m: string, timeout?: number) {
		return this.push(m, 'warning', timeout);
	}
}

export const toasts = new ToastStore();
