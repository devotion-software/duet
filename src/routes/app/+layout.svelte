<script lang="ts">
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';
	import { authClient } from '#lib/auth-client';
	import Logo from '#lib/components/Logo.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import ProjectDialog from '#lib/components/ProjectDialog.svelte';
	import ProjectIcon from '#lib/components/ProjectIcon.svelte';
	import ShortcutsDialog from '#lib/components/ShortcutsDialog.svelte';
	import { shortcutAllowed } from '#lib/shortcuts';
	import { liveCounts } from '#lib/stores/liveCounts.svelte';

	let { data, children } = $props();

	let createOpen = $state(false);
	let menuOpen = $state(false);
	let sidebarOpen = $state(false);
	let shortcutsOpen = $state(false);

	const activeSlug = $derived(page.params.slug);
	const activeProject = $derived(data.projects.find((p) => p.slug === activeSlug));

	async function signOut() {
		await authClient.signOut();
		await goto('/');
	}

	// App-wide shortcuts: help and project switching. Task shortcuts live on the project page.
	function onkeydown(e: KeyboardEvent) {
		if (!shortcutAllowed(e)) return;
		const projects = data.projects;
		const index = projects.findIndex((p) => p.slug === activeSlug);
		let target: (typeof projects)[number] | undefined;
		if (e.key === '?') {
			e.preventDefault();
			shortcutsOpen = true;
			return;
		} else if (e.key === '[' || e.key === ']') {
			if (!projects.length) return;
			const step = e.key === ']' ? 1 : -1;
			const from = index < 0 ? (step > 0 ? -1 : 0) : index;
			target = projects[(from + step + projects.length) % projects.length];
		} else if (/^[1-9]$/.test(e.key)) {
			target = projects[Number(e.key) - 1];
		}
		if (target && target.slug !== activeSlug) {
			e.preventDefault();
			goto(`/app/${target.slug}`);
		}
	}

	// Close the mobile sidebar whenever navigation changes the route.
	$effect(() => {
		void page.url.pathname;
		sidebarOpen = false;
	});
</script>

<svelte:window {onkeydown} />

<div class="shell">
	<!-- Mobile top bar -->
	<header class="topbar">
		<button class="icon-btn" aria-label="Menu" onclick={() => (sidebarOpen = true)}>
			<Icon name="menu" size={20} />
		</button>
		<span class="topbar-title">
			{#if activeProject}
				<span class="tb-icon"><ProjectIcon icon={activeProject.icon} iconUrl={activeProject.iconUrl} /></span>{activeProject.name}
			{:else}
				<Logo size={22} />
			{/if}
		</span>
		<ThemeToggle />
	</header>

	{#if sidebarOpen}
		<button class="scrim" aria-label="Close menu" onclick={() => (sidebarOpen = false)}></button>
	{/if}

	<aside class="sidebar" class:open={sidebarOpen}>
		<div class="side-head">
			<a href="/app" class="brand"><Logo size={26} /></a>
		</div>

		<button class="new-project" onclick={() => (createOpen = true)}>
			<Icon name="plus" size={17} />
			<span>New project</span>
		</button>

		<nav class="projects" aria-label="Projects">
			{#if data.projects.length === 0}
				<p class="no-projects">No projects yet.<br />Create your first one above.</p>
			{:else}
				{#each data.projects as p (p.id)}
					{@const openCount = liveCounts[p.id] ?? p.openCount}
					<a
						href="/app/{p.slug}"
						class="p-link style-{p.style}"
						class:active={p.slug === activeSlug}
						style="--accent: {p.color}"
					>
						<span class="p-icon"><ProjectIcon icon={p.icon} iconUrl={p.iconUrl} /></span>
						<span class="p-name truncate">{p.name}</span>
						{#if openCount > 0}
							<span class="p-count">{openCount}</span>
						{/if}
					</a>
				{/each}
			{/if}
		</nav>

		<div class="side-foot">
			<div class="menu-wrap">
				{#if menuOpen}
					<button class="menu-scrim" aria-label="Close" onclick={() => (menuOpen = false)}></button>
					<div class="menu" role="menu">
						<a class="menu-item" href="/app/settings" role="menuitem">
							<Icon name="settings" size={16} /> Settings
						</a>
						<a class="menu-item" href="/app/settings#passkeys" role="menuitem">
							<Icon name="key" size={16} /> Passkeys
						</a>
						<button
							class="menu-item"
							role="menuitem"
							onclick={() => {
								menuOpen = false;
								shortcutsOpen = true;
							}}
						>
							<Icon name="keyboard" size={16} /> Keyboard shortcuts
							<kbd class="menu-kbd">?</kbd>
						</button>
						<hr />
						<button class="menu-item danger" role="menuitem" onclick={signOut}>
							<Icon name="logout" size={16} /> Sign out
						</button>
					</div>
				{/if}
				<button class="user" onclick={() => (menuOpen = !menuOpen)} aria-haspopup="menu">
					<Avatar name={data.user.name} email={data.user.email} image={data.user.image} size={30} />
					<span class="user-name truncate">{data.user.name || data.user.email}</span>
					<Icon name="chevrons-up-down" size={15} class="user-chev" />
				</button>
			</div>
			<ThemeToggle />
		</div>
	</aside>

	<main class="content">
		{@render children()}
	</main>
</div>

<ProjectDialog bind:open={createOpen} mode="create" />
<ShortcutsDialog bind:open={shortcutsOpen} />

<style>
	.shell {
		display: grid;
		grid-template-columns: 264px 1fr;
		min-height: 100vh;
	}
	.topbar {
		display: none;
	}

	/* Sidebar */
	.sidebar {
		position: sticky;
		top: 0;
		height: 100vh;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--surface-2);
		border-right: 1px solid var(--border);
	}
	.side-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-2) var(--space-3);
	}
	.new-project {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2-5, 0.6rem) var(--space-3);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text-muted);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-xs);
		transition: all var(--transition-fast);
	}
	.new-project:hover {
		color: var(--text);
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}

	.projects {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin-top: var(--space-2);
		padding-bottom: var(--space-2);
	}
	.no-projects {
		color: var(--text-faint);
		font-size: var(--text-sm);
		text-align: center;
		padding: var(--space-6) var(--space-2);
		line-height: var(--leading-normal);
	}
	.p-link {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		transition:
			background var(--transition-fast),
			color var(--transition-fast);
	}
	.p-link:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.p-link.active {
		background: var(--accent-soft);
		color: var(--accent-text);
	}
	.p-icon {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		font-size: 15px;
		flex-shrink: 0;
	}
	.p-name {
		flex: 1;
	}

	/* Project card style, matching the preview in ProjectDialog: the icon tile always shows it,
	   and the active row takes on the full treatment. */
	.p-icon {
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
	}
	.style-soft .p-icon {
		background: var(--accent-soft);
		border-color: var(--accent-border);
	}
	.style-solid .p-icon {
		background: var(--accent);
	}
	.style-outline .p-icon {
		background: var(--surface);
		border: 1.5px solid var(--accent);
	}
	.style-glass .p-icon {
		background: linear-gradient(
			135deg,
			color-mix(in oklab, var(--accent) 32%, var(--surface)),
			color-mix(in oklab, var(--accent) 6%, var(--surface))
		);
		border-color: var(--accent-border);
		box-shadow: inset 0 1px 0 color-mix(in oklab, white 45%, transparent);
	}
	.p-link.active.style-solid {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.p-link.active.style-solid .p-icon {
		background: color-mix(in oklab, var(--accent-contrast) 22%, transparent);
	}
	.p-link.active.style-solid .p-count {
		background: color-mix(in oklab, var(--accent-contrast) 22%, transparent);
		color: var(--accent-contrast);
	}
	.p-link.active.style-outline {
		background: var(--surface);
		box-shadow: inset 0 0 0 1.5px var(--accent);
	}
	.p-link.active.style-glass {
		background: linear-gradient(
			135deg,
			color-mix(in oklab, var(--accent) 22%, var(--surface)),
			color-mix(in oklab, var(--accent) 5%, var(--surface))
		);
		box-shadow:
			inset 0 0 0 1px var(--accent-border),
			inset 0 1px 0 color-mix(in oklab, white 40%, transparent);
	}
	.p-count {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-subtle);
		background: var(--surface-inset);
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: var(--radius-full);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.p-link.active .p-count {
		background: color-mix(in oklab, var(--accent) 22%, transparent);
		color: var(--accent-text);
	}

	/* Footer / user menu */
	.side-foot {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--border);
	}
	.menu-wrap {
		position: relative;
		flex: 1;
		min-width: 0;
	}
	.user {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2);
		border-radius: var(--radius-md);
		transition: background var(--transition-fast);
	}
	.user:hover {
		background: var(--surface-hover);
	}
	.user-name {
		flex: 1;
		text-align: left;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text);
	}
	:global(.user .user-chev) {
		color: var(--text-faint);
		flex-shrink: 0;
	}
	.menu-scrim {
		position: fixed;
		inset: 0;
		z-index: var(--z-dropdown);
		cursor: default;
	}
	.menu {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 0;
		right: 0;
		z-index: calc(var(--z-dropdown) + 1);
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		padding: var(--space-1);
	}
	.menu hr {
		margin: var(--space-1) 0;
		border-color: var(--border-subtle);
	}
	.menu-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		color: var(--text);
		text-align: left;
	}
	.menu-item:hover {
		background: var(--surface-hover);
	}
	.menu-kbd {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-subtle);
		background: var(--surface-inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-xs);
		padding: 0 6px;
	}
	.menu-item.danger {
		color: var(--danger);
	}

	/* Content */
	.content {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-md);
		color: var(--text-muted);
	}
	.icon-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	/* Mobile */
	@media (max-width: 820px) {
		.shell {
			grid-template-columns: 1fr;
		}
		.topbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-3);
			padding: var(--space-3) var(--space-4);
			position: sticky;
			top: 0;
			z-index: var(--z-sticky);
			background: color-mix(in oklab, var(--bg) 85%, transparent);
			backdrop-filter: blur(10px);
			border-bottom: 1px solid var(--border);
		}
		.topbar-title {
			display: flex;
			align-items: center;
			gap: var(--space-2);
			font-weight: var(--weight-semibold);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.tb-icon {
			font-size: 18px;
		}
		.scrim {
			position: fixed;
			inset: 0;
			z-index: var(--z-overlay);
			background: var(--overlay-bg);
			backdrop-filter: blur(2px);
		}
		.sidebar {
			position: fixed;
			top: 0;
			left: 0;
			z-index: calc(var(--z-overlay) + 1);
			width: 280px;
			transform: translateX(-102%);
			transition: transform var(--transition-base);
			box-shadow: var(--shadow-xl);
		}
		.sidebar.open {
			transform: translateX(0);
		}
	}
</style>
