<script lang="ts">
	import { theme, type Theme } from '#lib/theme.svelte';
	import Icon, { type IconName } from './ui/Icon.svelte';

	const LABEL: Record<Theme, string> = {
		system: 'System theme',
		light: 'Light theme',
		dark: 'Dark theme'
	};
	const ICON: Record<Theme, IconName> = {
		system: 'monitor',
		light: 'sun',
		dark: 'moon'
	};
</script>

<button
	class="theme-toggle"
	onclick={() => theme.cycle()}
	title={LABEL[theme.value]}
	aria-label={LABEL[theme.value]}
>
	{#key theme.value}
		<span class="icon-wrap"><Icon name={ICON[theme.value]} size={17} /></span>
	{/key}
</button>

<style>
	.theme-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-md);
		color: var(--text-muted);
		transition:
			background var(--transition-fast),
			color var(--transition-fast);
	}
	.theme-toggle:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.icon-wrap {
		display: inline-flex;
		animation: pop var(--transition-base);
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: rotate(-30deg) scale(0.7);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
</style>
