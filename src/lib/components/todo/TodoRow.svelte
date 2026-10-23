<script lang="ts">
	import Icon, { type IconName } from '#lib/components/ui/Icon.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import DateField from '#lib/components/ui/DateField.svelte';
	import { deadlineInfo, toDateInput } from '#lib/date';
	import { markdownExcerpt } from '#lib/markdown';
	import TitleText from '#lib/components/ui/TitleText.svelte';
	import { Copied } from '#lib/copied.svelte';
	import {
		URGENCIES,
		SIZES,
		URGENCY_META,
		SIZE_META,
		isInProgress,
		type Category,
		type Member,
		type RowField,
		type Tag,
		type Todo
	} from '#lib/types';
	import type { GroupKey } from '#lib/todoView';
	import type { NewTodoInput } from '#lib/stores/todos.svelte';

	interface Props {
		todo: Todo;
		canEdit: boolean;
		onToggle: (id: string) => void;
		onSetInProgress?: (id: string, inProgress: boolean) => void;
		/** Close an open task without doing it. */
		onNotDoing?: (id: string) => void;
		onOpen: (todo: Todo) => void;
		/** `quick` is set by the inline icon, which copies just the title for bare tasks. */
		onCopy: (todo: Todo, quick?: boolean) => Promise<boolean>;
		onDelete: (id: string) => void;
		onDuplicate?: (id: string) => void;
		/** Quick edits from the menu; the field submenus show only when this is set. */
		onUpdate?: (id: string, patch: Partial<NewTodoInput>) => void;
		onCreateTag?: (name: string) => Promise<Tag | null>;
		members?: Member[];
		categories?: Category[];
		projectTags?: Tag[];
		/** Selection mode: clicking the row selects instead of opening. */
		selecting?: boolean;
		selected?: boolean;
		/** Under the keyboard cursor. */
		focused?: boolean;
		onSelect?: (id: string, e: MouseEvent) => void;
		/** Reserve a gutter for the expand/collapse chevron (project has subtasks). */
		tree?: boolean;
		/** Direct subtask counts; the chevron shows when `total` > 0. */
		subtasks?: { done: number; total: number };
		collapsed?: boolean;
		onToggleCollapse?: (id: string) => void;
		onAddSubtask?: (todo: Todo) => void;
		/** Move one level up the tree; only offered for subtasks. */
		onOutdent?: (todo: Todo) => void;
		/** The list group this row sits in; its field is implied by the heading, so isn't repeated. */
		group?: { field: GroupKey; key: string };
		/** Fields the project has chosen not to show on rows. */
		hiddenFields?: RowField[];
		/** Drag to reorder; the row is draggable only when this is set. */
		onDragStart?: (todo: Todo, e: DragEvent) => void;
		onDragEnd?: () => void;
		/** This row is the one being dragged. */
		dragged?: boolean;
		/** A drag would land just above or below this row. */
		dropPos?: 'before' | 'after' | null;
	}
	let {
		todo,
		canEdit,
		onToggle,
		onSetInProgress,
		onNotDoing,
		onOpen,
		onCopy,
		onDelete,
		onDuplicate,
		onUpdate,
		onCreateTag,
		members = [],
		categories = [],
		projectTags = [],
		selecting = false,
		selected = false,
		focused = false,
		onSelect,
		tree = false,
		subtasks = { done: 0, total: 0 },
		collapsed = false,
		onToggleCollapse,
		onAddSubtask,
		onOutdent,
		group,
		hiddenFields = [],
		onDragStart,
		onDragEnd,
		dragged = false,
		dropPos = null
	}: Props = $props();

	const copied = new Copied();

	function onBodyClick(e: MouseEvent) {
		// Cmd/Ctrl/Shift-click starts (or extends) a selection without a mode switch.
		if (onSelect && (selecting || e.metaKey || e.ctrlKey || e.shiftKey)) {
			e.preventDefault();
			onSelect(todo.id, e);
		} else onOpen(todo);
	}

	const shows = (field: RowField) => !hiddenFields.includes(field);
	const hides = (field: GroupKey) => group?.field === field;
	const category = $derived(hides('category') || !shows('category') ? null : todo.category);
	// Under a tag heading only that tag is implied; the task's other tags still show.
	const tags = $derived(
		!shows('tags') ? [] : hides('tag') ? todo.tags.filter((t) => t.id !== group!.key) : todo.tags
	);
	const assignee = $derived(hides('assignee') || !shows('assignee') ? null : todo.assignee);
	const urgency = $derived(hides('urgency') || !shows('urgency') ? null : todo.urgency);
	const size = $derived(hides('size') || !shows('size') ? null : todo.size);
	// Deadline buckets are ranges, so the date still adds detail — except under "Today".
	const deadline = $derived(
		(hides('deadline') && group!.key === 'today') || !shows('deadline') ? null : deadlineInfo(todo.deadline)
	);
	const progress = $derived(shows('subtasks') ? subtasks.total : 0);
	const notes = $derived(shows('notes') && !!todo.description);
	const images = $derived(shows('attachments') ? todo.attachments.length : 0);
	const excerpt = $derived(shows('excerpt') ? markdownExcerpt(todo.description, 400) : '');
	const inProgress = $derived(isInProgress(todo));
	let menuOpen = $state(false);

	type Submenu = 'deadline' | 'assignee' | 'urgency' | 'size' | 'category' | 'tags';
	// The menu drills into one field at a time rather than flying out, so it never runs off-screen.
	let submenu = $state<Submenu | null>(null);
	let newTagName = $state('');
	const SUBMENUS: { key: Submenu; label: string; icon: IconName }[] = [
		{ key: 'deadline', label: 'Deadline', icon: 'calendar' },
		{ key: 'assignee', label: 'Assignee', icon: 'user' },
		{ key: 'urgency', label: 'Urgency', icon: 'flag' },
		{ key: 'size', label: 'Size', icon: 'inbox' },
		{ key: 'category', label: 'Category', icon: 'folder' },
		{ key: 'tags', label: 'Tags', icon: 'tag' }
	];

	let menuHost = $state<HTMLElement>();
	let menuEl = $state<HTMLElement>();
	// Opens upward when there isn't room below; re-checked as submenus change its height.
	let menuUp = $state(false);
	$effect(() => {
		if (!menuOpen || !menuEl || !menuHost) return;
		void submenu;
		const host = menuHost.getBoundingClientRect();
		const below = window.innerHeight - host.bottom;
		menuUp = menuEl.offsetHeight + 8 > below && host.top > below;
	});

	function toggleMenu() {
		menuOpen = !menuOpen;
		submenu = null;
	}
	function closeMenu() {
		menuOpen = false;
		submenu = null;
	}
	function set(patch: Partial<NewTodoInput>) {
		closeMenu();
		onUpdate?.(todo.id, patch);
	}
	// Tags toggle in place so several can be picked in one go.
	function toggleTag(tagId: string) {
		const ids = todo.tags.map((t) => t.id);
		onUpdate?.(todo.id, { tagIds: ids.includes(tagId) ? ids.filter((id) => id !== tagId) : [...ids, tagId] });
	}
	async function addNewTag() {
		const name = newTagName.trim();
		if (!name || !onCreateTag) return;
		newTagName = '';
		const tag = await onCreateTag(name);
		if (tag) onUpdate?.(todo.id, { tagIds: [...todo.tags.map((t) => t.id), tag.id] });
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && menuOpen && (submenu ? (submenu = null) : closeMenu())} />

{#snippet fieldMenu(key: Submenu)}
	{@const meta = SUBMENUS.find((m) => m.key === key)!}
	<button class="menu-item menu-back" onclick={() => (submenu = null)}>
		<Icon name="chevron-left" size={14} />
		{meta.label}
	</button>
	<hr />
	<div class="menu-list">
		{#if key === 'deadline'}
			<DateField
				inline
				clearable={false}
				value={toDateInput(todo.deadline)}
				aria-label="Pick a date"
				onvalue={(v: string | null) => set({ deadline: v })}
			/>
			{#if todo.deadline}
				<hr />
				<button class="menu-item danger" onclick={() => set({ deadline: null })}>
					<Icon name="x" size={15} /> Clear deadline
				</button>
			{/if}
		{:else if key === 'assignee'}
			{@render option('Unassigned', !todo.assigneeId, () => set({ assigneeId: null }))}
			{#each members as m (m.userId)}
				{@render option(m.name || m.email, todo.assigneeId === m.userId, () => set({ assigneeId: m.userId }))}
			{/each}
		{:else if key === 'urgency'}
			{@render option('None', !todo.urgency, () => set({ urgency: null }))}
			{#each URGENCIES as u (u)}
				{@render option(URGENCY_META[u].label, todo.urgency === u, () => set({ urgency: u }), URGENCY_META[u].color)}
			{/each}
		{:else if key === 'size'}
			{@render option('None', !todo.size, () => set({ size: null }))}
			{#each SIZES as sz (sz)}
				{@render option(SIZE_META[sz].full, todo.size === sz, () => set({ size: sz }))}
			{/each}
		{:else if key === 'category'}
			{@render option('No category', !todo.categoryId, () => set({ categoryId: null }))}
			{#each categories as c (c.id)}
				{@render option(c.name, todo.categoryId === c.id, () => set({ categoryId: c.id }), c.color)}
			{/each}
		{:else if key === 'tags'}
			{#each projectTags as tag (tag.id)}
				{@render option(tag.name, todo.tags.some((t) => t.id === tag.id), () => toggleTag(tag.id), tag.color)}
			{:else}
				<p class="menu-empty">No tags yet.</p>
			{/each}
			{#if onCreateTag}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						addNewTag();
					}}
				>
					<input class="new-tag" bind:value={newTagName} placeholder="+ new tag" maxlength="60" />
				</form>
			{/if}
		{/if}
	</div>
{/snippet}

{#snippet option(label: string, on: boolean, pick: () => void, color?: string)}
	<button class="menu-item" class:on onclick={pick}>
		<span class="menu-check">{#if on}<Icon name="check" size={14} strokeWidth={2.5} />{/if}</span>
		{#if color}<span class="swatch" style="--c: {color}"></span>{/if}
		<span class="truncate">{label}</span>
	</button>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions (Alt-arrows are the keyboard way to reorder) -->
<!-- svelte-ignore a11y_click_events_have_key_events (the row click is a pointer-only convenience; everything it does is also reachable via the buttons inside it) -->
<div
	class="row {dropPos ? `drop-${dropPos}` : ''}"
	class:done={todo.completed}
	class:skipped={todo.notDoing}
	class:selected
	class:focused
	class:dragged
	data-todo-id={todo.id}
	data-group={group?.key}
	draggable={!!onDragStart && !menuOpen}
	ondragstart={(e) => onDragStart?.(todo, e)}
	ondragend={() => onDragEnd?.()}
	onclick={onBodyClick}
	onmousedown={(e) => e.shiftKey && onSelect && e.preventDefault()}
>
	{#if tree}
		{#if subtasks.total}
			<button
				class="twisty"
				onclick={(e) => {
					e.stopPropagation();
					onToggleCollapse?.(todo.id);
				}}
				aria-label={collapsed ? 'Expand subtasks' : 'Collapse subtasks'}
				aria-expanded={!collapsed}
			>
				<Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={14} />
			</button>
		{:else}
			<span class="twisty" aria-hidden="true"></span>
		{/if}
	{/if}
	{#if selecting}
		<button
			class="select"
			class:on={selected}
			onclick={(e) => {
				e.stopPropagation();
				onSelect?.(todo.id, e);
			}}
			aria-label={selected ? 'Deselect task' : 'Select task'}
			aria-pressed={selected}
		>
			{#if selected}<Icon name="check" size={12} strokeWidth={3} />{/if}
		</button>
	{/if}
	<button
		class="check"
		class:on={todo.completed}
		class:skipped={todo.notDoing}
		class:progress={inProgress}
		disabled={!canEdit}
		onclick={(e) => {
			e.stopPropagation();
			onToggle(todo.id);
		}}
		oncontextmenu={(e) => {
			// Right-click toggles in progress; starting a done task reopens it.
			if (!onSetInProgress || !canEdit) return;
			e.preventDefault();
			onSetInProgress(todo.id, !inProgress);
		}}
		aria-label={todo.completed ? 'Mark as not done' : 'Mark as done'}
		aria-pressed={todo.completed}
		title={inProgress ? 'In progress' : todo.notDoing ? 'Not doing' : undefined}
	>
		{#if todo.notDoing}<Icon name="x" size={12} strokeWidth={3} />
		{:else if todo.completed}<Icon name="check" size={13} strokeWidth={3} />{/if}
	</button>

	<div class="body">
		<div class="title-line">
			{#if urgency && !todo.completed}
				<span
					class="urgency-dot"
					style="--u: {URGENCY_META[urgency].color}"
					title="{URGENCY_META[urgency].label} urgency"
				></span>
			{/if}
			<span class="title"><TitleText text={todo.title} /></span>
		</div>

		{#if excerpt || inProgress || progress || category || tags.length || deadline || size || notes || images}
			<div class="meta">
				{#if inProgress}
					<span class="chip started"><Icon name="clock" size={12} />In progress</span>
				{/if}
				{#if progress}
					<span
						class="chip progress"
						class:complete={subtasks.done === subtasks.total}
						title="{subtasks.done} of {subtasks.total} subtasks done"
					>
						<Icon name="check-circle" size={12} />{subtasks.done}/{subtasks.total}
					</span>
				{/if}
				{#if category}
					<span class="chip" style="--c: {category.color}">
						<span class="dot"></span>{category.name}
					</span>
				{/if}
				{#each tags as tag (tag.id)}
					<span class="tag" style="--c: {tag.color}">{tag.name}</span>
				{/each}
				{#if deadline}
					<span class="chip deadline {deadline.state}">
						<Icon name="calendar" size={12} />{deadline.label}
					</span>
				{/if}
				{#if size}
					<span class="chip size" title={SIZE_META[size].full}>{SIZE_META[size].label}</span>
				{/if}
				{#if notes}
					<span class="chip ghost" title="Has notes"><Icon name="clipboard" size={12} /></span>
				{/if}
				{#if images}
					<span class="chip ghost" title="{images} image(s)">
						<Icon name="image" size={12} />{images}
					</span>
				{/if}
				{#if excerpt}
					<span class="excerpt truncate">{excerpt}</span>
				{/if}
			</div>
		{/if}
	</div>

	<!-- svelte-ignore a11y_click_events_have_key_events (only stops the row's click from firing; all actions inside have their own handlers) -->
	<div class="right" onclick={(e) => e.stopPropagation()}>
		{#if assignee}
			<Avatar name={assignee.name} image={assignee.image} size={22} />
		{/if}
		<div class="actions" class:open={menuOpen}>
			<button
				class="act"
				title="Copy for AI"
				onclick={async () => (await onCopy(todo, true)) && copied.mark(true)}
				aria-label="Copy task"
			>
				<Icon name={copied.icon(true)} size={15} />
			</button>
			{#if canEdit}
				<div class="menu-host" bind:this={menuHost}>
					<button
						class="act"
						title="More"
						aria-label="More actions"
						aria-expanded={menuOpen}
						onclick={toggleMenu}
					>
						<Icon name="more-horizontal" size={15} />
					</button>
					{#if menuOpen}
						<button class="menu-scrim" aria-label="Close" onclick={closeMenu}></button>
						<div class="menu" class:up={menuUp} bind:this={menuEl}>
							{#if submenu}
								{@render fieldMenu(submenu)}
							{:else}
								<button
									class="menu-item"
									onclick={() => {
										menuOpen = false;
										onOpen(todo);
									}}
								>
									<Icon name="pencil" size={15} /> Edit
								</button>
								{#if onUpdate}
									<hr />
									{#each SUBMENUS as m (m.key)}
										<button class="menu-item" onclick={() => (submenu = m.key)}>
											<Icon name={m.icon} size={15} />
											{m.label}
											<span class="menu-trail"><Icon name="chevron-right" size={14} /></span>
										</button>
									{/each}
									<hr />
								{/if}
								{#if onSetInProgress && !todo.completed}
									<button
										class="menu-item"
										onclick={() => {
											menuOpen = false;
											onSetInProgress(todo.id, !inProgress);
										}}
									>
										<Icon name="clock" size={15} />
										{inProgress ? 'Stop progress' : 'Mark in progress'}
									</button>
								{/if}
								{#if onNotDoing && !todo.completed}
									<button
										class="menu-item"
										onclick={() => {
											menuOpen = false;
											onNotDoing(todo.id);
										}}
									>
										<Icon name="ban" size={15} /> Not doing
									</button>
								{/if}
								{#if onAddSubtask}
									<button
										class="menu-item"
										onclick={() => {
											menuOpen = false;
											onAddSubtask(todo);
										}}
									>
										<Icon name="corner-down-right" size={15} /> Add subtask
									</button>
								{/if}
								{#if onOutdent && todo.parentId}
									<button
										class="menu-item"
										onclick={() => {
											menuOpen = false;
											onOutdent(todo);
										}}
									>
										<Icon name="corner-up-left" size={15} /> Move out a level
									</button>
								{/if}
								<button
									class="menu-item"
									onclick={() => {
										menuOpen = false;
										onCopy(todo);
									}}
								>
									<Icon name="copy" size={15} /> Copy for AI
								</button>
								{#if onDuplicate}
									<button
										class="menu-item"
										onclick={() => {
											menuOpen = false;
											onDuplicate(todo.id);
										}}
									>
										<Icon name="files" size={15} /> Duplicate
									</button>
								{/if}
								<hr />
								<button
									class="menu-item danger"
									onclick={() => {
										menuOpen = false;
										onDelete(todo.id);
									}}
								>
									<Icon name="trash" size={15} /> Delete
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-3);
		border-radius: var(--radius-md);
		transition: background var(--transition-fast);
		cursor: pointer;
	}
	.row:hover {
		background: var(--surface-hover);
	}
	.row.selected {
		background: var(--accent-soft);
	}
	.row.focused {
		box-shadow: inset 0 0 0 1.5px var(--accent);
	}
	.row[draggable='true'] {
		-webkit-user-drag: element;
	}
	.row.dragged {
		opacity: 0.4;
	}
	.row.drop-before {
		box-shadow: inset 0 2px 0 var(--accent);
	}
	.row.drop-after {
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.twisty {
		margin: 2px calc(var(--space-2) * -1) 0 calc(var(--space-1) * -1);
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		border-radius: var(--radius-xs);
		color: var(--text-faint);
	}
	button.twisty:hover {
		color: var(--text);
		background: var(--surface-active);
	}
	.select {
		margin-top: 2px;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		border-radius: 5px;
		border: 1.8px solid var(--border-strong);
		display: grid;
		place-items: center;
		color: var(--accent-contrast);
		transition: all var(--transition-fast);
	}
	.select:hover {
		border-color: var(--accent);
	}
	.select.on {
		background: var(--accent);
		border-color: var(--accent);
	}
	.check {
		margin-top: 1px;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		border: 1.8px solid var(--border-strong);
		display: grid;
		place-items: center;
		color: var(--accent-contrast);
		transition: all var(--transition-fast);
	}
	.check:hover:not(:disabled) {
		border-color: var(--accent);
	}
	.check.on {
		background: var(--accent);
		border-color: var(--accent);
	}
	/* Struck out rather than ticked: closed without being done. */
	.check.skipped {
		background: var(--surface-inset);
		border-color: var(--border-strong);
		color: var(--text-subtle);
	}
	/* Half-filled ring: started but not done. */
	.check.progress {
		border-color: var(--accent);
		background: linear-gradient(90deg, var(--accent) 50%, transparent 50%) content-box;
		padding: 2px;
	}
	.check:disabled {
		cursor: default;
	}

	.body {
		flex: 1;
		min-width: 0;
		text-align: left;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.title-line {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.urgency-dot {
		width: 7px;
		height: 7px;
		border-radius: var(--radius-full);
		background: var(--u);
		flex-shrink: 0;
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--u), transparent 80%);
	}
	.title {
		font-size: var(--text-base);
		color: var(--text);
		line-height: var(--leading-snug);
		overflow-wrap: anywhere;
	}
	.done .title {
		color: var(--text-subtle);
		text-decoration: line-through;
	}
	.skipped .title {
		color: var(--text-faint);
	}
	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		font-size: var(--text-xs);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		background: var(--surface-inset);
		color: var(--text-muted);
		font-weight: var(--weight-medium);
		white-space: nowrap;
	}
	.chip .dot {
		width: 7px;
		height: 7px;
		border-radius: var(--radius-full);
		background: var(--c);
	}
	.tag {
		display: inline-flex;
		align-items: center;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		font-weight: var(--weight-medium);
		color: color-mix(in oklab, var(--c), var(--text) 25%);
		background: color-mix(in oklab, var(--c) 16%, var(--surface));
		border: 1px solid color-mix(in oklab, var(--c) 35%, transparent);
		white-space: nowrap;
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
	.size {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: var(--weight-semibold);
	}
	.chip.ghost {
		padding: 2px 5px;
	}
	.chip.started {
		color: var(--accent-text);
		background: var(--accent-soft);
	}
	.progress.complete {
		color: var(--accent-text);
		background: var(--accent-soft);
	}
	/* Fills whatever the chips leave, so it grows with the list width; wraps below them if squeezed. */
	.excerpt {
		color: var(--text-faint);
		flex: 1 1 160px;
		min-width: 0;
	}

	.right {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}
	/* Out of the layout until wanted, so the title gets the full width. */
	.actions {
		display: none;
		align-items: center;
		gap: 2px;
		/* The buttons are taller than a single-line row; bleed into its padding rather than grow it. */
		margin-block: -4px;
	}
	.row:hover .actions,
	.row:has(:focus-visible) .actions,
	.actions.open {
		display: flex;
	}
	/* No hover on touch, so they'd never appear. */
	@media (hover: none) {
		.actions {
			display: flex;
		}
	}
	.act {
		display: inline-flex;
		padding: 6px;
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
		transition: all var(--transition-fast);
	}
	.act:hover {
		background: var(--surface-active);
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
		min-width: 170px;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		padding: var(--space-1);
	}
	.menu.up {
		top: auto;
		bottom: calc(100% + 4px);
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
	.menu-trail {
		margin-left: auto;
		display: inline-flex;
		color: var(--text-faint);
	}
	.menu-back {
		color: var(--text-muted);
		font-weight: var(--weight-medium);
	}
	.menu-list {
		max-height: 280px;
		overflow-y: auto;
	}
	.menu-check {
		width: 14px;
		flex-shrink: 0;
		display: inline-flex;
		color: var(--accent-text);
	}
	.menu-item.on {
		font-weight: var(--weight-medium);
	}
	.swatch {
		width: 8px;
		height: 8px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background: var(--c);
	}
	.menu-empty {
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
		color: var(--text-faint);
	}
	.menu input {
		display: block;
		width: calc(100% - var(--space-4));
		margin: var(--space-1) var(--space-2);
		font: inherit;
		font-size: var(--text-sm);
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		padding: var(--space-1) var(--space-2);
	}
	.menu input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.menu input.new-tag {
		border-style: dashed;
	}
</style>
