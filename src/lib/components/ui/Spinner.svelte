<script lang="ts">
	interface Props {
		size?: number;
		strokeWidth?: number;
	}
	let { size = 18, strokeWidth = 2.4 }: Props = $props();
</script>

<svg
	class="spinner"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	aria-hidden="true"
>
	<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.2" stroke-width={strokeWidth} />
	<path
		d="M21 12a9 9 0 0 0-9-9"
		stroke="currentColor"
		stroke-width={strokeWidth}
		stroke-linecap="round"
	/>
</svg>

<style>
	.spinner {
		animation: spin 0.7s linear infinite;
		flex-shrink: 0;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
