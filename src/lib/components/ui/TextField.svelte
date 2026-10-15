<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Icon, { type IconName } from './Icon.svelte';

	interface Props extends Omit<HTMLInputAttributes, 'size' | 'autofocus'> {
		value?: string;
		label?: string;
		hint?: string;
		error?: string;
		icon?: IconName;
		size?: 'sm' | 'md' | 'lg';
		autofocus?: boolean;
	}

	let {
		value = $bindable(''),
		label,
		hint,
		error,
		icon,
		size = 'md',
		id,
		class: klass = '',
		autofocus = false,
		...rest
	}: Props = $props();

	const generatedId = `f-${Math.random().toString(36).slice(2, 9)}`;
	const fieldId = $derived(id ?? generatedId);

	// Elements inserted after the initial HTML parse (e.g. inside a modal) don't
	// get native autofocus, so focus manually once this input mounts.
	function autofocusAction(node: HTMLInputElement, enabled: boolean | undefined) {
		if (enabled) {
			node.focus();
			node.select();
		}
	}
</script>

<div class="field {klass}">
	{#if label}
		<label for={fieldId}>{label}</label>
	{/if}
	<div class="control {size}" class:has-icon={icon} class:invalid={error}>
		{#if icon}
			<Icon name={icon} size={size === 'sm' ? 15 : 17} class="leading-icon" />
		{/if}
		<input
			id={fieldId}
			bind:value
			aria-invalid={!!error}
			use:autofocusAction={autofocus}
			{...rest}
		/>
	</div>
	{#if error}
		<span class="msg error">{error}</span>
	{:else if hint}
		<span class="msg hint">{hint}</span>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	label {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text-muted);
	}
	.control {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-xs);
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast),
			background-color var(--transition-fast);
	}
	.control:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.control.invalid {
		border-color: var(--danger);
	}
	.control.invalid:focus-within {
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--danger), transparent 72%);
	}
	:global(.control .leading-icon) {
		color: var(--text-subtle);
		flex-shrink: 0;
	}
	input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		color: var(--text);
		width: 100%;
	}
	input::placeholder {
		color: var(--text-faint);
	}
	.sm {
		padding: 0 var(--space-3);
		height: 32px;
		font-size: var(--text-sm);
	}
	.md {
		padding: 0 var(--space-3-5, 0.85rem);
		height: 40px;
	}
	.lg {
		padding: 0 var(--space-4);
		height: 48px;
		font-size: var(--text-md);
	}
	.has-icon.sm {
		padding-left: var(--space-2-5, 0.6rem);
	}
	.msg {
		font-size: var(--text-xs);
	}
	.msg.hint {
		color: var(--text-subtle);
	}
	.msg.error {
		color: var(--danger);
	}
</style>
