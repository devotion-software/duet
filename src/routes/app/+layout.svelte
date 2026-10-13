<script lang="ts">
	import { browser } from '$app/env';
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
	import { toasts } from '#lib/components/ui/toast.svelte';
	import {
		buildSidebar,
		moveSidebarItem,
		type SidebarDrag,
		type SidebarDrop,
		type SidebarItem
	} from '#lib/sidebar';

	let { data, children } = $props();

	let createOpen = $state(false);
	let menuOpen = $state(false);
	let sidebarOpen = $state(false);
	let shortcutsOpen = $state(false);

	// Desktop sidebar collapsed to icons. app.html restores it onto <html> before first
	// paint, and the CSS keys off that attribute so there's no flash on load.
	let collapsed = $state(browser && document.documentElement.dataset.sidebar === 'collapsed');

	function setCollapsed(value: boolean) {
		collapsed = value;
		if (value) document.documentElement.dataset.sidebar = 'collapsed';
		else delete document.documentElement.dataset.sidebar;
		localStorage.setItem('duet-sidebar', value ? 'collapsed' : 'expanded');
	}

	const activeSlug = $derived(page.params.slug);
	const activeProject = $derived(data.projects.find((p) => p.slug === activeSlug));
	const projectById = $derived(new Map(data.projects.map((p) => [p.id, p])));
	const archivedProjects = $derived(data.projects.filter((p) => p.status === 'archived'));
	// Archived projects stay collapsed unless you're viewing one.
	let archivedOpen = $state(false);
	const showArchived = $derived(archivedOpen || activeProject?.status === 'archived');

	// Folders and the sidebar arrangement are overwritten optimistically, then re-derived
	// from the server once it has caught up.
	let folders = $derived(data.folders);
	const folderById = $derived(new Map(folders.map((f) => [f.id, f])));
	let sidebar = $derived(buildSidebar(data.folders, data.projects));
	// The arrangement minus archived projects, which live in their own section.
	const isCurrent = (id: string) => {
		const p = projectById.get(id);
		return !!p && p.status !== 'archived';
	};
	const currentSidebar = $derived(
		sidebar
			.map((i) => (i.type === 'folder' ? { ...i, projectIds: i.projectIds.filter(isCurrent) } : i))
			.filter((i) => i.type === 'folder' || isCurrent(i.id))
	);
	/** A folder's projects that show: all of them when open, else just the one being viewed. */
	function visibleIn(item: Extract<SidebarItem, { type: 'folder' }>) {
		const ids = folderById.get(item.id)?.collapsed
			? item.projectIds.filter((id) => id === activeProject?.id)
			: item.projectIds;
		return ids.map((id) => projectById.get(id)!);
	}
	// Projects in sidebar order, as far as they're visible; drives the switching shortcuts.
	const navProjects = $derived([
		...currentSidebar.flatMap((i) => (i.type === 'folder' ? visibleIn(i) : [projectById.get(i.id)!])),
		...(showArchived ? archivedProjects : [])
	]);

	async function api(url: string, method: string, body?: unknown) {
		const res = await fetch(url, {
			method,
			headers: { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		if (!res.ok) {
			const err = await res.json().catch(() => null);
			throw new Error(err?.message ?? 'Something went wrong');
		}
		return res.json();
	}

	/** Run a sidebar change against the server, resyncing with it either way. */
	async function persist(request: Promise<unknown>) {
		try {
			await request;
		} catch (e) {
			toasts.error((e as Error).message);
		}
		await invalidateAll();
	}

	// ─── Folders ────────────────────────────────────────────────────────────
	let renamingId = $state<string | null>(null);

	async function createFolder() {
		// Naming the new folder needs the room.
		if (collapsed) setCollapsed(false);
		try {
			const folder = await api('/api/folders', 'POST', { name: 'New folder' });
			folders = [...folders, folder];
			sidebar = [...sidebar, { type: 'folder', id: folder.id, projectIds: [] }];
			renamingId = folder.id;
		} catch (e) {
			toasts.error((e as Error).message);
		}
	}

	function updateFolder(id: string, patch: { name?: string; collapsed?: boolean }) {
		folders = folders.map((f) => (f.id === id ? { ...f, ...patch } : f));
		persist(api(`/api/folders/${id}`, 'PATCH', patch));
	}

	function finishRename(id: string, input: HTMLInputElement, save: boolean) {
		if (renamingId !== id) return;
		renamingId = null;
		const name = input.value.trim();
		if (save && name && name !== folderById.get(id)?.name) updateFolder(id, { name });
	}

	function deleteFolder(id: string) {
		sidebar = sidebar.flatMap((i) =>
			i.type === 'folder' && i.id === id
				? i.projectIds.map((pid) => ({ type: 'project' as const, id: pid }))
				: [i]
		);
		folders = folders.filter((f) => f.id !== id);
		persist(api(`/api/folders/${id}`, 'DELETE'));
	}

	// ─── Drag to reorder / move between folders ─────────────────────────────
	let dragging = $state<SidebarDrag | null>(null);
	let dropTarget = $state<SidebarDrop | null>(null);

	function ondragstart(e: DragEvent, drag: SidebarDrag) {
		dragging = drag;
		e.dataTransfer!.effectAllowed = 'move';
		// Firefox won't start a drag without some data.
		e.dataTransfer!.setData('text/plain', drag.id);
	}

	function ondragend() {
		dragging = null;
		dropTarget = null;
	}

	/** Where the pointer would drop the dragged item, or null if it's over itself. */
	function dropAt(e: DragEvent, drag: SidebarDrag): SidebarDrop | null {
		const el = (e.target as Element).closest<HTMLElement>('[data-drop-id]');
		if (!el) return { pos: 'end' };
		const { dropId: id, dropKind: kind, dropFolder: folder } = el.dataset as Record<string, string>;
		const rect = el.getBoundingClientRect();
		const y = (e.clientY - rect.top) / rect.height;
		let drop: SidebarDrop;
		if (drag.type === 'folder') {
			// Folders stay at the top level, so aim at the folder around a nested project.
			drop = folder ? { id: folder, pos: 'after' } : { id, pos: y < 0.5 ? 'before' : 'after' };
		} else if (kind === 'folder') {
			drop = { id, pos: y < 0.25 ? 'before' : 'inside' };
		} else {
			drop = { id, pos: y < 0.5 ? 'before' : 'after' };
		}
		return 'id' in drop && drop.id === drag.id ? null : drop;
	}

	function ondragover(e: DragEvent) {
		if (!dragging) return;
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'move';
		dropTarget = dropAt(e, dragging);
	}

	function ondragleave(e: DragEvent) {
		if (!(e.currentTarget as Element).contains(e.relatedTarget as Node | null)) dropTarget = null;
	}

	function ondrop(e: DragEvent) {
		if (!dragging) return;
		e.preventDefault();
		const drop = dropAt(e, dragging);
		const drag = dragging;
		ondragend();
		if (!drop) return;
		const next = moveSidebarItem(currentSidebar, drag, drop);
		if (JSON.stringify(next) === JSON.stringify(currentSidebar)) return;
		sidebar = next;
		persist(api('/api/sidebar', 'PUT', { items: next }));
	}

	/** The drop indicator class for an item, if the pending drop is next to or inside it. */
	function dropClass(id: string) {
		return dropTarget && 'id' in dropTarget && dropTarget.id === id ? `drop-${dropTarget.pos}` : '';
	}

	async function signOut() {
		await authClient.signOut();
		await goto('/');
	}

	// App-wide shortcuts: help and project switching. Task shortcuts live on the project page.
	function onkeydown(e: KeyboardEvent) {
		if (!shortcutAllowed(e)) return;
		const projects = navProjects;
		const index = projects.findIndex((p) => p.slug === activeSlug);
		let target: (typeof projects)[number] | undefined;
		if (e.key === '?') {
			e.preventDefault();
			shortcutsOpen = true;
			return;
		} else if (e.key === '\\') {
			e.preventDefault();
			setCollapsed(!collapsed);
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

{#snippet projectLink(p: (typeof data.projects)[number], folderId: string | null = null)}
	{@const openCount = liveCounts[p.id] ?? p.openCount}
	{@const movable = p.status !== 'archived'}
	<a
		href="/app/{p.slug}"
		class="p-link style-{p.style} {movable ? dropClass(p.id) : ''}"
		class:active={p.slug === activeSlug}
		class:archived={p.status === 'archived'}
		class:nested={!!folderId}
		class:dragged={dragging?.id === p.id}
		style="--accent: {p.color}"
		title={collapsed ? (openCount > 0 ? `${p.name} (${openCount})` : p.name) : undefined}
		draggable={movable}
		data-drop-id={movable ? p.id : undefined}
		data-drop-kind="project"
		data-drop-folder={folderId ?? undefined}
		ondragstart={(e) => ondragstart(e, { type: 'project', id: p.id })}
		{ondragend}
	>
		<span class="p-icon"><ProjectIcon icon={p.icon} iconUrl={p.iconUrl} /></span>
		<span class="p-name truncate">{p.name}</span>
		{#if p.status === 'live'}
			<span class="p-live" title="Live"></span>
		{/if}
		{#if openCount > 0}
			<span class="p-count">{openCount}</span>
		{/if}
	</a>
{/snippet}

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
			<button
				class="collapse-btn"
				title="{collapsed ? 'Expand' : 'Collapse'} sidebar (\)"
				aria-label="{collapsed ? 'Expand' : 'Collapse'} sidebar"
				aria-expanded={!collapsed}
				onclick={() => setCollapsed(!collapsed)}
			>
				<Icon name="panel-left" size={17} />
			</button>
		</div>

		<a
			href="/app"
			class="p-link home-link"
			class:active={page.url.pathname === '/app'}
			title={collapsed ? 'Home' : undefined}
		>
			<span class="p-icon"><Icon name="inbox" size={15} /></span>
			<span class="p-name">Home</span>
		</a>

		<div class="new-row">
			<button
				class="new-project"
				title={collapsed ? 'New project' : undefined}
				onclick={() => (createOpen = true)}
			>
				<Icon name="plus" size={17} />
				<span>New project</span>
			</button>
			<button class="new-folder" title="New folder" aria-label="New folder" onclick={createFolder}>
				<Icon name="folder-plus" size={17} />
			</button>
		</div>

		<nav
			class="projects"
			class:drop-end={dropTarget?.pos === 'end'}
			aria-label="Projects"
			{ondragover}
			{ondragleave}
			{ondrop}
		>
			{#if data.projects.length === 0 && folders.length === 0}
				<p class="no-projects">No projects yet.<br />Create your first one above.</p>
			{:else}
				{#each currentSidebar as item (item.id)}
					{#if item.type === 'folder'}
						{@const folder = folderById.get(item.id)}
						{#if folder}
							<div class="folder {dropClass(folder.id)}" class:dragged={dragging?.id === folder.id}>
								<div
									class="f-head"
									role="listitem"
									draggable={renamingId !== folder.id}
									data-drop-id={folder.id}
									data-drop-kind="folder"
									ondragstart={(e) => ondragstart(e, { type: 'folder', id: folder.id })}
									{ondragend}
								>
									{#if renamingId === folder.id}
										<span class="f-toggle">
											<Icon name="folder" size={15} />
											<!-- svelte-ignore a11y_autofocus -->
											<input
												class="f-rename"
												value={folder.name}
												maxlength="80"
												aria-label="Folder name"
												autofocus
												onfocus={(e) => e.currentTarget.select()}
												onblur={(e) => finishRename(folder.id, e.currentTarget, true)}
												onkeydown={(e) => {
													if (e.key === 'Enter') finishRename(folder.id, e.currentTarget, true);
													else if (e.key === 'Escape') finishRename(folder.id, e.currentTarget, false);
												}}
											/>
										</span>
									{:else}
										<button
											class="f-toggle"
											aria-expanded={!folder.collapsed}
											title={collapsed ? folder.name : undefined}
											onclick={() => updateFolder(folder.id, { collapsed: !folder.collapsed })}
											ondblclick={() => {
												if (!collapsed) renamingId = folder.id;
											}}
										>
											<Icon name={folder.collapsed ? 'chevron-right' : 'chevron-down'} size={14} />
											<span class="f-name truncate">{folder.name}</span>
										</button>
										<span class="f-actions">
											<button
												class="f-action"
												title="Rename folder"
												aria-label="Rename folder"
												onclick={() => (renamingId = folder.id)}
											>
												<Icon name="pencil" size={13} />
											</button>
											<button
												class="f-action"
												title="Delete folder (keeps its projects)"
												aria-label="Delete folder"
												onclick={() => deleteFolder(folder.id)}
											>
												<Icon name="trash" size={13} />
											</button>
										</span>
										{#if folder.collapsed && item.projectIds.length}
											<span class="f-count">{item.projectIds.length}</span>
										{/if}
									{/if}
								</div>
								{#each visibleIn(item) as p (p.id)}
									{@render projectLink(p, folder.id)}
								{:else}
									{#if !folder.collapsed}
										<p class="f-empty">Drag projects here</p>
									{/if}
								{/each}
							</div>
						{/if}
					{:else}
						{@render projectLink(projectById.get(item.id)!)}
					{/if}
				{/each}
				{#if archivedProjects.length}
					<button
						class="archived-toggle"
						aria-expanded={showArchived}
						title={collapsed ? `Archived (${archivedProjects.length})` : undefined}
						onclick={() => (archivedOpen = !showArchived)}
					>
						<Icon name={showArchived ? 'chevron-down' : 'chevron-right'} size={14} />
						<span class="archived-label">Archived</span>
						<span class="archived-count">{archivedProjects.length}</span>
					</button>
					{#if showArchived}
						{#each archivedProjects as p (p.id)}
							{@render projectLink(p)}
						{/each}
					{/if}
				{/if}
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
				<button
					class="user"
					title={collapsed ? data.user.name || data.user.email : undefined}
					onclick={() => (menuOpen = !menuOpen)}
					aria-haspopup="menu"
				>
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
	.collapse-btn {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: var(--radius-md);
		color: var(--text-faint);
		transition:
			background var(--transition-fast),
			color var(--transition-fast);
	}
	.collapse-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
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
		position: relative;
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
	.p-live {
		width: 7px;
		height: 7px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background: var(--success);
	}
	.p-link.archived:not(.active) {
		opacity: 0.65;
	}
	.archived-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin-top: var(--space-3);
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-faint);
		border-radius: var(--radius-sm);
	}
	.archived-toggle:hover {
		color: var(--text-muted);
	}
	.archived-count {
		font-weight: var(--weight-medium);
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

	/* Folders */
	.home-link {
		margin-bottom: var(--space-1);
	}
	.new-row {
		display: flex;
		gap: var(--space-2);
	}
	.new-folder {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 40px;
		color: var(--text-muted);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-xs);
		transition: all var(--transition-fast);
	}
	.new-folder:hover {
		color: var(--text);
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}
	.folder {
		display: flex;
		flex-direction: column;
		gap: 1px;
		border-radius: var(--radius-md);
	}
	.folder + .folder,
	.p-link + .folder,
	.folder + .p-link {
		margin-top: var(--space-1);
	}
	.f-head {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 32px;
		padding-right: var(--space-2);
		border-radius: var(--radius-md);
		color: var(--text-subtle);
	}
	.f-head:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.f-toggle {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1-5, 0.375rem) var(--space-3);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: inherit;
		text-align: left;
	}
	.f-rename {
		flex: 1;
		min-width: 0;
		padding: 2px 6px;
		margin: -3px 0;
		font: inherit;
		text-transform: none;
		letter-spacing: normal;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--accent-border, var(--border-strong));
		border-radius: var(--radius-sm);
	}
	.f-actions {
		display: none;
		gap: 2px;
	}
	.f-head:hover .f-actions,
	.f-head:focus-within .f-actions {
		display: flex;
	}
	@media (hover: none) {
		.f-actions {
			display: flex;
		}
	}
	.f-action {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-sm);
		color: var(--text-faint);
	}
	.f-action:hover {
		color: var(--text);
		background: var(--surface-inset);
	}
	.f-count {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--text-faint);
	}
	.f-head:hover .f-count {
		display: none;
	}
	.f-empty {
		padding: var(--space-1) var(--space-3) var(--space-2) calc(var(--space-3) + 22px);
		font-size: var(--text-xs);
		color: var(--text-faint);
	}
	.p-link.nested {
		padding-left: calc(var(--space-3) + 14px);
	}

	/* Drag and drop */
	.p-link[draggable='true'],
	.f-head[draggable='true'] {
		-webkit-user-drag: element;
	}
	.dragged {
		opacity: 0.4;
	}
	.p-link.drop-before,
	.folder.drop-before {
		box-shadow: inset 0 2px 0 var(--accent);
	}
	.p-link.drop-after,
	.folder.drop-after {
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.folder.drop-inside > .f-head {
		background: var(--surface-hover);
		box-shadow: inset 0 0 0 1.5px var(--accent);
		color: var(--text);
	}
	.projects.drop-end {
		box-shadow: inset 0 -2px 0 var(--accent);
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

	/* Collapsed to icons (desktop only; the mobile sidebar is a drawer) */
	@media (min-width: 821px) {
		:global(html[data-sidebar='collapsed']) .shell {
			grid-template-columns: 68px 1fr;
		}
		:global(html[data-sidebar='collapsed']) .sidebar {
			padding: var(--space-4) var(--space-3);
		}
		:global(html[data-sidebar='collapsed']) .side-head {
			flex-direction: column;
			gap: var(--space-2);
			padding: var(--space-2) 0 var(--space-3);
		}
		:global(html[data-sidebar='collapsed']) .brand :global(.word),
		:global(html[data-sidebar='collapsed']) .p-name,
		:global(html[data-sidebar='collapsed']) .p-count,
		:global(html[data-sidebar='collapsed']) .new-project span,
		:global(html[data-sidebar='collapsed']) .f-name,
		:global(html[data-sidebar='collapsed']) .f-actions,
		:global(html[data-sidebar='collapsed']) .f-count,
		:global(html[data-sidebar='collapsed']) .f-empty,
		:global(html[data-sidebar='collapsed']) .archived-label,
		:global(html[data-sidebar='collapsed']) .archived-count,
		:global(html[data-sidebar='collapsed']) .no-projects,
		:global(html[data-sidebar='collapsed']) .user-name,
		:global(html[data-sidebar='collapsed'] .user .user-chev) {
			display: none;
		}
		:global(html[data-sidebar='collapsed']) .p-link,
		:global(html[data-sidebar='collapsed']) .p-link.nested {
			justify-content: center;
			padding: var(--space-2);
		}
		/* With no name beside it, the live dot sits on the icon's corner. */
		:global(html[data-sidebar='collapsed']) .p-live {
			position: absolute;
			top: 4px;
			right: 4px;
			box-shadow: 0 0 0 2px var(--surface-2);
		}
		:global(html[data-sidebar='collapsed']) .new-row {
			flex-direction: column;
		}
		:global(html[data-sidebar='collapsed']) .new-project {
			justify-content: center;
			padding: var(--space-2);
		}
		:global(html[data-sidebar='collapsed']) .new-folder {
			width: 100%;
			height: 36px;
		}
		/* Folders shrink to a divider with a chevron that still opens and closes them. */
		:global(html[data-sidebar='collapsed']) .f-head {
			min-height: 24px;
			padding: 0;
			border-top: 1px solid var(--border);
			border-radius: 0;
		}
		:global(html[data-sidebar='collapsed']) .f-toggle,
		:global(html[data-sidebar='collapsed']) .archived-toggle {
			justify-content: center;
			padding: var(--space-1);
		}
		:global(html[data-sidebar='collapsed']) .side-foot {
			flex-direction: column;
		}
		:global(html[data-sidebar='collapsed']) .user {
			justify-content: center;
			padding: var(--space-1);
		}
		:global(html[data-sidebar='collapsed']) .menu {
			right: auto;
			width: 220px;
		}
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
		.collapse-btn {
			display: none;
		}
	}
</style>
