<script lang="ts">
	import Logo from '#lib/components/Logo.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon, { type IconName } from '#lib/components/ui/Icon.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';

	const features: { icon: IconName; title: string; body: string }[] = [
		{
			icon: 'list-plus',
			title: 'Capture at the speed of thought',
			body: 'One keystroke to add a task, one click to complete it. No modals, no friction.'
		},
		{
			icon: 'palette',
			title: 'Make every project yours',
			body: 'Give each project its own colour and style. The whole UI themes itself to match.'
		},
		{
			icon: 'users',
			title: 'Share with your team',
			body: 'Invite collaborators as owners, editors or viewers. Changes sync live.'
		},
		{
			icon: 'clipboard',
			title: 'Paste a whole checklist',
			body: 'Bring your existing notes in at once — checked items and all — and keep moving.'
		},
		{
			icon: 'sparkles',
			title: 'Rich, markdown-native details',
			body: 'Full markdown and code blocks on every task. Copy any task to hand to your AI.'
		},
		{
			icon: 'tag',
			title: 'Organise however you think',
			body: 'Categories, tags, deadlines, urgency, size and assignees — use what you need.'
		}
	];

	const accents = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6'];
	let heroAccent = $state('#6366f1');

	let mockItems = $state([
		{ t: 'Write launch announcement', done: false, tag: 'Marketing' },
		{ t: 'Final QA pass on billing', done: false, tag: 'Eng' },
		{ t: 'Set up status page', done: true, tag: 'Ops' },
		{ t: 'Record demo video', done: false, tag: 'Marketing' }
	]);
	let mockDone = $derived(mockItems.filter((i) => i.done).length);
</script>

<div class="page" style="--accent: {heroAccent}">
	<header class="nav">
		<Logo size={30} />
		<div class="nav-actions">
			<ThemeToggle />
			<Button href="/signin" variant="ghost" size="sm">Sign in</Button>
			<Button href="/signin" variant="primary" size="sm" iconRight="arrow-right">Get started</Button>
		</div>
	</header>

	<main class="hero">
		<div class="hero-copy">
			<div class="eyebrow">
				<Icon name="sparkles" size={14} />
				<span>A calmer way to track your projects</span>
			</div>
			<h1>
				Your todos, in <span class="accent-word">perfect harmony</span>.
			</h1>
			<p class="lede">
				Duet is a fast, beautiful todo tracker for everything you're building. Spin up a project,
				capture tasks instantly, and keep every collaborator in sync.
			</p>
			<div class="cta">
				<Button href="/signin" variant="primary" size="lg" iconRight="arrow-right">
					Start for free
				</Button>
				<Button href="/signin" variant="outline" size="lg" icon="github">Continue with GitHub</Button>
			</div>
			<div class="swatches" role="group" aria-label="Preview accent colour">
				{#each accents as a (a)}
					<button
						class="swatch"
						class:active={heroAccent === a}
						style="background: {a}"
						aria-label="Use {a}"
						onclick={() => (heroAccent = a)}
					></button>
				{/each}
			</div>
		</div>

		<div class="hero-preview">
			<div class="mock">
				<div class="mock-head">
					<span class="mock-icon">🚀</span>
					<div class="mock-titles">
						<strong>Launch checklist</strong>
						<small>{mockItems.length - mockDone} open · {mockDone} done</small>
					</div>
				</div>
				<div class="mock-add">
					<Icon name="plus" size={16} />
					<span>Add a task…</span>
				</div>
				{#each mockItems as item (item.t)}
					<button
						type="button"
						class="mock-item"
						class:done={item.done}
						aria-pressed={item.done}
						onclick={() => (item.done = !item.done)}
					>
						<span class="check" class:on={item.done}>
							{#if item.done}<Icon name="check" size={12} />{/if}
						</span>
						<span class="mock-text">{item.t}</span>
						<span class="mock-chip">{item.tag}</span>
					</button>
				{/each}
			</div>
		</div>
	</main>

	<section class="features">
		{#each features as f (f.title)}
			<div class="feature">
				<span class="feature-icon"><Icon name={f.icon} size={20} /></span>
				<h3>{f.title}</h3>
				<p>{f.body}</p>
			</div>
		{/each}
	</section>

	<footer class="foot">
		<Logo size={22} />
		<span>Built for people who ship. © {new Date().getFullYear()} Duet.</span>
	</footer>
</div>

<style>
	.page {
		max-width: 1120px;
		margin: 0 auto;
		padding: 0 var(--space-5);
	}
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-5) 0;
	}
	.nav-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.hero {
		display: grid;
		grid-template-columns: 1.05fr 0.95fr;
		gap: var(--space-12);
		align-items: center;
		padding: var(--space-12) 0 var(--space-16);
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		background: var(--accent-soft);
		color: var(--accent-text);
		border: 1px solid var(--accent-border);
		border-radius: var(--radius-full);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		margin-bottom: var(--space-5);
	}
	h1 {
		font-size: clamp(2.2rem, 5vw, 3.6rem);
		line-height: 1.05;
		letter-spacing: -0.03em;
		margin-bottom: var(--space-5);
	}
	.accent-word {
		background: linear-gradient(120deg, var(--accent), color-mix(in oklab, var(--accent), #fff 40%));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 0.08em;
		margin-right: -0.08em;
	}
	.lede {
		font-size: var(--text-lg);
		color: var(--text-muted);
		line-height: var(--leading-normal);
		max-width: 34ch;
		margin-bottom: var(--space-6);
	}
	.cta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-bottom: var(--space-6);
	}
	.swatches {
		display: flex;
		gap: var(--space-2);
	}
	.swatch {
		width: 26px;
		height: 26px;
		border-radius: var(--radius-full);
		border: 2px solid var(--surface);
		box-shadow: 0 0 0 1px var(--border-strong);
		transition: transform var(--transition-fast);
	}
	.swatch:hover {
		transform: scale(1.12);
	}
	.swatch.active {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--accent);
	}

	/* Hero preview card */
	.hero-preview {
		display: flex;
		justify-content: center;
		perspective: 1400px;
	}
	.mock {
		width: 100%;
		max-width: 400px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-xl);
		padding: var(--space-5);
		transform: rotateY(-9deg) rotateX(4deg);
		transition: transform var(--transition-slow);
	}
	.hero-preview:hover .mock {
		transform: rotateY(-4deg) rotateX(2deg);
	}
	.mock-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	.mock-icon {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		font-size: 22px;
		background: var(--accent-soft);
		border-radius: var(--radius-md);
	}
	.mock-titles {
		display: flex;
		flex-direction: column;
	}
	.mock-titles strong {
		font-weight: var(--weight-semibold);
	}
	.mock-titles small {
		color: var(--text-subtle);
		font-size: var(--text-xs);
	}
	.mock-add {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		color: var(--text-faint);
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-3);
		font-size: var(--text-sm);
	}
	.mock-item {
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		font: inherit;
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
		border-radius: var(--radius-md);
		transition: background var(--transition-fast);
	}
	.mock-item:hover {
		background: var(--surface-inset);
	}
	.mock-item + .mock-item {
		border-top: 1px solid var(--border-subtle);
	}
	.check {
		width: 19px;
		height: 19px;
		border-radius: var(--radius-full);
		border: 1.8px solid var(--border-strong);
		display: grid;
		place-items: center;
		color: var(--accent-contrast);
		flex-shrink: 0;
	}
	.check.on {
		background: var(--accent);
		border-color: var(--accent);
	}
	.mock-text {
		flex: 1;
		font-size: var(--text-sm);
	}
	.mock-item.done .mock-text {
		color: var(--text-subtle);
		text-decoration: line-through;
	}
	.mock-chip {
		font-size: var(--text-xs);
		color: var(--text-muted);
		background: var(--surface-inset);
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
	}

	/* Features */
	.features {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-4);
		padding: var(--space-8) 0 var(--space-16);
	}
	.feature {
		padding: var(--space-5);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-xs);
		transition:
			transform var(--transition-base),
			box-shadow var(--transition-base),
			border-color var(--transition-base);
	}
	.feature:hover {
		transform: translateY(-3px);
		box-shadow: var(--shadow-md);
		border-color: var(--accent-border);
	}
	.feature-icon {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		background: var(--accent-soft);
		color: var(--accent-text);
		margin-bottom: var(--space-3);
	}
	.feature h3 {
		font-size: var(--text-md);
		margin-bottom: var(--space-2);
	}
	.feature p {
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
	}

	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-6) 0 var(--space-10);
		border-top: 1px solid var(--border);
		color: var(--text-subtle);
		font-size: var(--text-sm);
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	@media (max-width: 860px) {
		.hero {
			grid-template-columns: 1fr;
			gap: var(--space-8);
			padding-top: var(--space-6);
		}
		.hero-preview {
			order: -1;
		}
		.mock {
			transform: none;
		}
		.features {
			grid-template-columns: 1fr;
		}
	}
</style>
