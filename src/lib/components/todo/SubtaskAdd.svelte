<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';

	interface Props {
		onAdd: (title: string) => Promise<unknown> | void;
		/** Called on Escape, or on blur while empty. */
		onClose?: () => void;
		autofocus?: boolean;
		placeholder?: string;
	}
	let { onAdd, onClose, autofocus = false, placeholder = 'Add a subtask' }: Props = $props();

	let title = $state('');
	let input = $state<HTMLInputElement>();

	$effect(() => {
		if (autofocus) input?.focus();
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			const t = title.trim();
			if (!t) return;
			// Stay open for rapid entry of several subtasks.
			title = '';
			onAdd(t);
		} else if (e.key === 'Escape') {
			e.stopPropagation();
			title = '';
			onClose?.();
		}
	}
</script>

<div class="subtask-add">
	<Icon name="plus" size={14} />
	<input
		bind:this={input}
		bind:value={title}
		{onkeydown}
		onblur={() => !title.trim() && onClose?.()}
		{placeholder}
		aria-label={placeholder}
		autocomplete="off"
		maxlength="500"
	/>
</div>

<style>
	.subtask-add {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		color: var(--text-faint);
		border-radius: var(--radius-md);
	}
	.subtask-add:focus-within {
		color: var(--accent);
		background: var(--surface-hover);
	}
	input {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		outline: none;
		font-size: var(--text-sm);
		color: var(--text);
	}
	input::placeholder {
		color: var(--text-faint);
	}
</style>
