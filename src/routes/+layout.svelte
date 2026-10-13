<script lang="ts">
	import '#lib/styles/app.css';
	import { onMount } from 'svelte';
	import { theme } from '#lib/theme.svelte';
	import Toaster from '#lib/components/ui/Toaster.svelte';

	let { children } = $props();

	onMount(() => {
		theme.init();
	});
</script>

{@render children()}

<Toaster />
