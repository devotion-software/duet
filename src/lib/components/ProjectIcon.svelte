<script lang="ts">
	interface Props {
		icon?: string;
		/** Uploaded image icon; takes precedence over the emoji. */
		iconUrl?: string | null;
	}
	let { icon = '📋', iconUrl = null }: Props = $props();
</script>

<!-- Sized in em so an image sits wherever the emoji would, at the container's font size. -->
{#if iconUrl}<img src={iconUrl} alt="" />{:else}{icon}{/if}

<style>
	img {
		display: block;
		width: 1.15em;
		height: 1.15em;
		object-fit: contain;
	}
</style>
