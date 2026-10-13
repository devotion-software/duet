<script lang="ts">
	import Modal from '#lib/components/ui/Modal.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { parseImport, type GroupAs } from '#lib/parseImport';
	import { parseChecklist } from '#lib/parseChecklist';
	import { toasts } from '#lib/components/ui/toast.svelte';

	interface Props {
		open: boolean;
		initialText?: string;
		onImport: (text: string, groupAs: GroupAs) => Promise<number>;
	}
	let { open = $bindable(), initialText = '', onImport }: Props = $props();

	let text = $state('');
	let groupAs = $state<GroupAs>('category');
	let busy = $state(false);
	let fileInput = $state<HTMLInputElement>();

	$effect(() => {
		if (open) text = initialText;
	});

	const result = $derived(parseImport(text, groupAs));
	const parsed = $derived(result.items);
	// Group of each item, for the preview headers (independent of `groupAs`).
	const itemGroups = $derived(
		result.kind === 'checklist' ? parseChecklist(text).map((p) => p.group) : []
	);

	const GROUP_OPTIONS: { value: GroupAs; label: string }[] = [
		{ value: 'category', label: 'Categories' },
		{ value: 'tag', label: 'Tags' },
		{ value: 'none', label: 'Ignore' }
	];
	const doneCount = $derived(parsed.filter((p) => p.completed).length);

	async function loadFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			text = await file.text();
		} catch {
			toasts.error('Could not read that file');
		}
	}

	async function run() {
		if (!parsed.length || busy) return;
		busy = true;
		try {
			const count = await onImport(text, groupAs);
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

<Modal bind:open title="Import tasks" subtitle="Paste a checklist or load a Duet JSON export" size="lg">
	<div class="import">
		<textarea
			bind:value={text}
			placeholder={'- [ ] Design the landing page\n- [x] Set up the repo\n* Write tests\n1. Ship it'}
			rows="8"
		></textarea>

		{#if result.groups.length}
			<div class="grouping">
				<span>
					Found {result.groups.length} heading{result.groups.length === 1 ? '' : 's'}. Apply them as
				</span>
				<div class="segmented">
					{#each GROUP_OPTIONS as o (o.value)}
						<button type="button" class="seg" class:sel={groupAs === o.value} onclick={() => (groupAs = o.value)}>
							{o.label}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<div class="preview">
			<div class="preview-head">
				<span>Preview</span>
				{#if parsed.length}
					<span class="counts">
						{#if result.kind === 'json'}JSON export · {/if}{parsed.length} tasks · {doneCount} done
					</span>
				{/if}
			</div>
			<div class="preview-list">
				{#if parsed.length === 0}
					<p class="empty"><Icon name="clipboard" size={16} /> Paste or type above to see tasks here.</p>
				{:else}
					{#each parsed.slice(0, 50) as item, i (i)}
						{#if itemGroups[i] && itemGroups[i] !== itemGroups[i - 1]}
							<div class="pgroup">
								{#if groupAs !== 'none'}<Icon name={groupAs === 'tag' ? 'tag' : 'folder'} size={12} />{/if}
								{itemGroups[i]}
							</div>
						{/if}
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
		<input
			bind:this={fileInput}
			type="file"
			accept=".json,.md,.txt,application/json,text/plain,text/markdown"
			hidden
			onchange={loadFile}
		/>
		<Button variant="ghost" icon="upload" onclick={() => fileInput?.click()}>Choose file…</Button>
		<span class="spacer"></span>
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
	.grouping {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-3);
		font-size: var(--text-sm);
		color: var(--text-muted);
	}
	.segmented {
		display: inline-flex;
		background: var(--surface-inset);
		border-radius: var(--radius-md);
		padding: 3px;
		gap: 2px;
	}
	.seg {
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		transition: all var(--transition-fast);
	}
	.seg:hover {
		color: var(--text);
	}
	.seg.sel {
		background: var(--surface-raised);
		color: var(--text);
		box-shadow: var(--shadow-xs);
	}
	.pgroup {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-2) var(--space-1);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-muted);
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
	.spacer {
		flex: 1;
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
