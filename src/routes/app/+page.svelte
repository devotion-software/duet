<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import ProjectDialog from '#lib/components/ProjectDialog.svelte';
	import InviteDialog from '#lib/components/InviteDialog.svelte';
	import ProjectBulkBar from '#lib/components/ProjectBulkBar.svelte';
	import ProjectIcon from '#lib/components/ProjectIcon.svelte';
	import ProjectStatusBadge from '#lib/components/ProjectStatusBadge.svelte';
	import { toasts } from '#lib/components/ui/toast.svelte';
	import { buildSidebar, moveSidebarItem, type SidebarDrag, type SidebarDrop } from '#lib/sidebar';
	import { deadlineInfo } from '#lib/date';
	import { fontStyle } from '#lib/font';
	import { formatTodosAsChecklist, formatTodosAsJson } from '#lib/todoFormat';
	import { hydrateTodo, type ProjectStatus, type Member } from '#lib/types';

	let { data } = $props();

	let createOpen = $state(false);
	let inviteOpen = $state(false);
	let inviteProjects = $state<(typeof data.projects)>([]);
	const ownedProjects = $derived(
		data.projects.filter((p) => p.role === 'owner' && p.status !== 'archived')
	);

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

	async function createFolder() {
		try {
			await fetch('/api/folders', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: 'New folder' })
			});
		} catch (e) {
			toasts.error((e as Error).message ?? 'Could not create folder');
		}
		await invalidateAll();
	}

	const projectById = $derived(new Map(data.projects.map((p) => [p.id, p])));
	const folderById = $derived(new Map(data.folders.map((f) => [f.id, f])));
	const isCurrent = (id: string) => projectById.get(id)!.status !== 'archived';
	// The sidebar arrangement, archived projects dropped. Overwritten optimistically on
	// drag-drop, then re-derived from the server once it has caught up (see +layout.svelte).
	let currentSidebar = $derived(
		buildSidebar(data.folders, data.projects)
			.map((i) => (i.type === 'folder' ? { ...i, projectIds: i.projectIds.filter(isCurrent) } : i))
			.filter((i) => i.type === 'folder' || isCurrent(i.id))
	);
	// Current projects grouped as in the sidebar: each folder is a group, and runs of
	// unfoldered projects between them share an unnamed one. Empty groups are dropped.
	const groups = $derived.by(() => {
		const out: {
			id: string;
			folder: (typeof data.folders)[number] | null;
			projectIds: string[];
		}[] = [];
		for (const item of currentSidebar) {
			if (item.type === 'folder') {
				out.push({ id: item.id, folder: folderById.get(item.id)!, projectIds: item.projectIds });
			} else {
				const last = out.at(-1);
				if (last && !last.folder) last.projectIds.push(item.id);
				else out.push({ id: `loose-${item.id}`, folder: null, projectIds: [item.id] });
			}
		}
		return out
			.filter((g) => g.projectIds.length)
			.map((g) => ({ ...g, projects: g.projectIds.map((id) => projectById.get(id)!) }));
	});
	const projects = $derived(groups.flatMap((g) => g.projects));

	// ─── Multi-select ────────────────────────────────────────────────────────
	let selectMode = $state(false);
	const selectedIds = new SvelteSet<string>();
	const selecting = $derived(selectMode || selectedIds.size > 0);

	// Drop selections for projects that disappear (deleted, archived away).
	$effect(() => {
		const ids = new Set(projects.map((p) => p.id));
		for (const id of selectedIds) if (!ids.has(id)) selectedIds.delete(id);
	});

	function selectProject(id: string, e: MouseEvent) {
		e.preventDefault();
		if (selectedIds.has(id)) selectedIds.delete(id);
		else selectedIds.add(id);
	}
	function selectAll() {
		for (const p of projects) selectedIds.add(p.id);
	}
	function toggleGroupSelection(ids: string[]) {
		const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
		for (const id of ids) {
			if (allSelected) selectedIds.delete(id);
			else selectedIds.add(id);
		}
		selectMode = true;
	}
	function clearSelection() {
		selectedIds.clear();
		selectMode = false;
	}
	const selectedProjects = $derived(projects.filter((p) => selectedIds.has(p.id)));

	async function renameSelected(name: string) {
		const p = selectedProjects[0];
		if (!p) return false;
		try {
			await api(`/api/projects/${p.id}`, 'PATCH', { name });
			await invalidateAll();
			return true;
		} catch (e) {
			toasts.error((e as Error).message);
			return false;
		}
	}

	async function setStatusSelected(status: ProjectStatus) {
		try {
			await api('/api/projects/bulk', 'PATCH', { ids: [...selectedIds], status });
			await invalidateAll();
			return true;
		} catch (e) {
			toasts.error((e as Error).message);
			return false;
		}
	}

	async function moveSelectedToFolder(folderId: string | null) {
		const full = buildSidebar(data.folders, data.projects);
		const ids = new Set(selectedIds);
		const stripped = full
			.map((i) => (i.type === 'folder' ? { ...i, projectIds: i.projectIds.filter((id) => !ids.has(id)) } : i))
			.filter((i) => i.type === 'folder' || !ids.has(i.id));
		const next = folderId
			? stripped.map((i) =>
					i.type === 'folder' && i.id === folderId
						? { ...i, projectIds: [...i.projectIds, ...ids] }
						: i
				)
			: [...stripped, ...[...ids].map((id) => ({ type: 'project' as const, id }))];
		try {
			await api('/api/sidebar', 'PUT', { items: next });
			await invalidateAll();
			return true;
		} catch (e) {
			toasts.error((e as Error).message);
			return false;
		}
	}

	function inviteSelected() {
		inviteProjects = selectedProjects;
		inviteOpen = true;
	}

	async function loadSelectedMembers(): Promise<Member[]> {
		try {
			const lists = await Promise.all(
				[...selectedIds].map((id) => api(`/api/projects/${id}/members`, 'GET').then((r) => r.members as Member[]))
			);
			const byId = new Map<string, Member>();
			for (const list of lists) for (const m of list) byId.set(m.userId, m);
			return [...byId.values()];
		} catch (e) {
			toasts.error((e as Error).message);
			return [];
		}
	}

	async function removeMemberFromSelected(userId: string) {
		try {
			await Promise.all(
				[...selectedIds].map((id) =>
					api(`/api/projects/${id}/members/${userId}`, 'DELETE').catch(() => null)
				)
			);
			return true;
		} catch (e) {
			toasts.error((e as Error).message);
			return false;
		}
	}

	async function copySelected() {
		try {
			const chunks = await Promise.all(
				selectedProjects.map(async (p) => {
					const { todos } = await api(`/api/projects/${p.id}/todos`, 'GET');
					return `# ${p.name}\n\n${formatTodosAsChecklist(todos.map(hydrateTodo))}`;
				})
			);
			await navigator.clipboard.writeText(chunks.join('\n\n'));
			toasts.success(`Copied ${selectedProjects.length} project${selectedProjects.length === 1 ? '' : 's'} to clipboard`);
			return true;
		} catch (e) {
			toasts.error((e as Error).message ?? 'Could not copy');
			return false;
		}
	}

	async function downloadSelected() {
		try {
			const bundles = await Promise.all(
				selectedProjects.map(async (p) => {
					const { todos } = await api(`/api/projects/${p.id}/todos`, 'GET');
					return JSON.parse(formatTodosAsJson(todos.map(hydrateTodo), p));
				})
			);
			const json = JSON.stringify({ exportedAt: new Date().toISOString(), projects: bundles }, null, 2);
			const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
			const a = document.createElement('a');
			a.href = url;
			a.download = `projects-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(url);
			return true;
		} catch (e) {
			toasts.error((e as Error).message ?? 'Could not export');
			return false;
		}
	}

	async function deleteSelected() {
		try {
			await api('/api/projects/bulk', 'DELETE', { ids: [...selectedIds] });
			await invalidateAll();
			return true;
		} catch (e) {
			toasts.error((e as Error).message);
			return false;
		}
	}

	// ─── Drag to reorder / move between folders ─────────────────────────────
	let dragging = $state<SidebarDrag | null>(null);
	let dropTarget = $state<SidebarDrop | null>(null);

	function ondragstart(e: DragEvent, id: string) {
		dragging = { type: 'project', id };
		e.dataTransfer!.effectAllowed = 'move';
		// Firefox won't start a drag without some data.
		e.dataTransfer!.setData('text/plain', id);
	}

	function ondragend() {
		dragging = null;
		dropTarget = null;
	}

	/** Where the pointer would drop the dragged card, or null if it's over itself. */
	function dropAt(e: DragEvent): SidebarDrop | null {
		const el = (e.target as Element).closest<HTMLElement>('[data-drop-id]');
		if (!el) return { pos: 'end' };
		const { dropId: id, dropKind: kind } = el.dataset as Record<string, string>;
		if (kind === 'folder') return { id, pos: 'inside' };
		if (id === dragging?.id) return null;
		const rect = el.getBoundingClientRect();
		const pos = (e.clientX - rect.left) / rect.width < 0.5 ? 'before' : 'after';
		return { id, pos };
	}

	function ondragover(e: DragEvent) {
		if (!dragging) return;
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'move';
		dropTarget = dropAt(e);
	}

	function ondragleave(e: DragEvent) {
		if (!(e.currentTarget as Element).contains(e.relatedTarget as Node | null)) dropTarget = null;
	}

	async function ondrop(e: DragEvent) {
		if (!dragging) return;
		e.preventDefault();
		const drop = dropAt(e);
		const drag = dragging;
		ondragend();
		if (!drop) return;
		const next = moveSidebarItem(currentSidebar, drag, drop);
		if (JSON.stringify(next) === JSON.stringify(currentSidebar)) return;
		currentSidebar = next;
		try {
			await fetch('/api/sidebar', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ items: next })
			});
		} catch (e) {
			toasts.error((e as Error).message ?? 'Could not reorder');
		}
		await invalidateAll();
	}

	/** The drop indicator class for a card or folder, if the pending drop is next to or inside it. */
	function dropClass(id: string) {
		return dropTarget && 'id' in dropTarget && dropTarget.id === id ? `drop-${dropTarget.pos}` : '';
	}

	let collapsedFolders = $derived(new Set(data.collapsedFolders));
	function persistFolders(next: Set<string>) {
		collapsedFolders = next;
		document.cookie = `duet-home-collapsed=${[...next].join(',')}; path=/app; max-age=31536000; samesite=lax`;
	}
	function toggleFolder(id: string) {
		const next = new Set(collapsedFolders);
		if (!next.delete(id)) next.add(id);
		persistFolders(next);
	}
	// Collapse/expand every folder at once from the section header.
	const folderIds = $derived(groups.filter((g) => g.folder).map((g) => g.id));
	const anyFolderExpanded = $derived(folderIds.some((id) => !collapsedFolders.has(id)));
	const anyFolderCollapsed = $derived(folderIds.some((id) => collapsedFolders.has(id)));
	function setAllFolders(collapse: boolean) {
		persistFolders(collapse ? new Set([...collapsedFolders, ...folderIds]) : new Set());
	}
	const totals = $derived(
		projects.reduce(
			(t, p) => {
				const s = data.stats[p.id];
				return { open: t.open + s.open, done: t.done + s.done };
			},
			{ open: 0, done: 0 }
		)
	);

	const hour = new Date().getHours();
	const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
	const firstName = $derived((data.user.name || '').split(' ')[0]);

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<svelte:head><title>Home · Duet</title></svelte:head>

{#if data.projects.length === 0}
	<div class="empty">
		<div class="empty-card">
			<span class="emoji">🎉</span>
			<h1>Welcome to Duet</h1>
			<p>
				Projects keep your todos organised. Create your first one to start capturing tasks — give it
				a colour and make it yours.
			</p>
			<Button variant="primary" size="lg" icon="plus" onclick={() => (createOpen = true)}>
				Create your first project
			</Button>
			<ul class="hints">
				<li><Icon name="sparkles" size={15} /> Add tasks in a single keystroke</li>
				<li><Icon name="clipboard" size={15} /> Paste an existing checklist to import</li>
				<li><Icon name="users" size={15} /> Invite your team as you grow</li>
			</ul>
		</div>
	</div>
{:else}
	<div class="home">
		<header class="home-head">
			<h1>{greeting}{firstName ? `, ${firstName}` : ''}</h1>
			<p class="summary">
				{plural(totals.open, 'open task')} across {plural(projects.length, 'project')}
				· {totals.done} done
				{#if data.urgent.length}· <span class="urgent-text">{data.urgent.length} urgent</span>{/if}
			</p>
		</header>

		<section class="section">
			<h2><Icon name="alert-circle" size={16} /> Urgent</h2>
			{#if data.urgent.length}
				<ul class="urgent-list">
					{#each data.urgent as t (t.id)}
						{@const p = projectById.get(t.projectId)!}
						{@const due = deadlineInfo(t.deadline ? new Date(t.deadline) : null)}
						<li>
							<a class="urgent-row" href="/app/{p.slug}?task={t.id}" style="--accent: {p.color}">
								<span class="u-dot" title="Urgent"></span>
								<span class="u-main">
									<span class="u-title">{t.title}</span>
									{#if t.parentTitle}
										<span class="u-parent truncate">
											<Icon name="corner-down-right" size={12} />{t.parentTitle}
										</span>
									{/if}
								</span>
								{#if t.startedAt}
									<span class="chip started"><Icon name="clock" size={12} />In progress</span>
								{/if}
								{#if due}
									<span class="chip deadline {due.state}">
										<Icon name="calendar" size={12} />{due.label}
									</span>
								{/if}
								<span class="u-project">
									<span class="u-icon"><ProjectIcon icon={p.icon} iconUrl={p.iconUrl} /></span>
									<span class="truncate">{p.name}</span>
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="none">Nothing urgent right now. 🎉</p>
			{/if}
		</section>

		<section class="section">
			<h2>
				<Icon name="folder" size={16} /> Projects
				<span class="h2-tools">
					{#if folderIds.length > 1}
						{#if anyFolderExpanded}
							<button class="tool-btn" onclick={() => setAllFolders(true)}>Collapse all</button>
						{/if}
						{#if anyFolderCollapsed}
							<button class="tool-btn" onclick={() => setAllFolders(false)}>Expand all</button>
						{/if}
					{/if}
					<button class="tool-btn" onclick={createFolder}>
						<Icon name="folder-plus" size={13} /> New folder
					</button>
					<button class="tool-btn" onclick={() => (createOpen = true)}>
						<Icon name="plus" size={13} /> New project
					</button>
					{#if ownedProjects.length}
						<button
							class="tool-btn"
							onclick={() => {
								inviteProjects = ownedProjects;
								inviteOpen = true;
							}}
						>
							<Icon name="users" size={13} /> Invite
						</button>
					{/if}
					<button class="tool-btn" onclick={() => (selectMode ? clearSelection() : (selectMode = true))}>
						<Icon name={selecting ? 'x' : 'check-circle'} size={13} />
						{selecting ? 'Done selecting' : 'Select'}
					</button>
				</span>
			</h2>
			{#if projects.length}
				<div class="groups" {ondragover} {ondragleave} {ondrop}>
					{#each groups as g (g.id)}
					{@const folded = !!g.folder && collapsedFolders.has(g.id)}
					{@const groupIds = g.projects.map((p) => p.id)}
					{@const groupAllSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id))}
					<div class="group">
						{#if g.folder}
							<h3>
								<button
									type="button"
									class="group-head {dropClass(g.folder.id)}"
									aria-expanded={!folded}
									data-drop-id={g.folder.id}
									data-drop-kind="folder"
									onclick={() => toggleFolder(g.id)}
								>
									<Icon name={folded ? 'chevron-right' : 'chevron-down'} size={14} />
									<span class="truncate">{g.folder.name}</span>
									<span class="group-count">{g.projects.length}</span>
								</button>
								{#if selecting && !folded}
									<button class="group-select" onclick={() => toggleGroupSelection(groupIds)}>
										{groupAllSelected ? 'Deselect all' : 'Select all'}
									</button>
								{/if}
							</h3>
						{:else if selecting}
							<button class="group-select loose" onclick={() => toggleGroupSelection(groupIds)}>
								{groupAllSelected ? 'Deselect all' : 'Select all'}
							</button>
						{/if}
						{#if !folded}
							<div class="grid">
								{#each g.projects as p (p.id)}
									{@const s = data.stats[p.id]}
									{@const total = s.open + s.done}
									{@const picked = selectedIds.has(p.id)}
									<a
										class="card {dropClass(p.id)}"
										class:dragged={dragging?.id === p.id}
										class:picked
										class:selecting
										href="/app/{p.slug}"
										style="--accent: {p.color};{fontStyle(p.font)}"
										draggable={!selecting}
										data-drop-id={p.id}
										data-drop-kind="project"
										ondragstart={(e) => ondragstart(e, p.id)}
										{ondragend}
										onclick={(e) => {
											if (selecting) selectProject(p.id, e);
										}}
									>
										{#if selecting}
											<span class="c-check" class:on={picked}>
												{#if picked}<Icon name="check" size={12} strokeWidth={3} />{/if}
											</span>
										{/if}
										<div class="card-head">
											<span class="c-icon project-tile"><ProjectIcon icon={p.icon} iconUrl={p.iconUrl} /></span>
											<span class="c-name truncate">{p.name}</span>
											<ProjectStatusBadge status={p.status} />
										</div>
										{#if p.description}
											<p class="c-desc" title={p.description}>{p.description}</p>
										{/if}
										<div class="c-foot">
											<div class="stats">
												<span class="stat"><strong>{s.open}</strong> to do</span>
												<span class="stat"><strong>{s.done}</strong> done</span>
												{#if s.urgent}
													<span class="stat urgent"><strong>{s.urgent}</strong> urgent</span>
												{/if}
											</div>
											<div
												class="bar"
												role="progressbar"
												aria-label="{p.name} progress"
												aria-valuemin={0}
												aria-valuemax={total}
												aria-valuenow={s.done}
											>
												<span style="width: {total ? (s.done / total) * 100 : 0}%"></span>
											</div>
										</div>
									</a>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
				</div>
			{:else}
				<p class="none">All your projects are archived.</p>
			{/if}
		</section>
	</div>
{/if}

<ProjectDialog bind:open={createOpen} mode="create" />
{#if inviteProjects.length}
	<InviteDialog bind:open={inviteOpen} projects={inviteProjects} />
{/if}

{#if selecting && selectedIds.size}
	<ProjectBulkBar
		selected={selectedProjects}
		totalVisible={projects.length}
		folders={data.folders}
		onRename={renameSelected}
		onStatus={setStatusSelected}
		onMove={moveSelectedToFolder}
		onInvite={inviteSelected}
		onLoadMembers={loadSelectedMembers}
		onRemoveMember={removeMemberFromSelected}
		onCopy={copySelected}
		onDownload={downloadSelected}
		onDelete={deleteSelected}
		onSelectAll={selectAll}
		onClear={clearSelection}
	/>
{/if}

<style>
	.empty {
		flex: 1;
		display: grid;
		place-items: center;
		padding: var(--space-8) var(--space-5);
	}
	.empty-card {
		max-width: 440px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
	}
	.emoji {
		font-size: 52px;
	}
	.empty h1 {
		font-size: var(--text-2xl);
	}
	.empty p {
		color: var(--text-muted);
		line-height: var(--leading-normal);
	}
	.hints {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-4);
		color: var(--text-subtle);
		font-size: var(--text-sm);
	}
	.hints li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		justify-content: center;
	}
	.hints :global(svg) {
		color: var(--accent);
	}

	/* Home */
	.home {
		width: 100%;
		max-width: 1080px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-6) var(--space-12);
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
	}
	.home-head h1 {
		font-size: var(--text-2xl);
		margin-bottom: var(--space-1);
	}
	.summary {
		color: var(--text-subtle);
		font-size: var(--text-sm);
	}
	.urgent-text {
		color: var(--danger);
		font-weight: var(--weight-medium);
	}
	.section h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-subtle);
		margin-bottom: var(--space-3);
	}
	.h2-tools {
		display: inline-flex;
		gap: var(--space-1);
		margin-left: auto;
		text-transform: none;
		letter-spacing: normal;
	}
	.tool-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		transition: all var(--transition-fast);
	}
	.tool-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.none {
		color: var(--text-subtle);
		font-size: var(--text-sm);
		padding: var(--space-4);
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius-lg);
	}

	/* Urgent tasks */
	.urgent-list {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}
	.urgent-list li + li {
		border-top: 1px solid var(--border-subtle);
	}
	.urgent-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		color: var(--text);
		font-size: var(--text-sm);
		transition: background var(--transition-fast);
	}
	.urgent-row:hover {
		background: var(--surface-hover);
	}
	.u-dot {
		width: 8px;
		height: 8px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background: var(--danger);
	}
	.u-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.u-title {
		overflow-wrap: anywhere;
	}
	.u-parent {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		background: var(--surface-inset);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		white-space: nowrap;
	}
	.chip.started {
		color: var(--accent-text);
		background: var(--accent-soft);
	}
	.deadline.overdue {
		color: var(--danger);
		background: var(--danger-soft);
	}
	.deadline.today {
		color: var(--warning);
		background: var(--warning-soft);
	}
	.deadline.soon {
		color: var(--text);
	}
	.u-project {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 180px;
		flex-shrink: 0;
		padding: 2px var(--space-2) 2px 4px;
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--accent-text);
		background: var(--accent-soft);
	}
	.u-icon {
		display: grid;
		place-items: center;
		font-size: 12px;
	}

	/* Project groups */
	.group + .group {
		margin-top: var(--space-5);
	}
	.group h3 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}
	.group-select {
		margin-left: auto;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--accent-text);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		white-space: nowrap;
	}
	.group-select:hover {
		background: var(--accent-soft);
	}
	.group-select.loose {
		display: block;
		width: 100%;
		margin: 0 0 var(--space-2);
		text-align: right;
	}
	.group-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		max-width: 100%;
		margin-left: calc(-1 * var(--space-2));
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-md);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--text-muted);
		transition: background var(--transition-fast);
	}
	.group-head:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.group-head :global(svg) {
		flex-shrink: 0;
		color: var(--text-subtle);
	}
	.group-count {
		padding: 0 var(--space-2);
		border-radius: var(--radius-full);
		background: var(--surface-inset);
		color: var(--text-subtle);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
	}
	.group-head.drop-inside {
		background: var(--surface-hover);
		box-shadow: inset 0 0 0 1.5px var(--accent);
		color: var(--text);
	}

	/* Project cards */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-4);
	}
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-xs);
		transition:
			transform var(--transition-base),
			box-shadow var(--transition-base),
			border-color var(--transition-base);
	}
	.card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
		border-color: var(--accent-border);
	}
	.card.picked {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}
	.card.selecting {
		cursor: pointer;
	}
	.c-check {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border: 1.5px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--accent-contrast);
	}
	.c-check.on {
		background: var(--accent);
		border-color: var(--accent);
	}
	.card[draggable='true'] {
		-webkit-user-drag: element;
	}
	.card.dragged {
		opacity: 0.4;
	}
	.card.drop-before {
		box-shadow: inset 2px 0 0 var(--accent);
	}
	.card.drop-after {
		box-shadow: inset -2px 0 0 var(--accent);
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.c-icon {
		width: 34px;
		height: 34px;
		font-size: 18px;
	}
	.c-name {
		flex: 1;
		min-width: 0;
		font-weight: var(--weight-semibold);
	}
	.c-desc {
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.c-foot {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.stats {
		display: flex;
		gap: var(--space-4);
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}
	.stat strong {
		font-size: var(--text-sm);
		color: var(--text);
		margin-right: 2px;
	}
	.stat.urgent,
	.stat.urgent strong {
		color: var(--danger);
	}
	.bar {
		height: 4px;
		border-radius: var(--radius-full);
		background: var(--surface-inset);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
		border-radius: inherit;
	}

	@media (max-width: 820px) {
		.home {
			padding: var(--space-5) var(--space-4) var(--space-10);
		}
		.u-project {
			max-width: 110px;
		}
	}
</style>
