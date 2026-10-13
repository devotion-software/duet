<script lang="ts">
	import { renderMarkdown } from '#lib/markdown';

	interface Props {
		source: string | null | undefined;
	}
	let { source }: Props = $props();

	let html = $state('');

	$effect(() => {
		let cancelled = false;
		renderMarkdown(source).then((h) => {
			if (!cancelled) html = h;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<div class="markdown">
	{@html html}
</div>

<style>
	.markdown {
		font-size: var(--text-base);
		line-height: var(--leading-normal);
		color: var(--text);
		word-break: break-word;
	}
	.markdown :global(h1),
	.markdown :global(h2),
	.markdown :global(h3),
	.markdown :global(h4) {
		margin: var(--space-4) 0 var(--space-2);
		line-height: var(--leading-tight);
	}
	.markdown :global(h1) {
		font-size: var(--text-xl);
	}
	.markdown :global(h2) {
		font-size: var(--text-lg);
	}
	.markdown :global(h3) {
		font-size: var(--text-md);
	}
	.markdown :global(> *:first-child) {
		margin-top: 0;
	}
	.markdown :global(p),
	.markdown :global(ul),
	.markdown :global(ol),
	.markdown :global(blockquote),
	.markdown :global(pre),
	.markdown :global(table) {
		margin: var(--space-3) 0;
	}
	.markdown :global(ul),
	.markdown :global(ol) {
		padding-left: var(--space-5);
	}
	.markdown :global(ul) {
		list-style: disc;
	}
	.markdown :global(ol) {
		list-style: decimal;
	}
	.markdown :global(li) {
		margin: var(--space-1) 0;
	}
	.markdown :global(li)::marker {
		color: var(--text-faint);
	}
	.markdown :global(a) {
		color: var(--accent-text);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.markdown :global(blockquote) {
		border-left: 3px solid var(--accent-border);
		padding: var(--space-1) var(--space-4);
		color: var(--text-muted);
		background: var(--surface-inset);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}
	.markdown :global(code) {
		font-family: var(--font-mono);
		font-size: 0.86em;
		background: var(--surface-inset);
		padding: 0.12em 0.4em;
		border-radius: var(--radius-xs);
		border: 1px solid var(--border-subtle);
	}
	.markdown :global(pre.code-block) {
		background: var(--surface-inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-4);
		overflow-x: auto;
	}
	.markdown :global(pre.code-block code) {
		background: none;
		border: none;
		padding: 0;
		font-size: var(--text-sm);
		line-height: var(--leading-snug);
	}
	.markdown :global(table) {
		border-collapse: collapse;
		width: 100%;
		font-size: var(--text-sm);
	}
	.markdown :global(th),
	.markdown :global(td) {
		border: 1px solid var(--border);
		padding: var(--space-2) var(--space-3);
		text-align: left;
	}
	.markdown :global(th) {
		background: var(--surface-inset);
		font-weight: var(--weight-semibold);
	}
	.markdown :global(img) {
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
	}
	.markdown :global(hr) {
		border: none;
		border-top: 1px solid var(--border);
		margin: var(--space-4) 0;
	}

	/* highlight.js tokens mapped to theme-aware colours */
	.markdown :global(.hljs-comment),
	.markdown :global(.hljs-quote) {
		color: var(--text-faint);
		font-style: italic;
	}
	.markdown :global(.hljs-keyword),
	.markdown :global(.hljs-selector-tag),
	.markdown :global(.hljs-built_in),
	.markdown :global(.hljs-name),
	.markdown :global(.hljs-tag) {
		color: #c678dd;
	}
	.markdown :global(.hljs-string),
	.markdown :global(.hljs-title),
	.markdown :global(.hljs-section),
	.markdown :global(.hljs-attribute),
	.markdown :global(.hljs-literal),
	.markdown :global(.hljs-template-tag),
	.markdown :global(.hljs-template-variable),
	.markdown :global(.hljs-type),
	.markdown :global(.hljs-addition) {
		color: #98c379;
	}
	.markdown :global(.hljs-number),
	.markdown :global(.hljs-symbol),
	.markdown :global(.hljs-bullet),
	.markdown :global(.hljs-meta),
	.markdown :global(.hljs-link) {
		color: #d19a66;
	}
	.markdown :global(.hljs-variable),
	.markdown :global(.hljs-params) {
		color: #e06c75;
	}
	.markdown :global(.hljs-function .hljs-title),
	.markdown :global(.hljs-title.function_) {
		color: #61afef;
	}
	.markdown :global(.hljs-attr),
	.markdown :global(.hljs-property) {
		color: #56b6c2;
	}
	.markdown :global(.hljs-emphasis) {
		font-style: italic;
	}
	.markdown :global(.hljs-strong) {
		font-weight: var(--weight-bold);
	}
</style>
