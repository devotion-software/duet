<script module lang="ts">
	export interface ViewerImage {
		src: string;
		name?: string | null;
	}
</script>

<script lang="ts">
	import { fade, scale as scaleIn } from 'svelte/transition';
	import Icon from './Icon.svelte';

	interface Props {
		images: ViewerImage[];
		/** Index of the image being shown; `null` keeps the viewer closed. */
		index: number | null;
	}
	let { images, index = $bindable() }: Props = $props();

	const MIN_ZOOM = 1;
	const MAX_ZOOM = 8;
	const STEP = 1.5;

	const open = $derived(index !== null && images.length > 0);
	const current = $derived(open ? images[Math.min(index!, images.length - 1)] : null);
	const many = $derived(images.length > 1);

	let zoom = $state(1);
	let tx = $state(0);
	let ty = $state(0);
	let stage = $state<HTMLDivElement>();
	let img = $state<HTMLImageElement>();
	let loaded = $state(false);
	let failed = $state(false);

	function close() {
		index = null;
	}
	function go(step: number) {
		if (index === null || !many) return;
		index = (index + step + images.length) % images.length;
	}

	// Reset view state whenever the image changes.
	$effect(() => {
		void current?.src;
		zoom = 1;
		tx = ty = 0;
		loaded = false;
		failed = false;
	});

	// Warm the cache for neighbours so arrowing through is instant.
	$effect(() => {
		if (index === null || !many) return;
		for (const step of [-1, 1]) {
			const n = images[(index + step + images.length) % images.length];
			if (n) new Image().src = n.src;
		}
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

	/** Keep the image from being dragged entirely out of view. */
	function clampPan() {
		if (!img || !stage) return;
		const maxX = Math.max(0, (img.offsetWidth * zoom - stage.clientWidth) / 2);
		const maxY = Math.max(0, (img.offsetHeight * zoom - stage.clientHeight) / 2);
		tx = Math.max(-maxX, Math.min(maxX, tx));
		ty = Math.max(-maxY, Math.min(maxY, ty));
	}

	/** Zoom to `next`, keeping the point (clientX, clientY) fixed on screen. */
	function zoomTo(next: number, clientX?: number, clientY?: number) {
		next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
		if (!stage) return;
		const r = stage.getBoundingClientRect();
		const px = (clientX ?? r.left + r.width / 2) - (r.left + r.width / 2);
		const py = (clientY ?? r.top + r.height / 2) - (r.top + r.height / 2);
		const k = next / zoom;
		tx = px - (px - tx) * k;
		ty = py - (py - ty) * k;
		zoom = next;
		if (zoom === 1) tx = ty = 0;
		clampPan();
	}

	// Capture-phase so the viewer's keys win over panel/page shortcuts beneath it
	// (e.g. Escape closing the task panel too).
	$effect(() => {
		if (!open) return;
		function onkey(e: KeyboardEvent) {
			const handled = () => {
				e.preventDefault();
				e.stopPropagation();
			};
			switch (e.key) {
				case 'Escape':
					handled();
					close();
					break;
				case 'ArrowLeft':
					handled();
					go(-1);
					break;
				case 'ArrowRight':
					handled();
					go(1);
					break;
				case '+':
				case '=':
					handled();
					zoomTo(zoom * STEP);
					break;
				case '-':
					handled();
					zoomTo(zoom / STEP);
					break;
				case '0':
					handled();
					zoomTo(1);
					break;
				default:
					// Swallow everything else so single-key app shortcuts don't fire underneath.
					e.stopPropagation();
			}
		}
		window.addEventListener('keydown', onkey, true);
		return () => window.removeEventListener('keydown', onkey, true);
	});

	function onwheel(e: WheelEvent) {
		e.preventDefault();
		// Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels as larger steps.
		const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
		zoomTo(zoom * factor, e.clientX, e.clientY);
	}

	function ondblclick(e: MouseEvent) {
		zoomTo(zoom > 1 ? 1 : 2.5, e.clientX, e.clientY);
	}

	// ── Pointer gestures: drag to pan, pinch to zoom, swipe to navigate ──
	const pointers = new Map<number, { x: number; y: number }>();
	let pinchDist = 0;
	let swipeStart: { x: number; y: number } | null = null;
	let moved = false;
	let downOnBackdrop = false;

	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		moved = false;
		downOnBackdrop = e.target === stage;
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
			swipeStart = null;
		} else {
			swipeStart = { x: e.clientX, y: e.clientY };
		}
	}

	function onpointermove(e: PointerEvent) {
		const prev = pointers.get(e.pointerId);
		if (!prev) return;
		const pt = { x: e.clientX, y: e.clientY };
		pointers.set(e.pointerId, pt);
		if (Math.abs(pt.x - (swipeStart?.x ?? pt.x)) + Math.abs(pt.y - (swipeStart?.y ?? pt.y)) > 4) moved = true;

		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			const dist = Math.hypot(a.x - b.x, a.y - b.y);
			if (pinchDist) zoomTo(zoom * (dist / pinchDist), (a.x + b.x) / 2, (a.y + b.y) / 2);
			pinchDist = dist;
			moved = true;
		} else if (zoom > 1) {
			tx += pt.x - prev.x;
			ty += pt.y - prev.y;
			clampPan();
		}
	}

	function onpointerup(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinchDist = 0;
		if (swipeStart && zoom === 1 && pointers.size === 0) {
			const dx = e.clientX - swipeStart.x;
			const dy = e.clientY - swipeStart.y;
			if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
			else if (dy > 100 && Math.abs(dy) > Math.abs(dx) * 1.5) close();
		}
		if (pointers.size === 0) swipeStart = null;
	}

	/** Clicking the empty backdrop (not the image itself) closes. Pointer capture
	 * retargets the click to the stage, so judge by where the press started. */
	function onstageclick() {
		if (!moved && downOnBackdrop) close();
	}

	/** Render outside any transformed ancestor so `position: fixed` is truly full-screen. */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}
</script>

{#if open && current}
	<div
		class="viewer"
		use:portal
		role="dialog"
		aria-modal="true"
		aria-label="Image viewer"
		transition:fade={{ duration: 160 }}
	>
		<header class="bar">
			<div class="meta">
				{#if many}<span class="count">{index! + 1} / {images.length}</span>{/if}
				{#if current.name}<span class="name" title={current.name}>{current.name}</span>{/if}
			</div>
			<div class="tools">
				<button onclick={() => zoomTo(zoom / STEP)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out" title="Zoom out (−)">
					<Icon name="zoom-out" size={18} />
				</button>
				<button class="pct" onclick={() => zoomTo(1)} aria-label="Reset zoom" title="Reset zoom (0)">
					{Math.round(zoom * 100)}%
				</button>
				<button onclick={() => zoomTo(zoom * STEP)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" title="Zoom in (+)">
					<Icon name="zoom-in" size={18} />
				</button>
				<span class="sep"></span>
				<a href={current.src} target="_blank" rel="noreferrer" aria-label="Open original" title="Open original">
					<Icon name="external-link" size={18} />
				</a>
				<a href={current.src} download={current.name ?? ''} aria-label="Download" title="Download">
					<Icon name="download" size={18} />
				</a>
				<button onclick={close} aria-label="Close" title="Close (Esc)">
					<Icon name="x" size={20} />
				</button>
			</div>
		</header>

		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			class="stage"
			class:zoomed={zoom > 1}
			bind:this={stage}
			{onwheel}
			{ondblclick}
			{onpointerdown}
			{onpointermove}
			{onpointerup}
			onpointercancel={onpointerup}
			onclick={onstageclick}
		>
			{#if !loaded && !failed}<div class="status">Loading…</div>{/if}
			{#if failed}<div class="status">Couldn't load this image.</div>{/if}
			{#key current.src}
				<img
					bind:this={img}
					src={current.src}
					alt={current.name ?? 'Image'}
					draggable="false"
					class:hidden={!loaded}
					style="transform: translate({tx}px, {ty}px) scale({zoom})"
					onload={() => (loaded = true)}
					onerror={() => (failed = true)}
					in:scaleIn={{ duration: 180, start: 0.97, opacity: 0 }}
				/>
			{/key}
		</div>

		{#if many}
			<button class="nav prev" onclick={() => go(-1)} aria-label="Previous image" title="Previous (←)">
				<Icon name="chevron-left" size={26} />
			</button>
			<button class="nav next" onclick={() => go(1)} aria-label="Next image" title="Next (→)">
				<Icon name="chevron-right" size={26} />
			</button>

			<nav class="strip" aria-label="Images">
				{#each images as im, i (i)}
					<button class:on={i === index} onclick={() => (index = i)} aria-label="Image {i + 1}">
						<img src={im.src} alt="" loading="lazy" draggable="false" />
					</button>
				{/each}
			</nav>
		{/if}
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
		user-select: none;
		-webkit-user-select: none;
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
	.count {
		font-variant-numeric: tabular-nums;
		color: rgba(255, 255, 255, 0.6);
		flex-shrink: 0;
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
	.tools button:hover:not(:disabled),
	.tools a:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}
	.tools button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.pct {
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		min-width: 52px !important;
	}
	.sep {
		width: 1px;
		height: 20px;
		margin: 0 var(--space-1);
		background: rgba(255, 255, 255, 0.15);
	}
	.stage {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		touch-action: none;
		cursor: zoom-in;
		padding: var(--space-2) var(--space-6) var(--space-4);
	}
	.stage.zoomed {
		cursor: grab;
	}
	.stage.zoomed:active {
		cursor: grabbing;
	}
	.stage img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		transform-origin: center;
		will-change: transform;
		border-radius: var(--radius-sm);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}
	.stage img.hidden {
		visibility: hidden;
	}
	.status {
		position: absolute;
		color: rgba(255, 255, 255, 0.6);
		font-size: var(--text-sm);
		pointer-events: none;
	}
	.nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		display: inline-flex;
		padding: var(--space-3);
		border-radius: var(--radius-full);
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.85);
		transition: all var(--transition-fast);
	}
	.nav:hover {
		background: rgba(255, 255, 255, 0.18);
		color: #fff;
	}
	.prev {
		left: var(--space-4);
	}
	.next {
		right: var(--space-4);
	}
	.strip {
		display: flex;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4) var(--space-4);
		overflow-x: auto;
		flex-shrink: 0;
	}
	/* Auto margins centre the strip without clipping its start when it overflows. */
	.strip > :first-child {
		margin-left: auto;
	}
	.strip > :last-child {
		margin-right: auto;
	}
	.strip button {
		flex-shrink: 0;
		width: 52px;
		height: 52px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		opacity: 0.45;
		outline: 2px solid transparent;
		outline-offset: 1px;
		transition: all var(--transition-fast);
	}
	.strip button:hover {
		opacity: 0.8;
	}
	.strip button.on {
		opacity: 1;
		outline-color: #fff;
	}
	.strip img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	@media (max-width: 640px) {
		.nav {
			display: none;
		}
		.stage {
			padding: 0;
		}
	}
</style>
