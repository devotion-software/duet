<script lang="ts">
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { invalidateAll, replaceState } from '$app/navigation';
	import { tick } from 'svelte';
	import { fly, slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { SvelteSet } from 'svelte/reactivity';
	import { TodosController } from '#lib/stores/todos.svelte';
	import { flattenTree } from '#lib/todoTree';
	import { filterCount, groupTodos, matchesFilter, parseView, viewComparator, type GroupKey, type ViewState } from '#lib/todoView';
	import { formatTodoForCopy, formatTodosAsChecklist, formatTodosAsJson } from '#lib/todoFormat';
	import { toasts } from '#lib/components/ui/toast.svelte';
	import { onControl, shortcutAllowed } from '#lib/shortcuts';
	import { isInProgress, type Todo, type Tag, type Category } from '#lib/types';

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
	import SecretsDialog from '#lib/components/SecretsDialog.svelte';
	import TagsCategoriesDialog from '#lib/components/TagsCategoriesDialog.svelte';
	import ProjectIcon from '#lib/components/ProjectIcon.svelte';
	import ProjectStatusBadge from '#lib/components/ProjectStatusBadge.svelte';
	import DeleteTaskDialog from '#lib/components/todo/DeleteTaskDialog.svelte';
	import { liveCounts } from '#lib/stores/liveCounts.svelte';
	import { confirmDelete } from '#lib/confirmDelete.svelte';
	import { sanitizeColor, sanitizeGradient } from '#lib/color';
	import { fontStyle } from '#lib/font';

	let { data } = $props();

	const canEdit = $derived(data.project.role === 'owner' || data.project.role === 'editor');
	const canManage = $derived(data.project.role === 'owner');

	// Inline accent for the project subtree; a gradient adds --accent-gradient alongside
	// the solid --accent that all the derived tokens keep using.
	const accentStyle = $derived.by(() => {
		const color = sanitizeColor(data.project.color) ?? '#6366f1';
		const gradient = sanitizeGradient(data.project.accentGradient);
		return (
			`--accent: ${color};` +
			(gradient ? ` --accent-gradient: ${gradient};` : '') +
			fontStyle(data.project.font)
		);
	});

	const controller = new TodosController(data.project.id, data.todos as unknown as Todo[]);
	controller.onRefetch = () => invalidateAll();

	// Reconcile with server data whenever the project changes or a refetch lands.
	$effect(() => {
		controller.reset(data.project.id, data.todos as unknown as Todo[]);
	});

	// Keep the sidebar's count in step with ticks and SSE updates. Left set after
	// unmount so navigating away doesn't fall back to the stale server-loaded count.
	$effect(() => {
		const id = data.project.id;
		const open = data.project.countSubtasks ? controller.open : controller.openRoots;
		liveCounts[id] = open.length;
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
	let showCompleted = $state(false);
	let showNotDoing = $state(false);
	// Deep-link support: /app/slug?task=<id> opens that task's detail.
	let selectedId = $state<string | null>(page.url.searchParams.get('task'));
	let focusTitleOnOpen = $state(false);

	function selectTodo(id: string | null, opts?: { focusTitle?: boolean }) {
		selectedId = id;
		focusTitleOnOpen = !!opts?.focusTitle;
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
	let secretsOpen = $state(false);
	let tagsCategoriesOpen = $state(false);
	let projectMenuOpen = $state(false);
	let projectMenuAnchor: 'header' | 'floating' = $state('header');
	let projectMenuHost: HTMLElement | undefined = $state();
	let floatingMenuHost: HTMLElement | undefined = $state();
	let scrollY = $state(0);
	const scrolledPastHeader = $derived(scrollY > 140);

	function toggleProjectMenu(anchor: 'header' | 'floating') {
		if (projectMenuOpen && projectMenuAnchor === anchor) projectMenuOpen = false;
		else {
			projectMenuAnchor = anchor;
			projectMenuOpen = true;
		}
	}

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
	const completedTodos = $derived(doneTodos.filter((t) => !t.notDoing));
	const notDoingTodos = $derived(doneTodos.filter((t) => t.notDoing));
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
	// Collapse/expand every group at once, preserving other groupings' remembered state.
	const groupIds = $derived(openGroups.map((g) => groupId(g.key)));
	const anyGroupExpanded = $derived(groupIds.some((id) => !collapsedGroups.has(id)));
	const anyGroupCollapsed = $derived(groupIds.some((id) => collapsedGroups.has(id)));
	function setAllGroups(collapse: boolean) {
		for (const id of groupIds) {
			if (collapse) collapsedGroups.add(id);
			else collapsedGroups.delete(id);
		}
		localStorage.setItem(groupCollapseKey, JSON.stringify([...collapsedGroups]));
	}

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

	// ── Reordering (manual sort only) ──
	// Open tasks move among their open siblings; under a grouping, only within their group.
	const canReorder = $derived(canEdit && view.sort === 'manual' && !view.reverse);
	// Grouped by category or tag: dragging a task into another group's section
	// re-tags/re-categorizes it, independent of the current sort.
	const canRegroup = $derived(canEdit && (view.group === 'category' || view.group === 'tag'));
	const canDrag = $derived(canReorder || canRegroup);
	let dragging = $state<{ id: string; group?: string } | null>(null);
	let dropTarget = $state<{ id: string; pos: 'before' | 'after' } | null>(null);

	function onRowDragStart(todo: Todo, e: DragEvent) {
		dragging = { id: todo.id, group: (e.currentTarget as HTMLElement).dataset.group ?? '' };
		e.dataTransfer!.effectAllowed = 'move';
		// Firefox won't start a drag without some data.
		e.dataTransfer!.setData('text/plain', todo.title);
	}
	function onRowDragEnd() {
		dragging = null;
		dropTarget = null;
	}

	/** Where the pointer would drop the dragged task, or null if it can't go there. */
	function dropAt(e: DragEvent) {
		const el = (e.target as Element).closest<HTMLElement>('[data-todo-id]');
		const drag = dragging && controller.items.find((t) => t.id === dragging!.id);
		const target = el && controller.items.find((t) => t.id === el.dataset.todoId);
		if (!el || !drag || !target || target.id === drag.id || target.completed) return null;
		if (target.parentId !== drag.parentId) return null;
		// Top-level tasks dropped in another group's section re-tag/re-categorize them;
		// everything else (including subtasks, which aren't grouped) just reorders.
		const groupKey = el.dataset.group ?? '';
		const crossGroup = !drag.parentId && groupKey !== (dragging!.group ?? '');
		if (crossGroup ? !canRegroup : !canReorder) return null;
		const rect = el.getBoundingClientRect();
		return {
			id: target.id,
			pos: e.clientY < rect.top + rect.height / 2 ? ('before' as const) : ('after' as const),
			groupKey: crossGroup ? groupKey : undefined
		};
	}
	function onListDragOver(e: DragEvent) {
		if (!dragging) return;
		dropTarget = dropAt(e);
		if (!dropTarget) return;
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'move';
	}
	function onListDragLeave(e: DragEvent) {
		if (!(e.currentTarget as Element).contains(e.relatedTarget as Node | null)) dropTarget = null;
	}
	function onListDrop(e: DragEvent) {
		if (!dragging) return;
		e.preventDefault();
		const drop = dropAt(e);
		const id = dragging.id;
		const fromKey = dragging.group;
		onRowDragEnd();
		if (!drop) return;
		if (drop.groupKey !== undefined) regroup(id, fromKey ?? '', drop.groupKey);
		controller.move(id, drop.id, drop.pos);
	}

	/** Re-tag or re-categorize a task after it's dropped into a different group's section. */
	function regroup(id: string, fromKey: string, toKey: string) {
		if (view.group === 'category') {
			controller.update(id, { categoryId: toKey || null });
			return;
		}
		const todo = controller.items.find((t) => t.id === id);
		if (!todo) return;
		// Moving out of a tag's section drops that tag; moving into one adds it.
		const ids = todo.tags.map((t) => t.id).filter((t) => t !== fromKey);
		if (toKey && !ids.includes(toKey)) ids.push(toKey);
		controller.update(id, { tagIds: ids });
	}

	/** Swap a task with its open neighbour in the list it's shown in. */
	function nudge(todo: Todo, step: number) {
		const list = todo.parentId
			? childrenShown(todo.parentId)
			: (openGroups.find((g) => g.todos.includes(todo))?.todos ?? []);
		const open = list.filter((t) => !t.completed);
		const next = open[open.indexOf(todo) + step];
		if (next) controller.move(todo.id, next.id, step > 0 ? 'after' : 'before');
		focusRow(todo.id);
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
				...(showCompleted ? completedTodos : []),
				...(showNotDoing ? notDoingTodos : [])
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
	function selectAll() {
		for (const t of visibleTodos) selectedIds.add(t.id);
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
		anchorId = null;
	}

	// ── Keyboard navigation ──
	/** Task under the keyboard cursor; clicks move it too, so arrows carry on from there. */
	let focusedId = $state<string | null>(null);
	/** The cursor only shows while the keyboard is in use. */
	let keyboardNav = $state(false);
	let quickAdd = $state<ReturnType<typeof QuickAdd>>();
	let searchInput = $state<HTMLInputElement>();

	async function focusRow(id: string | undefined) {
		if (!id) return;
		focusedId = id;
		keyboardNav = true;
		// Leave any clicked button so Space/Enter act on the cursor, not the button.
		if (onControl()) (document.activeElement as HTMLElement).blur();
		await tick();
		document.querySelector(`[data-todo-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
	}
	/** After the task at `at` leaves its spot, put the cursor on whatever took its place. */
	// Deleting a task asks first, unless the user ticked "Don't ask again".
	let pendingDelete = $state<{ todo: Todo; after?: () => void } | null>(null);
	const pendingSubtasks = $derived(
		pendingDelete ? controller.withDescendants([pendingDelete.todo.id]).size - 1 : 0
	);

	function requestDelete(todo: Todo, after?: () => void) {
		if (confirmDelete.value) pendingDelete = { todo, after };
		else deleteTodo(todo.id, after);
	}

	function deleteTodo(id: string, after?: () => void) {
		controller.remove(id);
		after?.();
	}

	async function refocusAt(at: number) {
		await tick();
		focusRow((visibleTodos[at] ?? visibleTodos.at(-1))?.id);
	}

	function onkeydown(e: KeyboardEvent) {
		const step = e.key === 'ArrowDown' || e.key === 'j' ? 1 : e.key === 'ArrowUp' || e.key === 'k' ? -1 : 0;
		// Alt-arrows move the task under the cursor.
		if (e.altKey && step && !selected && shortcutAllowed(e, true)) {
			const current = controller.items.find((t) => t.id === focusedId);
			if (!canReorder || !current || current.completed) return;
			e.preventDefault();
			nudge(current, step);
			return;
		}
		if (!shortcutAllowed(e)) return;
		const order = visibleTodos;

		// With the details panel open, up/down step through tasks in the panel.
		if (selected) {
			if (!step) return;
			e.preventDefault();
			const next = order[order.findIndex((t) => t.id === selected.id) + step];
			if (next) {
				selectTodo(next.id);
				focusRow(next.id);
			}
			return;
		}

		const at = focusedId ? order.findIndex((t) => t.id === focusedId) : -1;
		const current = at >= 0 ? order[at] : null;
		const handled = () => e.preventDefault();

		if (step) {
			handled();
			const next = at < 0 ? (step > 0 ? order[0] : order.at(-1)) : (order[at + step] ?? current);
			// Shift-arrows grow the bulk selection as the cursor moves.
			if (e.shiftKey && canEdit && next) {
				if (current) selectedIds.add(current.id);
				selectedIds.add(next.id);
				anchorId = next.id;
			}
			focusRow(next?.id);
			return;
		}

		switch (e.key) {
			case 'Escape':
				focusedId = null;
				return;
			case 'Home':
				handled();
				focusRow(order[0]?.id);
				return;
			case 'End':
				handled();
				focusRow(order.at(-1)?.id);
				return;
			case 'n':
				if (!canEdit) return;
				handled();
				quickAdd?.focus();
				return;
			case '/':
				handled();
				searchInput?.focus();
				return;
			case 'h':
				if (!doneTodos.length) return;
				handled();
				// Toggle both closed sections together.
				showCompleted = showNotDoing = !(
					(completedTodos.length && showCompleted) ||
					(notDoingTodos.length && showNotDoing)
				);
				return;
		}

		if (!current) return;
		switch (e.key) {
			case ' ': {
				if (!canEdit || onControl()) return;
				handled();
				const ticking = !current.completed;
				controller.toggle(current.id);
				// Ticking a top-level task moves it to "Completed"; keep the cursor in place.
				if (ticking) refocusAt(at);
				return;
			}
			case 'Enter':
			case 'o':
				if (onControl()) return;
				handled();
				selectTodo(current.id, { focusTitle: true });
				return;
			case 'ArrowLeft': {
				handled();
				const kids = childrenShown(current.id);
				if (kids.length && !isCollapsed(current.id) && !narrowed) toggleCollapse(current.id);
				else if (current.parentId) focusRow(current.parentId);
				return;
			}
			case 'ArrowRight': {
				handled();
				const kids = childrenShown(current.id);
				if (kids.length && isCollapsed(current.id)) toggleCollapse(current.id);
				else focusRow(kids[0]?.id);
				return;
			}
			case 'p':
				if (!canEdit || current.completed) return;
				handled();
				controller.setInProgress(current.id, !isInProgress(current));
				return;
			case 'w':
				if (!canEdit || current.completed) return;
				handled();
				controller.toggle(current.id, true);
				// Like ticking, this moves a top-level task to "Completed".
				refocusAt(at);
				return;
			case 'a':
				if (!canEdit) return;
				// Stop the keystroke from landing in the input that opens.
				handled();
				startSubtask(current);
				return;
			case 'c':
				handled();
				if (selecting && selectedIds.size) copySelectedForAI();
				else copyTodo(current);
				return;
			case 'x':
				if (!canEdit) return;
				handled();
				if (selectedIds.has(current.id)) selectedIds.delete(current.id);
				else selectedIds.add(current.id);
				anchorId = current.id;
				return;
			case 'Delete':
			case 'Backspace': {
				if (!canEdit) return;
				handled();
				requestDelete(current, () => refocusAt(at));
				return;
			}
		}
	}

	function onSearchKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		// First Escape clears the search, the next one leaves the box.
		if (search) search = '';
		else searchInput?.blur();
	}

	async function addTodo(title: string) {
		await controller.add({ title });
	}
	function openImport(text = '') {
		importText = text;
		importOpen = true;
	}
	function copyTodo(todo: Todo, quick = false): Promise<boolean> {
		const bare =
			!todo.description?.trim() && !todo.attachments.length && !controller.childrenOf(todo.id).length;
		const text = quick && bare ? todo.title : formatTodoForCopy(todo, data.project.name, controller.items);
		return navigator.clipboard.writeText(text).then(
			() => {
				toasts.success('Task copied to clipboard');
				return true;
			},
			() => {
				toasts.error('Could not copy');
				return false;
			}
		);
	}

	function copySelected(): Promise<boolean> {
		const todos = selectedTodos;
		return navigator.clipboard.writeText(formatTodosAsChecklist(todos)).then(
			() => {
				toasts.success(`Copied ${todos.length} task${todos.length === 1 ? '' : 's'} to clipboard`);
				return true;
			},
			() => {
				toasts.error('Could not copy');
				return false;
			}
		);
	}

	function copySelectedForAI(): Promise<boolean> {
		const todos = selectedTodos;
		// One doc: each task's full AI markdown, split by an h1 rule.
		const text = todos
			.map((t) => formatTodoForCopy(t, data.project.name, controller.items))
			.join('\n\n---\n\n');
		return navigator.clipboard.writeText(text).then(
			() => {
				toasts.success(`Copied ${todos.length} task${todos.length === 1 ? '' : 's'} for AI`);
				return true;
			},
			() => {
				toasts.error('Could not copy');
				return false;
			}
		);
	}

	function exportToClipboard() {
		projectMenuOpen = false;
		const all = controller.items;
		navigator.clipboard
			.writeText(formatTodosAsChecklist(all))
			.then(() => toasts.success(`Copied ${all.length} task${all.length === 1 ? '' : 's'} to clipboard`))
			.catch(() => toasts.error('Could not copy'));
	}
	function exportToFile() {
		projectMenuOpen = false;
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
	function onWindowPointerDown(e: PointerEvent) {
		keyboardNav = false;
		if (projectMenuOpen) {
			const host = projectMenuAnchor === 'header' ? projectMenuHost : floatingMenuHost;
			if (!host?.contains(e.target as Node)) projectMenuOpen = false;
		}
	}
</script>

<svelte:head><title>{data.project.name} · Duet</title></svelte:head>

<svelte:window {onkeydown} onpointerdown={onWindowPointerDown} bind:scrollY />

<!-- `group` is set on grouped top-level rows only; subtasks aren't grouped, so show all their fields. -->
{#snippet node(todo: Todo, depth: number, group?: { field: GroupKey; key: string })}
	{@const kids = childrenShown(todo.id)}
	<TodoRow
		{todo}
		{canEdit}
		onToggle={(id) => controller.toggle(id)}
		onSetInProgress={canEdit ? (id, on) => controller.setInProgress(id, on) : undefined}
		onNotDoing={canEdit ? (id) => controller.toggle(id, true) : undefined}
		onOpen={(t) => {
			focusedId = t.id;
			selectTodo(t.id);
		}}
		onCopy={copyTodo}
		onDelete={() => requestDelete(todo)}
		onDuplicate={canEdit ? (id) => controller.duplicate(id) : undefined}
		onUpdate={canEdit ? (id, patch) => controller.update(id, patch) : undefined}
		onCreateTag={createTag}
		members={data.members}
		categories={data.categories}
		projectTags={data.tags}
		{selecting}
		selected={selectedIds.has(todo.id)}
		focused={keyboardNav && focusedId === todo.id}
		onSelect={canEdit ? selectTask : undefined}
		tree={treeMode}
		subtasks={subtaskCounts(todo.id)}
		collapsed={isCollapsed(todo.id)}
		onToggleCollapse={toggleCollapse}
		onAddSubtask={canEdit ? startSubtask : undefined}
		onOutdent={canEdit ? outdent : undefined}
		{group}
		hiddenFields={data.project.hiddenFields}
		onDragStart={canDrag && !todo.completed ? onRowDragStart : undefined}
		onDragEnd={onRowDragEnd}
		dragged={dragging?.id === todo.id}
		dropPos={dropTarget?.id === todo.id ? dropTarget.pos : null}
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

{#snippet projectMenuItems()}
	{#if canManage}
		<button class="menu-item" onclick={() => { projectMenuOpen = false; settingsOpen = true; }}>
			<Icon name="settings" size={15} /> Project settings
		</button>
		<button class="menu-item" onclick={() => { projectMenuOpen = false; membersOpen = true; }}>
			<Icon name="users" size={15} /> Members
		</button>
		<button class="menu-item" onclick={() => { projectMenuOpen = false; secretsOpen = true; }}>
			<Icon name="key" size={15} /> Keys & secrets
		</button>
		<button class="menu-item" onclick={() => { projectMenuOpen = false; tagsCategoriesOpen = true; }}>
			<Icon name="tag" size={15} /> Tags & categories
		</button>
	{/if}
	{#if canManage && (canEdit || controller.items.length)}<hr />{/if}
	{#if canEdit}
		<button class="menu-item" onclick={() => { projectMenuOpen = false; openImport(); }}>
			<Icon name="clipboard" size={15} /> Import tasks
		</button>
	{/if}
	{#if controller.items.length}
		<button class="menu-item" onclick={exportToClipboard}>
			<Icon name="copy" size={15} /> Copy as checklist
		</button>
		<button class="menu-item" onclick={exportToFile}>
			<Icon name="download" size={15} /> Download JSON file
		</button>
	{/if}
	{#if canManage}
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
	{/if}
{/snippet}

<div class="project" style={accentStyle}>
	<header class="proj-head project-surface">
		<div class="title-area">
			<span class="proj-icon project-tile"><ProjectIcon icon={data.project.icon} iconUrl={data.project.iconUrl} /></span>
			<div class="titles">
				<div class="title-row">
					<h1>{data.project.name}</h1>
					<ProjectStatusBadge status={data.project.status} />
				</div>
				{#if data.project.description}
					<p class="desc" title={data.project.description}>{data.project.description}</p>
				{/if}
				<p class="counts">
					{controller.open.length} open · {controller.done.length} done
					{#if data.members.length > 1}· {data.members.length} members{/if}
				</p>
			</div>
		</div>

		<div class="head-actions">
			{#if canEdit && controller.items.length}
				<Button
					class="btn-select"
					variant={selecting ? 'subtle' : 'ghost'}
					size="sm"
					icon="check-circle"
					title="Select tasks to edit together (or Cmd/Ctrl-click a task)"
					onclick={() => (selecting ? clearSelection() : (selectMode = true))}
				>
					{selecting ? 'Done' : 'Select'}
				</Button>
				{#if selecting && !selectedIds.size && visibleTodos.length}
					<Button variant="ghost" size="sm" onclick={selectAll}>Select all</Button>
				{/if}
			{/if}
			<div class="searchbox">
				<Icon name="search" size={15} />
				<input
					bind:this={searchInput}
					bind:value={search}
					onkeydown={onSearchKeydown}
					placeholder="Search tasks"
					aria-label="Search tasks"
				/>
				{#if !search}<kbd class="search-kbd" aria-hidden="true">/</kbd>{/if}
			</div>
			{#if canEdit}
				<Button class="btn-keys" variant="ghost" size="sm" icon="key" title="Keys & secrets" onclick={() => (secretsOpen = true)}>
					Keys
				</Button>
			{/if}
			<Button class="btn-members" variant="ghost" size="sm" icon="users" onclick={() => (membersOpen = true)}>
				{data.members.length}
			</Button>
			{#if canManage || canEdit || controller.items.length}
				<div class="menu-host" bind:this={projectMenuHost}>
					<button class="icon-btn" aria-label="Project menu" onclick={() => toggleProjectMenu('header')}>
						<Icon name="more-horizontal" size={18} />
					</button>
					{#if projectMenuOpen && projectMenuAnchor === 'header'}
						<div class="menu">
							{@render projectMenuItems()}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</header>

	{#if scrolledPastHeader && (canEdit || canManage || controller.items.length) && !(selecting && selectedIds.size)}
		<div class="floating-actions" transition:fly={{ y: 12, duration: 150 }}>
			{#if canEdit && controller.items.length}
				<button
					class="icon-btn floating-btn"
					class:on={selecting}
					aria-label={selecting ? 'Done selecting' : 'Select tasks'}
					title="Select tasks to edit together (or Cmd/Ctrl-click a task)"
					onclick={() => (selecting ? clearSelection() : (selectMode = true))}
				>
					<Icon name="check-circle" size={18} />
				</button>
			{/if}
			{#if canManage || canEdit || controller.items.length}
				<div class="menu-host" bind:this={floatingMenuHost}>
					<button class="icon-btn floating-btn" aria-label="Project menu" onclick={() => toggleProjectMenu('floating')}>
						<Icon name="more-horizontal" size={18} />
					</button>
					{#if projectMenuOpen && projectMenuAnchor === 'floating'}
						<div class="menu floating-menu">
							{@render projectMenuItems()}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<div
		class="work"
		class:no-quick={!canEdit}
		style="--list-width: {data.project.listWidth ? `${data.project.listWidth}px` : 'none'}"
		role="presentation"
		ondragover={onListDragOver}
		ondragleave={onListDragLeave}
		ondrop={onListDrop}
	>
		{#if canEdit}
			<div class="quick" class:glass={data.appStyle === 'glass'}>
				<QuickAdd bind:this={quickAdd} glass={data.appStyle === 'glass'} onAdd={addTodo} onPasteMultiline={openImport} />
			</div>
		{/if}

		{#if controller.items.length}
			<div class="toolbar-row">
				<ViewBar bind:view categories={data.categories} tags={data.tags} members={data.members} />
				{#if view.group !== 'none' && !narrowed && openGroups.length > 1}
					<div class="group-tools">
						{#if anyGroupExpanded}
							<button class="tool-btn" onclick={() => setAllGroups(true)}>Collapse all</button>
						{/if}
						{#if anyGroupCollapsed}
							<button class="tool-btn" onclick={() => setAllGroups(false)}>Expand all</button>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		{#if openTodos.length === 0 && doneTodos.length === 0}
			<div class="empty-state">
				<span class="es-emoji"><ProjectIcon icon={data.project.icon} iconUrl={data.project.iconUrl} /></span>
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
				{@const groupIds = group.todos.map((t) => t.id)}
				{@const groupFullySelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id))}
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
						{#if selecting && group.todos.length}
							<button class="group-select-btn" onclick={() => toggleGroupSelection(groupIds)}>
								{groupFullySelected ? 'Deselect all' : 'Select all'}
							</button>
						{/if}
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

			{#if completedTodos.length}
				<div class="done-section">
					<button class="done-toggle" onclick={() => (showCompleted = !showCompleted)}>
						<Icon name={showCompleted ? 'chevron-down' : 'chevron-right'} size={15} />
						Completed <span class="done-count">{completedTodos.length}</span>
					</button>
					{#if showCompleted}
						<section class="list done" transition:slide={{ duration: 180 }}>
							{#each completedTodos as todo (todo.id)}
								<div animate:flip={{ duration: 200 }}>{@render node(todo, 0)}</div>
							{/each}
						</section>
					{/if}
				</div>
			{/if}
			{#if notDoingTodos.length}
				<div class="done-section">
					<button class="done-toggle" onclick={() => (showNotDoing = !showNotDoing)}>
						<Icon name={showNotDoing ? 'chevron-down' : 'chevron-right'} size={15} />
						Not doing <span class="done-count">{notDoingTodos.length}</span>
					</button>
					{#if showNotDoing}
						<section class="list done" transition:slide={{ duration: 180 }}>
							{#each notDoingTodos as todo (todo.id)}
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
		accent={data.project.color}
		todo={selected}
		{canEdit}
		members={data.members}
		categories={data.categories}
		tags={data.tags}
		onUpdate={(patch) => controller.update(selected!.id, patch)}
		onToggle={(id) => controller.toggle(id)}
		onSetInProgress={(id, on) => controller.setInProgress(id, on)}
		onNotDoing={(id) => controller.toggle(id, true)}
		onDelete={() => requestDelete(selected!, () => selectTodo(null))}
		onDuplicate={canEdit ? (id) => controller.duplicate(id) : undefined}
		onCopy={copyTodo}
		onClose={() => selectTodo(null)}
		onCreateTag={createTag}
		onCreateCategory={createCategory}
		onAddAttachment={(file) => controller.addAttachment(selected!.id, file)}
		onRemoveAttachment={(id) => controller.removeAttachment(selected!.id, id)}
		onAddUrlLink={(url, title) => controller.addUrlLink(selected!.id, url, title)}
		onAddTaskLink={(linkedProjectId, linkedTodoId) =>
			controller.addTaskLink(selected!.id, linkedProjectId, linkedTodoId)}
		onUpdateLink={(id, url, title) => controller.updateLink(selected!.id, id, { url, title })}
		onRemoveLink={(id) => controller.removeLink(selected!.id, id)}
		ancestors={controller.ancestorsOf(selected.id)}
		subtasks={controller.childrenOf(selected.id)}
		{parentOptions}
		onOpenTask={selectTodo}
		onAddSubtask={(title) => controller.add({ title, parentId: selected!.id })}
		focusTitle={focusTitleOnOpen}
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
		onCopy={copySelected}
		onCopyForAI={copySelectedForAI}
		onSelectAll={selectAll}
		onClear={clearSelection}
		onCreateTag={createTag}
		onCreateCategory={createCategory}
	/>
{/if}

<DeleteTaskDialog
	todo={pendingDelete?.todo ?? null}
	subtasks={pendingSubtasks}
	onConfirm={(todo) => {
		const after = pendingDelete?.after;
		pendingDelete = null;
		deleteTodo(todo.id, after);
	}}
	onCancel={() => (pendingDelete = null)}
/>
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
<ProjectDialog
	bind:open={settingsOpen}
	mode="edit"
	project={data.project}
	defaults={data.projectDefaults}
	onrestore={(todos) => controller.merge(todos)}
/>
{#if canEdit}
	<SecretsDialog bind:open={secretsOpen} projectId={data.project.id} />
	<TagsCategoriesDialog bind:open={tagsCategoriesOpen} projectId={data.project.id} />
{/if}

<style>
	.project {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	/* Lifted over the pinned quick add: glass headers form their own stacking context
	   (backdrop-filter), which would otherwise trap the project menu beneath it. */
	.proj-head {
		position: relative;
		z-index: calc(var(--z-base) + 1);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-5) var(--space-6);
		border-bottom: 1px solid var(--project-border, var(--border));
		flex-wrap: wrap;
	}
	.title-area {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}
	.proj-icon {
		width: 44px;
		height: 44px;
		font-size: 24px;
	}
	.titles h1 {
		font-size: var(--text-xl);
		line-height: 1.1;
	}
	.title-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.titles {
		min-width: 0;
	}
	.desc {
		color: var(--text-muted);
		font-size: var(--text-sm);
		margin-top: 2px;
		max-width: 60ch;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.counts {
		color: var(--text-subtle);
		font-size: var(--text-sm);
		margin-top: 2px;
	}
	.head-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-2);
		min-width: 0;
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
	.search-kbd {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-faint);
		border: 1px solid var(--border);
		border-radius: var(--radius-xs);
		padding: 0 5px;
	}
	.searchbox:focus-within .search-kbd {
		display: none;
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
	.menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: var(--z-dropdown);
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

	.floating-actions {
		position: fixed;
		right: var(--space-5);
		bottom: var(--space-5);
		z-index: var(--z-dropdown);
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-xl);
	}
	.floating-btn.on {
		background: var(--accent-soft);
		color: var(--accent-text);
	}
	.floating-menu {
		top: auto;
		bottom: calc(100% + 8px);
	}

	.work {
		flex: 1;
		padding: 0 var(--space-6) var(--space-16);
		max-width: var(--list-width, 820px);
		width: 100%;
		margin: 0 auto;
	}
	/* Pinned while the list scrolls; it supplies .work's top padding so it sits flush when stuck.
	   The document is the scroller, so no ancestor may set overflow or the sticky never engages.
	   Kept at the base layer (not --z-sticky) so the header and every dropdown menu still paint
	   above it. */
	.quick {
		position: sticky;
		top: var(--topbar-height, 0px);
		z-index: var(--z-base);
		padding: var(--space-5) 0 var(--space-3);
		background: transparent;
	}
	.work.no-quick {
		padding-top: var(--space-5);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.toolbar-row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
	}
	.toolbar-row :global(.viewbar) {
		flex: 1;
		min-width: 0;
	}
	.group-tools {
		display: flex;
		gap: var(--space-1);
		flex-shrink: 0;
		/* Line up with the 28px-tall ViewBar controls. */
		height: 28px;
	}
	.tool-btn {
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		white-space: nowrap;
		transition: all var(--transition-fast);
	}
	.tool-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.group-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin: var(--space-5) 0 var(--space-2);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--text);
	}
	.group-select-btn {
		display: inline-flex;
		align-items: center;
		height: 24px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		white-space: nowrap;
		transition: all var(--transition-fast);
	}
	.group-select-btn:hover {
		background: var(--surface-hover);
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
			padding: 0 var(--space-4) var(--space-16);
		}
		.quick {
			padding-top: var(--space-4);
		}
		.work.no-quick {
			padding-top: var(--space-4);
		}
		.searchbox input {
			width: 100px;
		}
		.project .proj-head .head-actions :global(.btn-keys),
		.project .proj-head .head-actions :global(.btn-members) {
			display: none;
		}
	}

	@media (max-width: 350px) {
		.project .proj-head .head-actions :global(.btn-select) {
			width: 30px;
			padding: 0;
		}
		.project .proj-head .head-actions :global(.btn-select) :global(.label) {
			display: none;
		}
	}
</style>
