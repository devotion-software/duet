<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { toasts } from './toast.svelte';
	import Icon, { type IconName } from './Icon.svelte';

	const ICON: Record<string, IconName> = {
		success: 'check-circle',
		error: 'alert-circle',
		warning: 'flag',
		info: 'sparkles'
	};
</script>

<div class="toaster" role="region" aria-live="polite" aria-label="Notifications">
	{#each toasts.items as toast (toast.id)}
		<div
			class="toast {toast.kind}"
			animate:flip={{ duration: 220 }}
			in:fly={{ y: 14, duration: 220 }}
			out:fade={{ duration: 160 }}
		>
			<Icon name={ICON[toast.kind]} size={17} />
			<span class="msg">{toast.message}</span>
			{#if toast.action}
				{@const action = toast.action}
				<button
					class="action"
					onclick={() => {
						toasts.dismiss(toast.id);
						action.run();
					}}
				>
					{action.label}
				</button>
			{/if}
			<button class="close" onclick={() => toasts.dismiss(toast.id)} aria-label="Dismiss">
				<Icon name="x" size={14} />
			</button>
		</div>
	{/each}
</div>

<style>
	.toaster {
		position: fixed;
		bottom: var(--space-5);
		right: var(--space-5);
		z-index: var(--z-toast);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-width: min(92vw, 380px);
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		color: var(--text);
		font-size: var(--text-sm);
	}
	.toast.success {
		border-left-color: var(--success);
		color: var(--text);
	}
	.toast.success :global(svg) {
		color: var(--success);
	}
	.toast.error {
		border-left-color: var(--danger);
	}
	.toast.error :global(svg) {
		color: var(--danger);
	}
	.toast.warning {
		border-left-color: var(--warning);
	}
	.toast.warning :global(svg) {
		color: var(--warning);
	}
	.toast.info :global(svg) {
		color: var(--accent);
	}
	.msg {
		flex: 1;
		line-height: var(--leading-snug);
	}
	.action {
		flex-shrink: 0;
		padding: 3px var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--accent);
		font-weight: 600;
		transition: all var(--transition-fast);
	}
	.action:hover {
		background: var(--surface-hover);
	}
	.close {
		display: inline-flex;
		color: var(--text-subtle);
		padding: 3px;
		border-radius: var(--radius-sm);
		transition: all var(--transition-fast);
	}
	.close:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
</style>
