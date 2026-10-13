<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import { deadlineInfo } from '#lib/date';
	import { markdownExcerpt } from '#lib/markdown';
	import { URGENCY_META, SIZE_META, type Todo } from '#lib/types';

	interface Props {
		todo: Todo;
		canEdit: boolean;
		onToggle: (id: string) => void;
		onOpen: (todo: Todo) => void;
		onCopy: (todo: Todo) => void;
		onDelete: (id: string) => void;
		/** Selection mode: clicking the row selects instead of opening. */
		selecting?: boolean;
		selected?: boolean;
		onSelect?: (id: string, e: MouseEvent) => void;
	}
	let {
		todo,
		canEdit,
		onToggle,
		onOpen,
		onCopy,
		onDelete,
		selecting = false,
		selected = false,
		onSelect
	}: Props = $props();

	function onBodyClick(e: MouseEvent) {
		// Cmd/Ctrl/Shift-click starts (or extends) a selection without a mode switch.
		if (onSelect && (selecting || e.metaKey || e.ctrlKey || e.shiftKey)) {
			e.preventDefault();
			onSelect(todo.id, e);
		} else onOpen(todo);
	}

	const deadline = $derived(deadlineInfo(todo.deadline));
	const excerpt = $derived(markdownExcerpt(todo.description, 90));
	let menuOpen = $state(false);
</script>

<div class="row" class:done={todo.completed} class:selected>
	{#if selecting}
		<button
			class="select"
			class:on={selected}
			onclick={(e) => onSelect?.(todo.id, e)}
			aria-label={selected ? 'Deselect task' : 'Select task'}
			aria-pressed={selected}
		>
			{#if selected}<Icon name="check" size={12} strokeWidth={3} />{/if}
		</button>
	{/if}
	<button
		class="check"
		class:on={todo.completed}
		disabled={!canEdit}
		onclick={() => onToggle(todo.id)}
		aria-label={todo.completed ? 'Mark as not done' : 'Mark as done'}
		aria-pressed={todo.completed}
	>
		{#if todo.completed}<Icon name="check" size={13} strokeWidth={3} />{/if}
	</button>

	<button
		class="body"
		onclick={onBodyClick}
		onmousedown={(e) => e.shiftKey && onSelect && e.preventDefault()}
	>
		<div class="title-line">
			{#if todo.urgency && !todo.completed}
				<span
					class="urgency-dot"
					style="--u: {URGENCY_META[todo.urgency].color}"
					title="{URGENCY_META[todo.urgency].label} urgency"
				></span>
			{/if}
			<span class="title">{todo.title}</span>
		</div>

		{#if excerpt || todo.category || todo.tags.length || deadline || todo.size || todo.assignee || todo.description || todo.attachments.length}
			<div class="meta">
				{#if todo.category}
					<span class="chip" style="--c: {todo.category.color}">
						<span class="dot"></span>{todo.category.name}
					</span>
				{/if}
				{#each todo.tags as tag (tag.id)}
					<span class="tag" style="--c: {tag.color}">{tag.name}</span>
				{/each}
				{#if deadline}
					<span class="chip deadline {deadline.state}">
						<Icon name="calendar" size={12} />{deadline.label}
					</span>
				{/if}
				{#if todo.size}
					<span class="chip size" title={SIZE_META[todo.size].full}>{SIZE_META[todo.size].label}</span>
				{/if}
				{#if todo.description}
					<span class="chip ghost" title="Has notes"><Icon name="clipboard" size={12} /></span>
				{/if}
				{#if todo.attachments.length}
					<span class="chip ghost" title="{todo.attachments.length} image(s)">
						<Icon name="image" size={12} />{todo.attachments.length}
					</span>
				{/if}
				{#if excerpt}
					<span class="excerpt truncate">{excerpt}</span>
				{/if}
			</div>
		{/if}
	</button>

	<div class="right">
		{#if todo.assignee}
			<Avatar name={todo.assignee.name} image={todo.assignee.image} size={22} />
		{/if}
		<div class="actions">
			<button class="act" title="Copy for AI" onclick={() => onCopy(todo)} aria-label="Copy task">
				<Icon name="copy" size={15} />
			</button>
			{#if canEdit}
				<div class="menu-host">
					<button
						class="act"
						title="More"
						aria-label="More actions"
						onclick={() => (menuOpen = !menuOpen)}
					>
						<Icon name="more-horizontal" size={15} />
					</button>
					{#if menuOpen}
						<button class="menu-scrim" aria-label="Close" onclick={() => (menuOpen = false)}></button>
						<div class="menu">
							<button
								class="menu-item"
								onclick={() => {
									menuOpen = false;
									onOpen(todo);
								}}
							>
								<Icon name="pencil" size={15} /> Edit
							</button>
							<button
								class="menu-item"
								onclick={() => {
									menuOpen = false;
									onCopy(todo);
								}}
							>
								<Icon name="copy" size={15} /> Copy for AI
							</button>
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
	}
	.row:hover {
		background: var(--surface-hover);
	}
	.row.selected {
		background: var(--accent-soft);
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
	}
	.done .title {
		color: var(--text-subtle);
		text-decoration: line-through;
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
	.excerpt {
		color: var(--text-faint);
		max-width: 320px;
	}

	.right {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 2px;
		opacity: 0;
		transition: opacity var(--transition-fast);
	}
	.row:hover .actions,
	.actions:focus-within {
		opacity: 1;
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
</style>
