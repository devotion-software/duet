<script lang="ts">
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { invalidateAll, replaceState } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { SvelteSet } from 'svelte/reactivity';
	import { TodosController } from '#lib/stores/todos.svelte';
	import { flattenTree } from '#lib/todoTree';
	import { filterCount, groupTodos, matchesFilter, parseView, viewComparator, type GroupKey, type ViewState } from '#lib/todoView';
	import { formatTodoForCopy, formatTodosAsChecklist, formatTodosAsJson } from '#lib/todoFormat';
	import { toasts } from '#lib/components/ui/toast.svelte';
	import type { Todo, Tag, Category } from '#lib/types';

	import Icon from '#lib/components/ui/Icon.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import QuickAdd from '#lib/components/todo/QuickAdd.svelte';
	import TodoRow from '#lib/components/todo/TodoRow.svelte';
	import TodoDetail from '#lib/components/todo/TodoDetail.svelte';
	import BulkBar from '#lib/components/todo/BulkBar.svelte';
	import SubtaskAdd from '#lib/components/todo/SubtaskAdd.svelte';
	import ViewBar from '#lib/components/todo/ViewBar.svelte';
	import ImportDialog from '#lib/components/todo/ImportDialog.svelte';
	import MembersDialog from '#lib/components/todo/MembersDialog.svelte';
	import ProjectDialog from '#lib/components/ProjectDialog.svelte';
	import { liveCounts } from '#lib/stores/liveCounts.svelte';

	let { data } = $props();

	const canEdit = $derived(data.project.role === 'owner' || data.project.role === 'editor');
	const canManage = $derived(data.project.role === 'owner');

	const controller = new TodosController(data.project.id, data.todos as unknown as Todo[]);
	controller.onRefetch = () => invalidateAll();

	// Reconcile with server data whenever the project changes or a refetch lands.
	$effect(() => {
		controller.reset(data.project.id, data.todos as unknown as Todo[]);
	});

	// Keep the sidebar's count in step with ticks and SSE updates.
	$effect(() => {
		const id = data.project.id;
		const open = data.project.countSubtasks ? controller.open : controller.openRoots;
		liveCounts[id] = open.length;
		return () => delete liveCounts[id];
	});

	// Live updates via SSE, re-subscribing per project.
	$effect(() => {
		if (!browser) return;
		const id = data.project.id;
		const es = new EventSource(`/api/projects/${id}/events`);
		es.onmessage = (e) => {
			try {
				controller.applyEvent(JSON.parse(e.data));
			} catch {
				/* ignore malformed */
			}
		};
		return () => es.close();
	});

	let search = $state('');
	let showCompleted = $state(true);
	// Deep-link support: /app/slug?task=<id> opens that task's detail.
	let selectedId = $state<string | null>(page.url.searchParams.get('task'));

	function selectTodo(id: string | null) {
		selectedId = id;
		if (!browser) return;
		const url = new URL(page.url.href);
		if (id) url.searchParams.set('task', id);
		else url.searchParams.delete('task');
		replaceState(url, {});
	}
	let importOpen = $state(false);
	let importText = $state('');
	let membersOpen = $state(false);
	let settingsOpen = $state(false);
	let projectMenuOpen = $state(false);
	let exportMenuOpen = $state(false);

	const selected = $derived(selectedId ? controller.items.find((t) => t.id === selectedId) : null);

	// ── Task tree ──
	// Past this depth subtasks stop indenting further, so deep trees stay readable.
	const MAX_INDENT = 6;
	const query = $derived(search.toLowerCase().trim());

	// Sort / group / filter, remembered per project in this browser.
	let view = $state<ViewState>(parseView(null));
	const viewKey = $derived(`duet:view:${data.project.id}`);
	let viewLoadedFor: string | null = null;
	$effect(() => {
		if (!browser) return;
		view = parseView(localStorage.getItem(viewKey));
		viewLoadedFor = viewKey;
	});
	$effect(() => {
		const json = JSON.stringify(view);
		if (browser && viewLoadedFor === viewKey) localStorage.setItem(viewKey, json);
	});
	const filtering = $derived(filterCount(view.filter) > 0);
	const narrowed = $derived(!!query || filtering);
	const compare = $derived(viewComparator(view.sort, view.reverse));

	// While searching or filtering: matching tasks plus their ancestors, so matches keep context.
	const matches = $derived.by(() => {
		if (!narrowed) return null;
		const ids = new Set<string>();
		for (const t of controller.items) {
			if (query && !t.title.toLowerCase().includes(query)) continue;
			if (filtering && !matchesFilter(t, view.filter)) continue;
			ids.add(t.id);
			for (const a of controller.ancestorsOf(t.id)) ids.add(a.id);
		}
		return ids;
	});
	const shown = (list: Todo[]) => (matches ? list.filter((t) => matches.has(t.id)) : list);
	const sorted = (list: Todo[]) => (view.sort === 'manual' && !view.reverse ? list : [...list].sort(compare));
	const childrenShown = (id: string) => sorted(shown(controller.childrenOf(id)));
	const openTodos = $derived(sorted(shown(controller.openRoots)));
	// Completed tasks keep most-recently-done first unless a sort is chosen.
	const doneTodos = $derived(view.sort === 'manual' ? shown(controller.doneRoots) : sorted(shown(controller.doneRoots)));
	// Grouping applies to top-level open tasks; subtasks stay with their parent.
	const openGroups = $derived(
		groupTodos(openTodos, view.group, { categories: data.categories, tags: data.tags, members: data.members })
	);
	const treeMode = $derived(controller.items.some((t) => t.parentId));

	// Collapsed parents, remembered per project in this browser.
	const collapsed = new SvelteSet<string>();
	const collapseKey = $derived(`duet:collapsed:${data.project.id}`);
	$effect(() => {
		if (!browser) return;
		collapsed.clear();
		try {
			for (const id of JSON.parse(localStorage.getItem(collapseKey) ?? '[]')) collapsed.add(id);
		} catch {
			/* ignore corrupt storage */
		}
	});
	function toggleCollapse(id: string) {
		if (collapsed.has(id)) collapsed.delete(id);
		else collapsed.add(id);
		localStorage.setItem(collapseKey, JSON.stringify([...collapsed]));
	}
	// Searching or filtering expands everything so matches are never hidden.
	const isCollapsed = (id: string) => !narrowed && collapsed.has(id) && addingTo !== id;

	// Collapsed groups, keyed by grouping + group key, remembered per project in this browser.
	const collapsedGroups = new SvelteSet<string>();
	const groupCollapseKey = $derived(`duet:collapsedGroups:${data.project.id}`);
	$effect(() => {
		if (!browser) return;
		collapsedGroups.clear();
		try {
			for (const id of JSON.parse(localStorage.getItem(groupCollapseKey) ?? '[]')) collapsedGroups.add(id);
		} catch {
			/* ignore corrupt storage */
		}
	});
	const groupId = (key: string) => `${view.group}:${key}`;
	function toggleGroup(key: string) {
		const id = groupId(key);
		if (collapsedGroups.has(id)) collapsedGroups.delete(id);
		else collapsedGroups.add(id);
		localStorage.setItem(groupCollapseKey, JSON.stringify([...collapsedGroups]));
	}
	const isGroupCollapsed = (key: string) =>
		view.group !== 'none' && !narrowed && collapsedGroups.has(groupId(key));

	/** Task whose inline "add subtask" input is open. */
	let addingTo = $state<string | null>(null);
	function startSubtask(todo: Todo) {
		addingTo = todo.id;
	}
	function outdent(todo: Todo) {
		const parent = controller.items.find((t) => t.id === todo.parentId);
		controller.update(todo.id, { parentId: parent?.parentId ?? null });
	}
	function subtaskCounts(id: string) {
		const kids = controller.childrenOf(id);
		return { done: kids.filter((t) => t.completed).length, total: kids.length };
	}
	// Where the open task could move: anywhere except inside its own subtree.
	const parentOptions = $derived.by(() => {
		if (!selected) return [];
		const own = controller.withDescendants([selected.id]);
		return flattenTree(controller.children.get(null) ?? [], controller.children).filter(
			(r) => !own.has(r.todo.id)
		);
	});
	/** Rows in on-screen order, skipping collapsed subtrees. */
	function visibleRows(roots: Todo[]): Todo[] {
		return roots.flatMap((t) => [t, ...(isCollapsed(t.id) ? [] : visibleRows(childrenShown(t.id)))]);
	}

	// ── Multi-select for bulk edits ──
	let selectMode = $state(false);
	const selectedIds = new SvelteSet<string>();
	let anchorId: string | null = null;
	const selecting = $derived(canEdit && (selectMode || selectedIds.size > 0));
	// A task can sit in several groups (one per tag); select it once.
	const visibleTodos = $derived([
		...new Set(
			visibleRows([
				...openGroups.flatMap((g) => (isGroupCollapsed(g.key) ? [] : g.todos)),
				...(showCompleted ? doneTodos : [])
			])
		)
	]);
	const selectedTodos = $derived(controller.items.filter((t) => selectedIds.has(t.id)));

	// Drop selections for tasks that disappear (deleted, or a project switch).
	$effect(() => {
		const ids = new Set(controller.items.map((t) => t.id));
		for (const id of selectedIds) if (!ids.has(id)) selectedIds.delete(id);
	});

	function selectTask(id: string, e: MouseEvent) {
		const order = visibleTodos.map((t) => t.id);
		const from = anchorId ? order.indexOf(anchorId) : -1;
		const to = order.indexOf(id);
		if (e.shiftKey && from >= 0 && to >= 0) {
			// Shift-click selects the whole range from the last clicked task.
			const [a, b] = from < to ? [from, to] : [to, from];
			for (const rid of order.slice(a, b + 1)) selectedIds.add(rid);
		} else if (selectedIds.has(id)) selectedIds.delete(id);
		else selectedIds.add(id);
		anchorId = id;
	}
	function clearSelection() {
		selectedIds.clear();
		selectMode = false;
		anchorId = null;
	}

	async function addTodo(title: string) {
		await controller.add({ title });
	}
	function openImport(text = '') {
		importText = text;
		importOpen = true;
	}
	function copyTodo(todo: Todo, quick = false) {
		const bare =
			!todo.description?.trim() && !todo.attachments.length && !controller.childrenOf(todo.id).length;
		const text = quick && bare ? todo.title : formatTodoForCopy(todo, data.project.name, controller.items);
		navigator.clipboard
			.writeText(text)
			.then(() => toasts.success('Task copied to clipboard'))
			.catch(() => toasts.error('Could not copy'));
	}

	function exportToClipboard() {
		exportMenuOpen = false;
		const all = controller.items;
		navigator.clipboard
			.writeText(formatTodosAsChecklist(all))
			.then(() => toasts.success(`Copied ${all.length} task${all.length === 1 ? '' : 's'} to clipboard`))
			.catch(() => toasts.error('Could not copy'));
	}
	function exportToFile() {
		exportMenuOpen = false;
		const json = formatTodosAsJson(controller.items, data.project);
		const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `${data.project.slug}-tasks-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function createTag(name: string): Promise<Tag | null> {
		try {
			const res = await fetch(`/api/projects/${data.project.id}/tags`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name, color: randomColor() })
			});
			if (!res.ok) throw new Error((await res.json()).message);
			const { tag } = await res.json();
			await invalidateAll();
			return tag;
		} catch (e) {
			toasts.error((e as Error).message);
			return null;
		}
	}
	async function createCategory(name: string): Promise<Category | null> {
		try {
			const res = await fetch(`/api/projects/${data.project.id}/categories`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name, color: randomColor() })
			});
			if (!res.ok) throw new Error((await res.json()).message);
			const { category } = await res.json();
			await invalidateAll();
			return category;
		} catch (e) {
			toasts.error((e as Error).message);
			return null;
		}
	}
	function randomColor() {
		const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444'];
		return colors[Math.floor(Math.random() * colors.length)];
	}
</script>

<svelte:head><title>{data.project.name} · Duet</title></svelte:head>

<!-- `group` is set on grouped top-level rows only; subtasks aren't grouped, so show all their fields. -->
{#snippet node(todo: Todo, depth: number, group?: { field: GroupKey; key: string })}
	{@const kids = childrenShown(todo.id)}
	<TodoRow
		{todo}
		{canEdit}
		onToggle={(id) => controller.toggle(id)}
		onOpen={(t) => selectTodo(t.id)}
		onCopy={copyTodo}
		onDelete={(id) => controller.remove(id)}
		{selecting}
		selected={selectedIds.has(todo.id)}
		onSelect={canEdit ? selectTask : undefined}
		tree={treeMode}
		subtasks={subtaskCounts(todo.id)}
		collapsed={isCollapsed(todo.id)}
		onToggleCollapse={toggleCollapse}
		onAddSubtask={canEdit ? startSubtask : undefined}
		onOutdent={canEdit ? outdent : undefined}
		{group}
		hiddenFields={data.project.hiddenFields}
	/>
	{#if (kids.length || addingTo === todo.id) && !isCollapsed(todo.id)}
		<div class="subtasks" class:capped={depth >= MAX_INDENT} transition:slide={{ duration: 150 }}>
			{#each kids as child (child.id)}
				<div animate:flip={{ duration: 200 }}>{@render node(child, depth + 1)}</div>
			{/each}
			{#if addingTo === todo.id}
				<SubtaskAdd
					autofocus
					onAdd={(title) => controller.add({ title, parentId: todo.id })}
					onClose={() => (addingTo = null)}
				/>
			{/if}
		</div>
	{/if}
{/snippet}

<div class="project" style="--accent: {data.project.color}">
	<header class="proj-head">
		<div class="title-area">
			<span class="proj-icon">{data.project.icon}</span>
			<div class="titles">
				<h1>{data.project.name}</h1>
				<p class="counts">
					{controller.open.length} open · {controller.done.length} done
					{#if data.members.length > 1}· {data.members.length} members{/if}
				</p>
			</div>
		</div>

		<div class="head-actions">
			{#if canEdit && controller.items.length}
				<Button
					variant={selecting ? 'subtle' : 'ghost'}
					size="sm"
					icon="check-circle"
					title="Select tasks to edit together (or Cmd/Ctrl-click a task)"
					onclick={() => (selecting ? clearSelection() : (selectMode = true))}
				>
					{selecting ? 'Done' : 'Select'}
				</Button>
			{/if}
			<div class="searchbox">
				<Icon name="search" size={15} />
				<input bind:value={search} placeholder="Search tasks" aria-label="Search tasks" />
			</div>
			{#if canEdit}
				<Button variant="ghost" size="sm" icon="clipboard" onclick={() => openImport()}>Import</Button>
			{/if}
			{#if controller.items.length}
				<div class="menu-host">
					<Button variant="ghost" size="sm" icon="download" onclick={() => (exportMenuOpen = !exportMenuOpen)}>
						Export
					</Button>
					{#if exportMenuOpen}
						<button class="menu-scrim" aria-label="Close" onclick={() => (exportMenuOpen = false)}></button>
						<div class="menu">
							<button class="menu-item" onclick={exportToClipboard}>
								<Icon name="copy" size={15} /> Copy as checklist
							</button>
							<button class="menu-item" onclick={exportToFile}>
								<Icon name="download" size={15} /> Download JSON file
							</button>
						</div>
					{/if}
				</div>
			{/if}
			<Button variant="ghost" size="sm" icon="users" onclick={() => (membersOpen = true)}>
				{data.members.length}
			</Button>
			{#if canManage}
				<div class="menu-host">
					<button class="icon-btn" aria-label="Project menu" onclick={() => (projectMenuOpen = !projectMenuOpen)}>
						<Icon name="more-horizontal" size={18} />
					</button>
					{#if projectMenuOpen}
						<button class="menu-scrim" aria-label="Close" onclick={() => (projectMenuOpen = false)}></button>
						<div class="menu">
							<button class="menu-item" onclick={() => { projectMenuOpen = false; settingsOpen = true; }}>
								<Icon name="settings" size={15} /> Project settings
							</button>
							<button class="menu-item" onclick={() => { projectMenuOpen = false; membersOpen = true; }}>
								<Icon name="users" size={15} /> Members
							</button>
							<hr />
							<form method="POST" action="/app?/deleteProject">
								<input type="hidden" name="id" value={data.project.id} />
								<button
									class="menu-item danger"
									type="submit"
									onclick={(e) => { if (!confirm('Delete this project and all its tasks? This cannot be undone.')) e.preventDefault(); }}
								>
									<Icon name="trash" size={15} /> Delete project
								</button>
							</form>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</header>

	<div class="work" style="--list-width: {data.project.listWidth ? `${data.project.listWidth}px` : 'none'}">
		{#if canEdit}
			<div class="quick">
				<QuickAdd onAdd={addTodo} onPasteMultiline={openImport} />
			</div>
		{/if}

		{#if controller.items.length}
			<ViewBar bind:view categories={data.categories} tags={data.tags} members={data.members} />
		{/if}

		{#if openTodos.length === 0 && doneTodos.length === 0}
			<div class="empty-state">
				<span class="es-emoji">{data.project.icon}</span>
				<h2>{narrowed ? 'No matching tasks' : 'No tasks yet'}</h2>
				<p>
					{#if narrowed}
						Try a different {search ? 'search' : 'filter'}.
					{:else if canEdit}
						Add your first task above, or import an existing checklist.
					{:else}
						This project doesn't have any tasks yet.
					{/if}
				</p>
				{#if !narrowed && canEdit}
					<Button variant="subtle" icon="clipboard" onclick={() => openImport()}>Import a checklist</Button>
				{/if}
			</div>
		{:else}
			{#each openGroups as group (group.key)}
				{@const groupCollapsed = isGroupCollapsed(group.key)}
				{#if view.group !== 'none'}
					<h3 class="group-head">
						<button
							class="group-toggle"
							aria-expanded={!groupCollapsed}
							disabled={narrowed}
							onclick={() => toggleGroup(group.key)}
						>
							<Icon name={groupCollapsed ? 'chevron-right' : 'chevron-down'} size={15} />
							{#if group.color}<span class="group-dot" style="--c: {group.color}"></span>{/if}
							<span class:muted={!group.key}>{group.label}</span>
							<span class="group-count">{group.todos.length}</span>
						</button>
					</h3>
				{/if}
				{#if !groupCollapsed}
					<section class="list" transition:slide={{ duration: 180 }}>
						{#each group.todos as todo (todo.id)}
							<div animate:flip={{ duration: 200 }}>
								{@render node(todo, 0, view.group === 'none' ? undefined : { field: view.group, key: group.key })}
							</div>
						{/each}
					</section>
				{/if}
			{/each}

			{#if doneTodos.length}
				<div class="done-section">
					<button class="done-toggle" onclick={() => (showCompleted = !showCompleted)}>
						<Icon name={showCompleted ? 'chevron-down' : 'chevron-right'} size={15} />
						Completed <span class="done-count">{doneTodos.length}</span>
					</button>
					{#if showCompleted}
						<section class="list done" transition:slide={{ duration: 180 }}>
							{#each doneTodos as todo (todo.id)}
								<div animate:flip={{ duration: 200 }}>{@render node(todo, 0)}</div>
							{/each}
						</section>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>

{#if selected}
	<TodoDetail
		todo={selected}
		{canEdit}
		members={data.members}
		categories={data.categories}
		tags={data.tags}
		onUpdate={(patch) => controller.update(selected!.id, patch)}
		onToggle={(id) => controller.toggle(id)}
		onDelete={(id) => { controller.remove(id); selectTodo(null); }}
		onCopy={copyTodo}
		onClose={() => selectTodo(null)}
		onCreateTag={createTag}
		onCreateCategory={createCategory}
		onAddAttachment={(file) => controller.addAttachment(selected!.id, file)}
		onRemoveAttachment={(id) => controller.removeAttachment(selected!.id, id)}
		ancestors={controller.ancestorsOf(selected.id)}
		subtasks={controller.childrenOf(selected.id)}
		{parentOptions}
		onOpenTask={selectTodo}
		onAddSubtask={(title) => controller.add({ title, parentId: selected!.id })}
	/>
{/if}

{#if selecting && selectedIds.size}
	<BulkBar
		selected={selectedTodos}
		totalVisible={visibleTodos.length}
		members={data.members}
		categories={data.categories}
		tags={data.tags}
		onApply={(patch) => controller.bulkUpdate([...selectedIds], patch)}
		onDelete={() => controller.bulkRemove([...selectedIds])}
		onSelectAll={() => visibleTodos.forEach((t) => selectedIds.add(t.id))}
		onClear={clearSelection}
		onCreateTag={createTag}
	/>
{/if}

<ImportDialog bind:open={importOpen} initialText={importText} onImport={(t, g) => controller.importText(t, g)} />
<MembersDialog
	bind:open={membersOpen}
	projectId={data.project.id}
	members={data.members}
	invites={data.invites}
	currentUserId={data.user.id}
	{canManage}
	onChanged={() => invalidateAll()}
/>
<ProjectDialog bind:open={settingsOpen} mode="edit" project={data.project} />

<style>
	.project {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.proj-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-5) var(--space-6);
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
	}
	.title-area {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}
	.proj-icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		font-size: 24px;
		background: var(--accent-soft);
		border: 1px solid var(--accent-border);
		border-radius: var(--radius-md);
		flex-shrink: 0;
	}
	.titles h1 {
		font-size: var(--text-xl);
		line-height: 1.1;
	}
	.counts {
		color: var(--text-subtle);
		font-size: var(--text-sm);
		margin-top: 2px;
	}
	.head-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.searchbox {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--space-3);
		height: 34px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-subtle);
	}
	.searchbox:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.searchbox input {
		background: none;
		border: none;
		color: var(--text);
		width: 150px;
		font-size: var(--text-sm);
	}
	.searchbox input:focus {
		outline: none;
	}
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-md);
		color: var(--text-muted);
	}
	.icon-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.menu-host {
		position: relative;
	}
	.menu-scrim {
		position: fixed;
		inset: 0;
		z-index: var(--z-dropdown);
		cursor: default;
	}
	.menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: calc(var(--z-dropdown) + 1);
		min-width: 190px;
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

	.work {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-5) var(--space-6) var(--space-16);
		max-width: var(--list-width, 820px);
		width: 100%;
		margin: 0 auto;
	}
	.quick {
		margin-bottom: var(--space-5);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.group-head {
		margin: var(--space-5) 0 var(--space-2);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--text);
	}
	.group-head:first-of-type {
		margin-top: 0;
	}
	.group-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		font: inherit;
		color: inherit;
		border-radius: var(--radius-sm);
	}
	.group-toggle :global(svg) {
		color: var(--text-faint);
	}
	.group-toggle:hover:not(:disabled) :global(svg) {
		color: var(--text);
	}
	.group-toggle:disabled {
		cursor: default;
	}
	.group-head .muted {
		color: var(--text-subtle);
	}
	.group-dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		background: var(--c);
	}
	.group-count {
		color: var(--text-faint);
		font-weight: var(--weight-normal);
	}
	.done-section {
		margin-top: var(--space-6);
	}
	.done-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		border-radius: var(--radius-sm);
	}
	.done-toggle:hover {
		color: var(--text);
	}
	.done-count {
		color: var(--text-faint);
	}
	.list.done {
		opacity: 0.85;
	}
	.subtasks {
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin-left: var(--space-6);
		padding-left: var(--space-1);
		border-left: 1px solid var(--border-subtle);
	}
	/* Very deep levels stack flush with their parent instead of indenting forever. */
	.subtasks.capped {
		margin-left: 0;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		text-align: center;
		padding: var(--space-16) var(--space-4);
		color: var(--text-muted);
	}
	.es-emoji {
		font-size: 44px;
		opacity: 0.8;
	}
	.empty-state h2 {
		font-size: var(--text-lg);
		color: var(--text);
	}
	.empty-state p {
		max-width: 36ch;
	}

	@media (max-width: 640px) {
		.proj-head {
			padding: var(--space-4);
		}
		.work {
			padding: var(--space-4) var(--space-4) var(--space-16);
		}
		.searchbox input {
			width: 100px;
		}
	}
</style>
