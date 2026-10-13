<script lang="ts">
	import Modal from '#lib/components/ui/Modal.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { confirmDelete } from '#lib/confirmDelete.svelte';
	import type { Todo } from '#lib/types';

	interface Props {
		/** The task awaiting confirmation; null keeps the dialog closed. */
		todo: Todo | null;
		subtasks: number;
		onConfirm: (todo: Todo) => void;
		onCancel: () => void;
	}
	let { todo, subtasks, onConfirm, onCancel }: Props = $props();

	let dontAsk = $state(false);
	let open = $state(false);
	$effect(() => {
		open = !!todo;
		if (todo) dontAsk = false;
	});

	function confirm() {
		if (!todo) return;
		if (dontAsk) confirmDelete.set(false);
		onConfirm(todo);
	}
</script>

<Modal bind:open title="Delete task?" size="sm" onclose={onCancel}>
	<p class="msg">
		<strong>{todo?.title}</strong>
		{#if subtasks}
			and its {subtasks} subtask{subtasks === 1 ? '' : 's'} will be permanently deleted.
		{:else}
			will be permanently deleted.
		{/if}
	</p>
	{#snippet footer()}
		<label class="dont-ask">
			<input type="checkbox" bind:checked={dontAsk} />
			Don't ask again
		</label>
		<span class="spacer"></span>
		<Button variant="ghost" onclick={onCancel}>Cancel</Button>
		<!-- svelte-ignore a11y_autofocus -->
		<Button variant="danger" icon="trash" onclick={confirm} autofocus>Delete</Button>
	{/snippet}
</Modal>

<style>
	.msg {
		color: var(--text-muted);
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.msg strong {
		color: var(--text);
		font-weight: var(--weight-medium);
	}
	.dont-ask {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-muted);
		cursor: pointer;
		user-select: none;
	}
	.dont-ask input {
		accent-color: var(--accent);
	}
	.spacer {
		flex: 1;
	}
</style>
