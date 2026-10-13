<script lang="ts">
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';
	import { authClient } from '#lib/auth-client';
	import Logo from '#lib/components/Logo.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import ProjectDialog from '#lib/components/ProjectDialog.svelte';

	let { data, children } = $props();

	let createOpen = $state(false);
	let menuOpen = $state(false);
	let sidebarOpen = $state(false);

	const activeSlug = $derived(page.params.slug);
	const activeProject = $derived(data.projects.find((p) => p.slug === activeSlug));

	async function signOut() {
		await authClient.signOut();
		await goto('/');
	}

	// Close the mobile sidebar whenever navigation changes the route.
	$effect(() => {
		void page.url.pathname;
		sidebarOpen = false;
	});
</script>

<div class="shell">
	<!-- Mobile top bar -->
	<header class="topbar">
		<button class="icon-btn" aria-label="Menu" onclick={() => (sidebarOpen = true)}>
			<Icon name="menu" size={20} />
		</button>
		<span class="topbar-title">
			{#if activeProject}
				<span class="tb-icon">{activeProject.icon}</span>{activeProject.name}
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
					<a
						href="/app/{p.slug}"
						class="p-link"
						class:active={p.slug === activeSlug}
						style="--accent: {p.color}"
					>
						<span class="p-icon">{p.icon}</span>
						<span class="p-name truncate">{p.name}</span>
						{#if p.openCount > 0}
							<span class="p-count">{p.openCount}</span>
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
