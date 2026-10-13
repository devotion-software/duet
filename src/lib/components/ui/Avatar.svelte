<script lang="ts">
	interface Props {
		name?: string | null;
		email?: string | null;
		image?: string | null;
		size?: number;
	}
	let { name, email, image, size = 28 }: Props = $props();

	const label = $derived(name?.trim() || email?.trim() || '?');
	const initials = $derived(
		label
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p[0])
			.join('')
			.toUpperCase() || label[0]?.toUpperCase() || '?'
	);
	// Deterministic hue from the label so each person gets a stable colour.
	const hue = $derived(
		[...label].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 360, 7)
	);
</script>

{#if image}
	<img
		class="avatar"
		src={image}
		alt={label}
		width={size}
		height={size}
		style="--size: {size}px"
		referrerpolicy="no-referrer"
	/>
{:else}
	<span
		class="avatar fallback"
		style="--size: {size}px; --h: {hue}; font-size: {Math.round(size * 0.4)}px"
		aria-label={label}
		title={label}
	>
		{initials}
	</span>
{/if}

<style>
	.avatar {
		width: var(--size);
		height: var(--size);
		border-radius: var(--radius-full);
		flex-shrink: 0;
		object-fit: cover;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.fallback {
		background: hsl(var(--h) 55% 52%);
		color: #fff;
		font-weight: var(--weight-semibold);
		letter-spacing: 0.02em;
		user-select: none;
	}
</style>
