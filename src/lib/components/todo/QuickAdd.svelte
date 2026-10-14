<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';

	interface Props {
		onAdd: (title: string) => Promise<void> | void;
		onPasteMultiline?: (text: string) => void;
		disabled?: boolean;
		/** Match the project's glass style with a frosted, accent-tinted surface. */
		glass?: boolean;
	}
	let { onAdd, onPasteMultiline, disabled = false, glass = false }: Props = $props();

	let title = $state('');
	let busy = $state(false);
	let input: HTMLInputElement;

	async function submit() {
		const t = title.trim();
		if (!t || busy) return;
		busy = true;
		title = '';
		await onAdd(t);
		busy = false;
		input?.focus();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			submit();
		} else if (e.key === 'Escape') {
			input.blur();
		}
	}

	function onpaste(e: ClipboardEvent) {
		const text = e.clipboardData?.getData('text') ?? '';
		// Multi-line / checklist paste → offer bulk import instead of one task.
		if (onPasteMultiline && /\r?\n/.test(text.trim())) {
			e.preventDefault();
			onPasteMultiline(text);
		}
	}

	export function focus() {
		input?.focus();
	}
</script>

<div class="quick-add" class:disabled class:glass>
	<span class="qa-icon">
		{#if busy}<Spinner size={18} />{:else}<Icon name="plus" size={20} />{/if}
	</span>
	<input
		bind:this={input}
		bind:value={title}
		{onkeydown}
		{onpaste}
		{disabled}
		placeholder="Add a task — press Enter to save, paste a list to import"
		aria-label="Add a task"
		autocomplete="off"
		maxlength="500"
	/>
	{#if title.length > 400}
		<span class="char-count" class:limit={title.length >= 500}>{title.length}/500</span>
	{:else if title.trim()}
		<kbd>↵</kbd>
	{/if}
</div>

<style>
	.quick-add {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast);
	}
	.quick-add:focus-within {
		border-color: var(--accent);
		box-shadow:
			var(--shadow-sm),
			0 0 0 3px var(--accent-ring);
	}
	.quick-add.glass {
		background:
			radial-gradient(
				120% 220% at 0% 0%,
				color-mix(in oklab, var(--accent) 14%, transparent),
				transparent 60%
			),
			color-mix(in oklab, var(--surface) 60%, transparent);
		border-color: color-mix(in oklab, var(--accent) 22%, var(--border));
		backdrop-filter: blur(12px) saturate(1.4);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.25),
			var(--shadow-sm);
	}
	.quick-add.glass:focus-within {
		border-color: var(--accent);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.25),
			var(--shadow-sm),
			0 0 0 3px var(--accent-ring);
	}
	.quick-add.disabled {
		opacity: 0.6;
	}
	.qa-icon {
		display: inline-flex;
		color: var(--accent);
		flex-shrink: 0;
	}
	input {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		outline: none;
		font-size: var(--text-md);
		color: var(--text);
	}
	input::placeholder {
		color: var(--text-faint);
	}
	.char-count {
		flex-shrink: 0;
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--text-faint);
	}
	.char-count.limit {
		color: var(--danger);
	}
	kbd {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-subtle);
		background: var(--surface-inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-xs);
		padding: 2px 6px;
	}
</style>
