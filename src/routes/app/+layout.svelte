<script lang="ts">
	import { browser } from '$app/env';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';
	import { authClient } from '#lib/auth-client';
	import { authModal } from '#lib/components/ui/authModal.svelte';
	import AuthModal from '#lib/components/AuthModal.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import ProjectDialog from '#lib/components/ProjectDialog.svelte';
	import ProjectIcon from '#lib/components/ProjectIcon.svelte';
	import ShortcutsDialog from '#lib/components/ShortcutsDialog.svelte';
	import MembersDialog from '#lib/components/todo/MembersDialog.svelte';
	import SecretsDialog from '#lib/components/SecretsDialog.svelte';
	import TagsCategoriesDialog from '#lib/components/TagsCategoriesDialog.svelte';
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
	import { sanitizeColor, sanitizeGradient } from '#lib/color';
	import { fontStyle, googleFontsHref } from '#lib/font';
	import { formatTodosAsChecklist, formatTodosAsJson } from '#lib/todoFormat';
	import { PROJECT_STATUSES, type Member, type Role, type RowField, type ProjectStatus } from '#lib/types';

	let { data, children } = $props();

	// One stylesheet loading every custom (Google) font any of the user's projects use, so
	// the sidebar, home cards and the open project all render in their chosen typeface.
	const fontsHref = $derived(googleFontsHref(data.projects.map((p) => p.font)));

	/** Inline `--accent` (+ `--accent-gradient`) declarations for a project, sanitised so
	 *  they're safe to drop into a style attribute or a <style> tag. Empty if the colour
	 *  is somehow invalid. */
	function accentVars(p: { color: string; accentGradient: string | null }): string {
		const color = sanitizeColor(p.color);
		if (!color) return '';
		const gradient = sanitizeGradient(p.accentGradient);
		return `--accent: ${color};` + (gradient ? ` --accent-gradient: ${gradient};` : '');
	}

	let createOpen = $state(false);
	let menuOpen = $state(false);
	let sidebarOpen = $state(false);
	let shortcutsOpen = $state(false);

	// Desktop sidebar collapsed to icons. app.html restores it onto <html> before first
	// paint, and the CSS keys off that attribute so there's no flash on load.
	let collapsed = $state(browser && document.documentElement.dataset.sidebar === 'collapsed');
	// Content is clipped while the column width animates so labels don't spill out.
	let resizing = $state(false);

	function setCollapsed(value: boolean) {
		if (value === collapsed) return;
		// Folders can't be edited collapsed, so commit any rename in progress first.
		if (value && renamingId) (document.activeElement as HTMLElement | null)?.blur();
		renamingId = null;
		collapsed = value;
		resizing = true;
		if (value) document.documentElement.dataset.sidebar = 'collapsed';
		else delete document.documentElement.dataset.sidebar;
		localStorage.setItem('duet-sidebar', value ? 'collapsed' : 'expanded');
	}

	const activeSlug = $derived(page.params.slug);
	const activeProject = $derived(data.projects.find((p) => p.slug === activeSlug));
	// The open project's colour themes the whole document, so the page background glow and
	// anything rendered outside the project subtree (dialogs, bulk bar) match it. The values
	// are sanitised before they reach this <style> tag.
	const rootAccentStyle = $derived(
		activeProject && accentVars(activeProject)
			? `<style>html:root { ${accentVars(activeProject)} }</style>`
			: ''
	);
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
		if (collapsed) return;
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
		if (collapsed) return;
		sidebar = sidebar.flatMap((i) =>
			i.type === 'folder' && i.id === id
				? i.projectIds.map((pid) => ({ type: 'project' as const, id: pid }))
				: [i]
		);
		folders = folders.filter((f) => f.id !== id);
		persist(api(`/api/folders/${id}`, 'DELETE'));
	}

	// ─── Project context menu ────────────────────────────────────────────────
	type SidebarProject = (typeof data.projects)[number];
	interface ProjectFull {
		id: string;
		name: string;
		description: string | null;
		color: string;
		accentGradient: string | null;
		icon: string;
		iconUrl: string | null;
		font: string;
		status: ProjectStatus;
		hiddenFields: RowField[];
		listWidthSetting: number | null;
		countSubtasksSetting: boolean | null;
	}
	interface Invite {
		id: string;
		email: string;
		role: Role;
	}

	let renamingProjectId = $state<string | null>(null);
	let projectMenu = $state<{ id: string; x: number; y: number; submenuFlip: boolean } | null>(null);
	let projectMenuEl: HTMLElement | undefined = $state();
	let statusMenuOpen = $state(false);
	const menuProject = $derived(projectMenu ? projectById.get(projectMenu.id) : undefined);
	const isOwner = (p: SidebarProject) => p.role === 'owner';
	const isEditor = (p: SidebarProject) => p.role === 'owner' || p.role === 'editor';

	let settingsOpen = $state(false);
	let settingsProject = $state<ProjectFull | null>(null);
	let membersOpen = $state(false);
	let membersFor = $state<string | null>(null);
	let membersData = $state<{ members: Member[]; invites: Invite[] } | null>(null);
	let secretsOpen = $state(false);
	let secretsFor = $state<string | null>(null);
	let tagsCategoriesOpen = $state(false);
	let tagsCategoriesFor = $state<string | null>(null);

	function openProjectMenu(e: MouseEvent, p: SidebarProject) {
		e.preventDefault();
		statusMenuOpen = false;
		const w = 230;
		const h = 340;
		const x = Math.max(8, Math.min(e.clientX, window.innerWidth - w - 8));
		const y = Math.max(8, Math.min(e.clientY, window.innerHeight - h - 8));
		// Flip the "Change status" flyout to the left if there's no room for it on the right.
		const submenuFlip = x + w + 172 > window.innerWidth;
		projectMenu = { id: p.id, x, y, submenuFlip };
	}

	function closeProjectMenu() {
		projectMenu = null;
		statusMenuOpen = false;
	}

	function startProjectRename(p: SidebarProject) {
		closeProjectMenu();
		if (collapsed) setCollapsed(false);
		renamingProjectId = p.id;
	}

	function finishProjectRename(p: SidebarProject, input: HTMLInputElement, save: boolean) {
		if (renamingProjectId !== p.id) return;
		renamingProjectId = null;
		const name = input.value.trim();
		if (save && name && name !== p.name) persist(api(`/api/projects/${p.id}`, 'PATCH', { name }));
	}

	function setProjectStatus(p: SidebarProject, status: ProjectStatus) {
		closeProjectMenu();
		if (status !== p.status) persist(api(`/api/projects/${p.id}`, 'PATCH', { status }));
	}

	async function openSettings(p: SidebarProject) {
		closeProjectMenu();
		try {
			settingsProject = await api(`/api/projects/${p.id}`, 'GET');
			settingsOpen = true;
		} catch (e) {
			toasts.error((e as Error).message);
		}
	}

	async function loadMembers(id: string) {
		try {
			membersData = await api(`/api/projects/${id}/members`, 'GET');
		} catch (e) {
			toasts.error((e as Error).message);
		}
	}

	async function openMembers(p: SidebarProject) {
		closeProjectMenu();
		membersFor = p.id;
		await loadMembers(p.id);
		membersOpen = true;
	}

	function openSecrets(p: SidebarProject) {
		closeProjectMenu();
		secretsFor = p.id;
		secretsOpen = true;
	}

	function openTagsCategories(p: SidebarProject) {
		closeProjectMenu();
		tagsCategoriesFor = p.id;
		tagsCategoriesOpen = true;
	}

	async function exportProject(p: SidebarProject, kind: 'clipboard' | 'file') {
		closeProjectMenu();
		try {
			const { todos } = await api(`/api/projects/${p.id}/todos`, 'GET');
			if (kind === 'clipboard') {
				await navigator.clipboard.writeText(formatTodosAsChecklist(todos));
				toasts.success(`Copied ${todos.length} task${todos.length === 1 ? '' : 's'} to clipboard`);
			} else {
				const json = formatTodosAsJson(todos, p);
				const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
				const a = document.createElement('a');
				a.href = url;
				a.download = `${p.slug}-tasks-${new Date().toISOString().slice(0, 10)}.json`;
				a.click();
				URL.revokeObjectURL(url);
			}
		} catch (e) {
			toasts.error((e as Error).message ?? 'Could not export');
		}
	}

	async function requestDeleteProject(p: SidebarProject) {
		closeProjectMenu();
		if (!confirm(`Delete "${p.name}" and all its tasks? This cannot be undone.`)) return;
		try {
			await api(`/api/projects/${p.id}`, 'DELETE');
		} catch (e) {
			toasts.error((e as Error).message);
			return;
		}
		if (activeSlug === p.slug) await goto('/app', { invalidateAll: true });
		else await invalidateAll();
	}

	// ─── Drag to reorder / move between folders ─────────────────────────────
	let dragging = $state<SidebarDrag | null>(null);
	let dropTarget = $state<SidebarDrop | null>(null);

	function ondragstart(e: DragEvent, drag: SidebarDrag) {
		// Collapsed, folders are just dividers: they can't be moved, and nothing can be moved into them.
		if (collapsed) {
			e.preventDefault();
			return;
		}
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

	// Any /api/* request can 401 once the session expires (cookie cleared, revoked
	// elsewhere, etc). Catch that in one place rather than at every call site so the
	// user gets a sign-in modal instead of being bounced to a dead page.
	onMount(() => {
		const nativeFetch = window.fetch.bind(window);
		window.fetch = async (input, init) => {
			const res = await nativeFetch(input, init);
			if (res.status === 401) {
				const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
				if (url.startsWith('/api/') && !url.startsWith('/api/auth')) authModal.show();
			}
			return res;
		};
		return () => {
			window.fetch = nativeFetch;
		};
	});

	function onWindowPointerDown(e: PointerEvent) {
		if (projectMenu && !projectMenuEl?.contains(e.target as Node)) closeProjectMenu();
	}

	// App-wide shortcuts: help and project switching. Task shortcuts live on the project page.
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && projectMenu) {
			closeProjectMenu();
			return;
		}
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
		closeProjectMenu();
	});
</script>

<svelte:window {onkeydown} onpointerdown={onWindowPointerDown} />

<svelte:head>
	{@html rootAccentStyle}
	{#if fontsHref}
		<link rel="preconnect" href="https://fonts.googleapis.com" />
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
		<link rel="stylesheet" href={fontsHref} />
	{/if}
</svelte:head>

{#snippet projectLink(p: (typeof data.projects)[number], folderId: string | null = null)}
	{@const openCount = liveCounts[p.id] ?? p.openCount}
	{@const movable = p.status !== 'archived'}
	{@const renaming = renamingProjectId === p.id}
	{#if renaming}
		<div
			class="p-link renaming {movable ? dropClass(p.id) : ''}"
			class:nested={!!folderId}
			class:dragged={dragging?.id === p.id}
			style={accentVars(p) + fontStyle(p.font)}
		>
			<span class="p-icon"><ProjectIcon icon={p.icon} iconUrl={p.iconUrl} /></span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="p-rename"
				value={p.name}
				maxlength="160"
				aria-label="Project name"
				autofocus
				onfocus={(e) => e.currentTarget.select()}
				onblur={(e) => finishProjectRename(p, e.currentTarget, true)}
				onkeydown={(e) => {
					if (e.key === 'Enter') finishProjectRename(p, e.currentTarget, true);
					else if (e.key === 'Escape') finishProjectRename(p, e.currentTarget, false);
				}}
			/>
		</div>
	{:else}
		<a
			href="/app/{p.slug}"
			class="p-link {movable ? dropClass(p.id) : ''}"
			class:active={p.slug === activeSlug}
			class:archived={p.status === 'archived'}
			class:nested={!!folderId}
			class:dragged={dragging?.id === p.id}
			class:menu-open={projectMenu?.id === p.id}
			style={accentVars(p) + fontStyle(p.font)}
			title={collapsed ? (openCount > 0 ? `${p.name} (${openCount})` : p.name) : undefined}
			draggable={movable}
			data-drop-id={movable ? p.id : undefined}
			data-drop-kind="project"
			data-drop-folder={folderId ?? undefined}
			ondragstart={(e) => ondragstart(e, { type: 'project', id: p.id })}
			{ondragend}
			oncontextmenu={(e) => openProjectMenu(e, p)}
		>
			<span class="p-icon"><ProjectIcon icon={p.icon} iconUrl={p.iconUrl} /></span>
			<span class="p-name truncate">{p.name}</span>
			{#if p.status === 'live'}
				<span class="p-live" title="Live"></span>
			{/if}
			{#if openCount > 0}
				<span class="p-count">{openCount}</span>
			{:else if p.totalCount > 0}
				<span class="p-done" title="All tasks done"><Icon name="check" size={13} strokeWidth={3} /></span>
			{/if}
		</a>
	{/if}
{/snippet}

<div
	class="shell"
	ontransitionend={(e) => {
		if (e.target === e.currentTarget) resizing = false;
	}}
>
	<!-- Mobile top bar -->
	<header class="topbar">
		<button class="icon-btn" aria-label="Menu" onclick={() => (sidebarOpen = true)}>
			<Icon name="menu" size={20} />
		</button>
		<span class="topbar-title">
			{#if activeProject}
				<span class="tb-icon"><ProjectIcon icon={activeProject.icon} iconUrl={activeProject.iconUrl} /></span><span class="tb-name">{activeProject.name}</span>
			{:else}
				<Logo size={22} />
			{/if}
		</span>
		<a href="/app" class="icon-btn" aria-label="Home">
			<Icon name="home" size={20} />
		</a>
	</header>

	{#if sidebarOpen}
		<button class="scrim" aria-label="Close menu" onclick={() => (sidebarOpen = false)}></button>
	{/if}

	<aside class="sidebar" class:open={sidebarOpen} class:resizing>
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
			<span class="p-icon"><Icon name="home" size={15} /></span>
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
			onscroll={closeProjectMenu}
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
												onclick={() => {
													if (!collapsed) renamingId = folder.id;
												}}
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
						<a
							class="menu-item"
							href="/app/settings"
							role="menuitem"
							onclick={() => (menuOpen = false)}
						>
							<Icon name="settings" size={16} /> Settings
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
						<div class="menu-version">Duet v{__APP_VERSION__}</div>
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

{#if projectMenu && menuProject}
	<div class="ctx-menu" role="menu" bind:this={projectMenuEl} style="left: {projectMenu.x}px; top: {projectMenu.y}px;">
		<button class="menu-item" role="menuitem" onclick={() => startProjectRename(menuProject)}>
			<Icon name="pencil" size={15} /> Rename
		</button>
		{#if isOwner(menuProject)}
			<div
				class="submenu-wrap"
				role="none"
				onmouseenter={() => (statusMenuOpen = true)}
				onmouseleave={() => (statusMenuOpen = false)}
			>
				<button
					class="menu-item"
					role="menuitem"
					aria-haspopup="menu"
					aria-expanded={statusMenuOpen}
					onfocus={() => (statusMenuOpen = true)}
				>
					<Icon name="flag" size={15} />
					<span style="flex: 1">Change status</span>
					<Icon name="chevron-right" size={14} />
				</button>
				{#if statusMenuOpen}
					<div class="submenu-list" class:flip={projectMenu?.submenuFlip}>
						{#each PROJECT_STATUSES as s (s.value)}
							<button class="menu-item" role="menuitem" onclick={() => setProjectStatus(menuProject, s.value)}>
								<span class="status-dot status-{s.value}"></span>
								<span style="flex: 1">{s.label}</span>
								{#if menuProject.status === s.value}<Icon name="check" size={14} />{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
		<hr />
		<button class="menu-item" role="menuitem" onclick={() => openMembers(menuProject)}>
			<Icon name="users" size={15} /> Members
		</button>
		{#if isEditor(menuProject)}
			<button class="menu-item" role="menuitem" onclick={() => openSecrets(menuProject)}>
				<Icon name="key" size={15} /> Keys & secrets
			</button>
			<button class="menu-item" role="menuitem" onclick={() => openTagsCategories(menuProject)}>
				<Icon name="tag" size={15} /> Tags & categories
			</button>
		{/if}
		{#if isOwner(menuProject)}
			<button class="menu-item" role="menuitem" onclick={() => openSettings(menuProject)}>
				<Icon name="settings" size={15} /> Project settings
			</button>
		{/if}
		<hr />
		<button class="menu-item" role="menuitem" onclick={() => exportProject(menuProject, 'clipboard')}>
			<Icon name="copy" size={15} /> Copy as checklist
		</button>
		<button class="menu-item" role="menuitem" onclick={() => exportProject(menuProject, 'file')}>
			<Icon name="download" size={15} /> Download JSON file
		</button>
		{#if isOwner(menuProject)}
			<hr />
			<button class="menu-item danger" role="menuitem" onclick={() => requestDeleteProject(menuProject)}>
				<Icon name="trash" size={15} /> Delete project
			</button>
		{/if}
	</div>
{/if}

<ProjectDialog bind:open={createOpen} mode="create" />
<ProjectDialog
	bind:open={settingsOpen}
	mode="edit"
	project={settingsProject ?? {}}
	defaults={data.projectDefaults}
	onrestore={() => invalidateAll()}
/>
<MembersDialog
	bind:open={membersOpen}
	projectId={membersFor ?? ''}
	members={membersData?.members ?? []}
	invites={membersData?.invites ?? []}
	currentUserId={data.user.id}
	canManage={!!membersFor && projectById.get(membersFor)?.role === 'owner'}
	onChanged={() => membersFor && loadMembers(membersFor)}
/>
<SecretsDialog bind:open={secretsOpen} projectId={secretsFor ?? ''} />
<TagsCategoriesDialog bind:open={tagsCategoriesOpen} projectId={tagsCategoriesFor ?? ''} />
<ShortcutsDialog bind:open={shortcutsOpen} />
<AuthModal bind:open={authModal.open} />

<style>
	.shell {
		display: grid;
		grid-template-columns: 264px 1fr;
		min-height: 100vh;
		transition: grid-template-columns var(--transition-base);
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
	.p-link:hover,
	.p-link.menu-open {
		background: var(--surface-hover);
		color: var(--text);
	}
	.p-link.active {
		background: var(--accent-soft);
		color: var(--accent-text);
	}
	.p-link.renaming {
		cursor: text;
	}
	.p-rename {
		flex: 1;
		min-width: 0;
		padding: 2px 6px;
		margin: -2px 0;
		font: inherit;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--accent-border, var(--border-strong));
		border-radius: var(--radius-sm);
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

	/* The app-wide style shows on the active row only; the icon stays bare so the list reads cleanly. */
	:global(:root[data-style='solid']) .p-link.active {
		background: var(--accent-gradient, var(--accent));
		color: var(--accent-contrast);
		box-shadow: var(--shadow-xs);
	}
	:global(:root[data-style='solid']) .p-link.active .p-count {
		background: color-mix(in oklab, var(--accent-contrast) 22%, transparent);
		color: var(--accent-contrast);
	}
	:global(:root[data-style='outline']) .p-link.active {
		background: transparent;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 60%, transparent);
	}
	:global(:root[data-style='glass']) .p-link.active {
		background: linear-gradient(
			90deg,
			color-mix(in oklab, var(--accent) 18%, transparent),
			color-mix(in oklab, var(--accent) 5%, transparent)
		);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 18%, transparent);
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
	.p-done {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		color: var(--success);
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
	.menu-version {
		padding: var(--space-1) var(--space-3) var(--space-1);
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	/* Project context menu */
	.ctx-menu {
		position: fixed;
		z-index: calc(var(--z-dropdown) + 1);
		width: 230px;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		padding: var(--space-1);
	}
	.ctx-menu hr {
		margin: var(--space-1) 0;
		border-color: var(--border-subtle);
	}
	.submenu-wrap {
		position: relative;
	}
	.submenu-list {
		position: absolute;
		left: 100%;
		top: -5px;
		margin-left: 2px;
		width: 170px;
		display: flex;
		flex-direction: column;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		padding: var(--space-1);
	}
	.submenu-list.flip {
		left: auto;
		right: 100%;
		margin-left: 0;
		margin-right: 2px;
	}
	.status-dot {
		width: 7px;
		height: 7px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background: var(--status-color);
	}
	.status-dot.status-not_started {
		--status-color: var(--text-subtle);
	}
	.status-dot.status-in_progress {
		--status-color: var(--warning);
	}
	.status-dot.status-live {
		--status-color: var(--success);
	}
	.status-dot.status-archived {
		--status-color: var(--text-faint);
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
		.sidebar.resizing {
			overflow: hidden;
			white-space: nowrap;
		}
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
		:global(html[data-sidebar='collapsed']) .p-done,
		:global(html[data-sidebar='collapsed']) .new-project span,
		:global(html[data-sidebar='collapsed']) .f-name,
		:global(html[data-sidebar='collapsed']) .new-folder,
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
		/* Outrank the hover/focus reveal so a collapsed folder is only its toggle. */
		:global(html[data-sidebar='collapsed']) .f-head:hover .f-actions,
		:global(html[data-sidebar='collapsed']) .f-head:focus-within .f-actions {
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
		:global(html[data-sidebar='collapsed']) .new-project {
			justify-content: center;
			padding: var(--space-2);
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
			/* auto 1fr: topbar row stays content-sized, content row absorbs leftover
			   viewport space. Without this, grid's default stretch splits extra space
			   evenly between the two auto rows, inflating the topbar on short pages. */
			grid-template-rows: auto 1fr;
			/* Sticky page content offsets by this to sit below the pinned topbar. */
			--topbar-height: calc(var(--space-3) * 2 + 36px + 1px);
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
		.topbar .icon-btn {
			flex: 0 0 auto;
		}
		.topbar-title {
			display: flex;
			align-items: center;
			gap: var(--space-2);
			min-width: 0;
			flex: 1;
			justify-content: center;
			font-weight: var(--weight-semibold);
		}
		.tb-name {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.tb-icon {
			flex: 0 0 auto;
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
