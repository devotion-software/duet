<script lang="ts">
	import Modal from '#lib/components/ui/Modal.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { parseChecklist } from '#lib/parseChecklist';
	import { toasts } from '#lib/components/ui/toast.svelte';

	interface Props {
		open: boolean;
		initialText?: string;
		onImport: (text: string) => Promise<number>;
	}
	let { open = $bindable(), initialText = '', onImport }: Props = $props();

	let text = $state('');
	let busy = $state(false);

	$effect(() => {
		if (open) text = initialText;
	});

	const parsed = $derived(parseChecklist(text));
	const doneCount = $derived(parsed.filter((p) => p.completed).length);

	async function run() {
		if (!parsed.length || busy) return;
		busy = true;
		try {
			const count = await onImport(text);
			toasts.success(`Imported ${count} task${count === 1 ? '' : 's'}`);
			open = false;
			text = '';
		} catch (e) {
			toasts.error((e as Error).message);
		} finally {
			busy = false;
		}
	}
</script>

<Modal bind:open title="Import tasks" subtitle="Paste a checklist — we'll detect checked items" size="lg">
	<div class="import">
		<textarea
			bind:value={text}
			placeholder={'- [ ] Design the landing page\n- [x] Set up the repo\n* Write tests\n1. Ship it'}
			rows="8"
		></textarea>

		<div class="preview">
			<div class="preview-head">
				<span>Preview</span>
				{#if parsed.length}
					<span class="counts">{parsed.length} tasks · {doneCount} done</span>
				{/if}
			</div>
			<div class="preview-list">
				{#if parsed.length === 0}
					<p class="empty"><Icon name="clipboard" size={16} /> Paste or type above to see tasks here.</p>
				{:else}
					{#each parsed.slice(0, 50) as item, i (i)}
						<div class="pitem" class:done={item.completed}>
							<span class="pcheck" class:on={item.completed}>
								{#if item.completed}<Icon name="check" size={11} strokeWidth={3} />{/if}
							</span>
							<span class="ptext">{item.title}</span>
						</div>
					{/each}
					{#if parsed.length > 50}
						<p class="more">+{parsed.length - 50} more…</p>
					{/if}
				{/if}
			</div>
		</div>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
		<Button variant="primary" icon="list-plus" loading={busy} disabled={!parsed.length} onclick={run}>
			Import {parsed.length || ''} task{parsed.length === 1 ? '' : 's'}
		</Button>
	{/snippet}
</Modal>

<style>
	.import {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-4);
	}
	textarea {
		width: 100%;
		min-height: 260px;
		resize: vertical;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
		color: var(--text);
		background: var(--surface-inset);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		padding: var(--space-3);
	}
	textarea:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.preview {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}
	.preview-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		background: var(--surface-2);
		border-bottom: 1px solid var(--border-subtle);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-muted);
	}
	.counts {
		color: var(--accent-text);
	}
	.preview-list {
		flex: 1;
		overflow-y: auto;
		max-height: 230px;
		padding: var(--space-2);
	}
	.empty {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-faint);
		font-size: var(--text-sm);
		padding: var(--space-4);
		justify-content: center;
	}
	.pitem {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-sm);
	}
	.pcheck {
		width: 16px;
		height: 16px;
		border-radius: var(--radius-full);
		border: 1.6px solid var(--border-strong);
		display: grid;
		place-items: center;
		color: var(--accent-contrast);
		flex-shrink: 0;
	}
	.pcheck.on {
		background: var(--accent);
		border-color: var(--accent);
	}
	.pitem.done .ptext {
		color: var(--text-subtle);
		text-decoration: line-through;
	}
	.ptext {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.more {
		color: var(--text-faint);
		font-size: var(--text-xs);
		padding: var(--space-2);
	}

	@media (max-width: 560px) {
		.import {
			grid-template-columns: 1fr;
		}
	}
</style>
