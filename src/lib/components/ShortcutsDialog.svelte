<script lang="ts">
	import Modal from '#lib/components/ui/Modal.svelte';
	import { SHORTCUTS } from '#lib/shortcuts';

	let { open = $bindable(false) }: { open: boolean } = $props();
</script>

<Modal bind:open title="Keyboard shortcuts" size="md">
	<div class="groups">
		{#each SHORTCUTS as group (group.title)}
			<section>
				<h3>{group.title}</h3>
				<dl>
					{#each group.items as item (item.label)}
						<div class="row">
							<dt>{item.label}</dt>
							<dd>
								{#each item.keys as key (key)}<kbd>{key}</kbd>{/each}
							</dd>
						</div>
					{/each}
				</dl>
			</section>
		{/each}
	</div>
</Modal>

<style>
	.groups {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	h3 {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-subtle);
		margin-bottom: var(--space-2);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-1-5, 0.375rem) 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.row:last-child {
		border-bottom: none;
	}
	dt {
		font-size: var(--text-sm);
		color: var(--text);
	}
	dd {
		display: flex;
		gap: var(--space-1);
		flex-shrink: 0;
	}
	kbd {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-muted);
		background: var(--surface-inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-xs);
		padding: 2px 7px;
		min-width: 24px;
		text-align: center;
	}
</style>
