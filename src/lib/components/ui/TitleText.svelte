<script lang="ts">
	import { splitTitleSegments } from '#lib/markdown';

	interface Props {
		text: string;
	}

	let { text }: Props = $props();

	let segments = $derived(splitTitleSegments(text));
</script>

{#each segments as seg, i (i)}{#if seg.type === 'code'}<code>{seg.text}</code
		>{:else if seg.type === 'link'}<a
			class="title-link"
			href={seg.href}
			target="_blank"
			rel="noopener noreferrer"
			onclick={(e) => e.stopPropagation()}>{seg.text}</a
		>{:else}{seg.text}{/if}{/each}

<style>
	code {
		font-family: var(--font-mono);
		font-size: 0.86em;
		background: var(--surface-inset);
		padding: 0.1em 0.35em;
		border-radius: var(--radius-xs);
		border: 1px solid var(--border-subtle);
	}
	.title-link {
		color: var(--accent-text);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
</style>
