/** Briefly remembers which copy button last succeeded, so it can swap its icon for a tick. */
export class Copied<K = true> {
	current = $state<K | null>(null);
	#timer: ReturnType<typeof setTimeout> | undefined;

	mark(key: K) {
		this.current = key;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.current = null), 1500);
	}

	/** `copy` when idle, `check` while the copy of `key` is fresh. */
	icon(key: K) {
		return this.current === key ? ('check' as const) : ('copy' as const);
	}
}
