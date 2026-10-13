<script lang="ts">
	interface Props {
		size?: number;
		withText?: boolean;
	}
	let { size = 28, withText = true }: Props = $props();
</script>

<span class="logo" style="--logo-size: {size}px">
	<svg class="mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
		<rect x="1" y="1" width="30" height="30" rx="9" fill="var(--accent)" />
		<rect
			x="1"
			y="1"
			width="30"
			height="30"
			rx="9"
			fill="url(#duet-g)"
			fill-opacity="0.35"
		/>
		<!-- Two interlocking check marks = "duet" -->
		<path
			d="M8 16.5l3.2 3.2L18 13"
			stroke="var(--accent-contrast)"
			stroke-width="2.4"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<circle cx="22.5" cy="11" r="2.1" fill="var(--accent-contrast)" fill-opacity="0.9" />
		<defs>
			<linearGradient id="duet-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
				<stop stop-color="#fff" stop-opacity="0.5" />
				<stop offset="1" stop-color="#fff" stop-opacity="0" />
			</linearGradient>
		</defs>
	</svg>
	{#if withText}
		<span class="word">Duet</span>
	{/if}
</span>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 0.55em;
	}
	.mark {
		filter: drop-shadow(var(--shadow-accent));
		flex-shrink: 0;
	}
	.word {
		font-size: calc(var(--logo-size) * 0.72);
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--text);
	}
</style>
