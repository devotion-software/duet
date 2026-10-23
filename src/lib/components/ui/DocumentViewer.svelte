<script module lang="ts">
	export interface ViewerDoc {
		src: string;
		name?: string | null;
		mime?: string | null;
	}
</script>

<script lang="ts">
	import { fade, scale as scaleIn } from 'svelte/transition';
	import Icon from './Icon.svelte';

	interface Props {
		/** The document being shown; `null` keeps the viewer closed. */
		doc: ViewerDoc | null;
		onClose: () => void;
	}
	let { doc, onClose }: Props = $props();

	const open = $derived(doc !== null);
	const isPdf = $derived(doc?.mime === 'application/pdf');
	const isText = $derived(!!doc?.mime?.startsWith('text/'));
	const previewable = $derived(isPdf || isText);

	let text = $state<string | null>(null);
	let textFailed = $state(false);

	// Fetch plain-text/CSV bodies ourselves so they render legibly instead of
	// downloading or showing as a blank browser plaintext page in an iframe.
	$effect(() => {
		text = null;
		textFailed = false;
		if (!doc || !isText) return;
		const src = doc.src;
		fetch(src)
			.then((r) => {
				if (!r.ok) throw new Error('failed');
				return r.text();
			})
			.then((t) => {
				if (doc?.src === src) text = t;
			})
			.catch(() => {
				if (doc?.src === src) textFailed = true;
			});
	});

	// Lock page scroll while open.
	$effect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	});

	// Capture-phase so Escape closes this viewer rather than the task panel beneath it.
	$effect(() => {
		if (!open) return;
		function onkey(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			} else {
				e.stopPropagation();
			}
		}
		window.addEventListener('keydown', onkey, true);
		return () => window.removeEventListener('keydown', onkey, true);
	});

	function onstageclick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	/** Render outside any transformed ancestor so `position: fixed` is truly full-screen. */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}
</script>

{#if open && doc}
	<div
		class="viewer"
		use:portal
		role="dialog"
		aria-modal="true"
		aria-label="Document viewer"
		transition:fade={{ duration: 160 }}
	>
		<header class="bar">
			<div class="meta">
				{#if doc.name}<span class="name" title={doc.name}>{doc.name}</span>{/if}
			</div>
			<div class="tools">
				<a href={doc.src} target="_blank" rel="noreferrer" aria-label="Open original" title="Open original">
					<Icon name="external-link" size={18} />
				</a>
				<a href={`${doc.src}${doc.src.includes('?') ? '&' : '?'}download=1`} download={doc.name ?? ''} aria-label="Download" title="Download">
					<Icon name="download" size={18} />
				</a>
				<button onclick={onClose} aria-label="Close" title="Close (Esc)">
					<Icon name="x" size={20} />
				</button>
			</div>
		</header>

		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="stage" onclick={onstageclick}>
			{#if isPdf}
				{#key doc.src}
					<iframe
						src={doc.src}
						title={doc.name ?? 'Document'}
						in:scaleIn={{ duration: 180, start: 0.98, opacity: 0 }}
					></iframe>
				{/key}
			{:else if isText}
				<div class="text-panel" in:scaleIn={{ duration: 180, start: 0.98, opacity: 0 }}>
					{#if textFailed}
						<p class="status">Couldn't load this file.</p>
					{:else if text === null}
						<p class="status">Loading…</p>
					{:else}
						<pre>{text}</pre>
					{/if}
				</div>
			{:else}
				<div class="fallback" in:scaleIn={{ duration: 180, start: 0.98, opacity: 0 }}>
					<Icon name="file" size={40} />
					<p>No quick preview for this file type.</p>
					<a class="open-link" href={doc.src} target="_blank" rel="noreferrer">
						<Icon name="external-link" size={14} /> Open original
					</a>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.viewer {
		position: fixed;
		inset: 0;
		z-index: calc(var(--z-toast) - 1);
		display: flex;
		flex-direction: column;
		background: rgba(8, 9, 12, 0.94);
		color: #f3f4f6;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-2) var(--space-3) var(--space-2) var(--space-5);
		flex-shrink: 0;
	}
	.meta {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		min-width: 0;
		font-size: var(--text-sm);
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}
	.tools button,
	.tools a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 36px;
		height: 36px;
		padding: 0 8px;
		border-radius: var(--radius-sm);
		color: rgba(255, 255, 255, 0.78);
		transition: all var(--transition-fast);
	}
	.tools button:hover,
	.tools a:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}
	.stage {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		padding: 0 var(--space-6) var(--space-4);
	}
	.stage iframe {
		width: 100%;
		height: 100%;
		border: none;
		border-radius: var(--radius-sm);
		background: #fff;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}
	.text-panel {
		width: 100%;
		height: 100%;
		overflow: auto;
		background: #fff;
		border-radius: var(--radius-sm);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}
	.text-panel pre {
		margin: 0;
		padding: var(--space-5);
		color: #1a1a1a;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
		white-space: pre-wrap;
		word-break: break-word;
	}
	.status {
		padding: var(--space-5);
		color: #1a1a1a;
		font-size: var(--text-sm);
	}
	.fallback {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		color: rgba(255, 255, 255, 0.75);
		text-align: center;
	}
	.fallback p {
		font-size: var(--text-sm);
	}
	.open-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-full);
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		transition: background var(--transition-fast);
	}
	.open-link:hover {
		background: rgba(255, 255, 255, 0.18);
	}

	@media (max-width: 640px) {
		.stage {
			padding: 0;
		}
		.stage iframe,
		.text-panel {
			border-radius: 0;
		}
	}
</style>
