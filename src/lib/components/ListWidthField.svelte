<script lang="ts">
	import Icon from './ui/Icon.svelte';
	import { LIST_WIDTH, clampListWidth } from '#lib/palette';

	interface Props {
		/** Max width in px; 0 fills the window, null follows `defaultWidth`. */
		value: number | null;
		/** The account default; when given, a "Default" toggle lets `value` be null. */
		defaultWidth?: number;
		id?: string;
	}
	let { value = $bindable(), defaultWidth, id }: Props = $props();

	// The last px width picked, so switching Default/Full width off restores it.
	let px = $state(LIST_WIDTH.default);
	$effect.pre(() => {
		if (value) px = value;
	});

	const custom = $derived(value !== null && value !== 0);
	// While on Default, show the default's width if it has one.
	const shown = $derived(value === null && defaultWidth ? defaultWidth : px);

	function setPx(v: number) {
		px = v;
		value = v;
	}

	function toggle(mode: null | 0) {
		value = value === mode ? px : mode;
	}
</script>

<div class="width-row">
	<input
		type="range"
		class="width-slider"
		aria-label="List width"
		min={LIST_WIDTH.min}
		max={LIST_WIDTH.max}
		step={LIST_WIDTH.step}
		bind:value={() => shown, setPx}
		disabled={!custom}
	/>
	<div class="width-input" class:disabled={!custom}>
		<input
			{id}
			type="number"
			min={LIST_WIDTH.min}
			max={LIST_WIDTH.max}
			bind:value={() => shown, (v) => (px = v)}
			onchange={() => setPx(clampListWidth(px || LIST_WIDTH.default))}
			disabled={!custom}
		/>
		<span>px</span>
	</div>
	{#if defaultWidth !== undefined}
		<button
			type="button"
			class="field-toggle"
			class:on={value === null}
			aria-pressed={value === null}
			title="Your account default: {defaultWidth ? `${defaultWidth}px` : 'full width'}"
			onclick={() => toggle(null)}
		>
			<Icon name={value === null ? 'check' : 'plus'} size={12} strokeWidth={2.5} />Default
		</button>
	{/if}
	<button
		type="button"
		class="field-toggle"
		class:on={value === 0}
		aria-pressed={value === 0}
		onclick={() => toggle(0)}
	>
		<Icon name={value === 0 ? 'check' : 'plus'} size={12} strokeWidth={2.5} />Full width
	</button>
</div>

<style>
	.width-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.width-slider {
		flex: 1;
		min-width: 0;
		accent-color: var(--accent);
	}
	.width-slider:disabled {
		opacity: 0.4;
	}
	.width-input {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-xs);
		font-size: var(--text-sm);
		color: var(--text-subtle);
	}
	.width-input:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.width-input.disabled {
		opacity: 0.4;
	}
	.width-input input {
		width: 4.5ch;
		border: none;
		background: none;
		outline: none;
		color: var(--text);
		font: inherit;
		text-align: right;
		appearance: textfield;
		-moz-appearance: textfield;
	}
	.width-input input::-webkit-inner-spin-button,
	.width-input input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.field-toggle {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text-subtle);
		border: 1px dashed var(--border-strong);
		transition: all var(--transition-fast);
	}
	.field-toggle:hover {
		color: var(--text);
	}
	.field-toggle.on {
		color: var(--accent-text);
		background: var(--accent-soft);
		border: 1px solid var(--accent-border);
	}
</style>
