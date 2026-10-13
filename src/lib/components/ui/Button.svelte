<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes, HTMLAnchorAttributes } from 'svelte/elements';
	import Icon, { type IconName } from './Icon.svelte';
	import Spinner from './Spinner.svelte';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger' | 'outline';
	type Size = 'sm' | 'md' | 'lg';

	interface Props {
		variant?: Variant;
		size?: Size;
		icon?: IconName;
		iconRight?: IconName;
		loading?: boolean;
		full?: boolean;
		href?: string;
		type?: 'button' | 'submit' | 'reset';
		children?: Snippet;
		class?: string;
		[key: string]: unknown;
	}

	let {
		variant = 'secondary',
		size = 'md',
		icon,
		iconRight,
		loading = false,
		full = false,
		href,
		type = 'button',
		children,
		class: klass = '',
		...rest
	}: Props = $props();

	const iconSize = $derived(size === 'sm' ? 15 : size === 'lg' ? 19 : 17);
</script>

{#snippet inner()}
	{#if loading}
		<Spinner size={iconSize} />
	{:else if icon}
		<Icon name={icon} size={iconSize} />
	{/if}
	{#if children}
		<span class="label"><!---->{@render children()}<!----></span>
	{/if}
	{#if iconRight && !loading}
		<Icon name={iconRight} size={iconSize} />
	{/if}
{/snippet}

{#if href}
	<a
		{href}
		class="btn {variant} {size} {klass}"
		class:full
		class:icon-only={!children}
		aria-busy={loading}
		{...rest as HTMLAnchorAttributes}
	>
		{@render inner()}
	</a>
{:else}
	<button
		{type}
		class="btn {variant} {size} {klass}"
		class:full
		class:icon-only={!children}
		disabled={loading || (rest.disabled as boolean)}
		aria-busy={loading}
		{...rest as HTMLButtonAttributes}
	>
		{@render inner()}
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		font-weight: var(--weight-medium);
		font-size: var(--text-base);
		line-height: 1;
		white-space: nowrap;
		border-radius: var(--radius-md);
		border: 1px solid transparent;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast),
			box-shadow var(--transition-fast),
			transform var(--transition-fast);
		user-select: none;
	}
	.btn:active {
		transform: translateY(0.5px) scale(0.99);
	}
	.btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
		pointer-events: none;
	}
	.label {
		display: inline-flex;
		align-items: center;
	}

	/* Sizes */
	.sm {
		height: 30px;
		padding: 0 var(--space-3);
		font-size: var(--text-sm);
		border-radius: var(--radius-sm);
	}
	.md {
		height: 38px;
		padding: 0 var(--space-4);
	}
	.lg {
		height: 46px;
		padding: 0 var(--space-5);
		font-size: var(--text-md);
	}
	.icon-only.sm {
		width: 30px;
		padding: 0;
	}
	.icon-only.md {
		width: 38px;
		padding: 0;
	}
	.icon-only.lg {
		width: 46px;
		padding: 0;
	}
	.full {
		width: 100%;
	}

	/* Variants */
	.primary {
		background: var(--accent);
		color: var(--accent-contrast);
		box-shadow: var(--shadow-xs);
	}
	.primary:hover:not(:disabled) {
		background: var(--accent-hover);
		box-shadow: var(--shadow-accent);
	}
	.primary:active {
		background: var(--accent-active);
	}

	.secondary {
		background: var(--surface);
		color: var(--text);
		border-color: var(--border-strong);
		box-shadow: var(--shadow-xs);
	}
	.secondary:hover:not(:disabled) {
		background: var(--surface-hover);
		border-color: var(--text-faint);
	}

	.outline {
		background: transparent;
		color: var(--text);
		border-color: var(--border-strong);
	}
	.outline:hover:not(:disabled) {
		background: var(--surface-hover);
	}

	.ghost {
		background: transparent;
		color: var(--text-muted);
	}
	.ghost:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text);
	}

	.subtle {
		background: var(--accent-soft);
		color: var(--accent-text);
	}
	.subtle:hover:not(:disabled) {
		background: color-mix(in oklab, var(--accent) 22%, var(--surface));
	}

	.danger {
		background: var(--danger);
		color: #fff;
	}
	.danger:hover:not(:disabled) {
		background: color-mix(in oklab, var(--danger), black 12%);
	}
</style>
