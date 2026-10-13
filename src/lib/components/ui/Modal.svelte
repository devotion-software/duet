<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import Icon from './Icon.svelte';

	interface Props {
		open: boolean;
		title?: string;
		subtitle?: string;
		size?: 'sm' | 'md' | 'lg';
		onclose?: () => void;
		children: Snippet;
		footer?: Snippet;
	}
	let {
		open = $bindable(),
		title,
		subtitle,
		size = 'md',
		onclose,
		children,
		footer
	}: Props = $props();

	function close() {
		open = false;
		onclose?.();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}
</script>

<svelte:window on:keydown={open ? onkeydown : undefined} />

{#if open}
	<div class="overlay" transition:fade={{ duration: 160 }}>
		<button class="backdrop" aria-label="Close" onclick={close}></button>
		<div
			class="dialog {size}"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			transition:scale={{ duration: 200, start: 0.96, opacity: 0 }}
		>
			{#if title}
				<header class="dialog-head">
					<div class="titles">
						<h2>{title}</h2>
						{#if subtitle}<p>{subtitle}</p>{/if}
					</div>
					<button class="close" onclick={close} aria-label="Close">
						<Icon name="x" size={18} />
					</button>
				</header>
			{/if}
			<div class="dialog-body">
				{@render children()}
			</div>
			{#if footer}
				<footer class="dialog-foot">
					{@render footer()}
				</footer>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: max(5vh, var(--space-6)) var(--space-4) var(--space-6);
		overflow-y: auto;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		background: var(--overlay-bg);
		backdrop-filter: blur(3px);
		cursor: default;
	}
	.dialog {
		position: relative;
		width: 100%;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-xl);
		margin: auto;
	}
	.sm {
		max-width: 400px;
	}
	.md {
		max-width: 520px;
	}
	.lg {
		max-width: 680px;
	}
	.dialog-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-5) var(--space-5) var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
	}
	.titles h2 {
		font-size: var(--text-lg);
	}
	.titles p {
		color: var(--text-muted);
		font-size: var(--text-sm);
		margin-top: 2px;
	}
	.close {
		display: inline-flex;
		color: var(--text-subtle);
		padding: 6px;
		border-radius: var(--radius-sm);
		transition: all var(--transition-fast);
		flex-shrink: 0;
	}
	.close:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.dialog-body {
		padding: var(--space-5);
	}
	.dialog-foot {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5);
		border-top: 1px solid var(--border-subtle);
		background: var(--surface-2);
		border-radius: 0 0 var(--radius-xl) var(--radius-xl);
	}
</style>
