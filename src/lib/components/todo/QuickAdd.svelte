<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';

	interface Props {
		onAdd: (title: string) => Promise<void> | void;
		onPasteMultiline?: (text: string) => void;
		disabled?: boolean;
	}
	let { onAdd, onPasteMultiline, disabled = false }: Props = $props();

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

<div class="quick-add" class:disabled>
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
	/>
	{#if title.trim()}
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
