<script lang="ts">
	import Icon, { type IconName } from '#lib/components/ui/Icon.svelte';
	import DateField from '#lib/components/ui/DateField.svelte';
	import {
		URGENCIES,
		SIZES,
		URGENCY_META,
		SIZE_META,
		type Category,
		type Member,
		type Tag
	} from '#lib/types';

	export interface TaskDefaults {
		categoryId: string | null;
		assigneeId: string | null;
		deadline: string | null;
		urgency: string | null;
		size: string | null;
		tagIds: string[];
	}

	interface Props {
		value: TaskDefaults;
		onChange: (value: TaskDefaults) => void;
		members?: Member[];
		categories?: Category[];
		projectTags?: Tag[];
		onCreateTag?: (name: string) => Promise<Tag | null>;
		onCreateCategory?: (name: string) => Promise<Category | null>;
	}
	let {
		value,
		onChange,
		members = [],
		categories = [],
		projectTags = [],
		onCreateTag,
		onCreateCategory
	}: Props = $props();

	type Field = 'deadline' | 'assignee' | 'urgency' | 'size' | 'category' | 'tags';
	const FIELDS: { key: Field; label: string; icon: IconName }[] = [
		{ key: 'deadline', label: 'Deadline', icon: 'calendar' },
		{ key: 'assignee', label: 'Assignee', icon: 'user' },
		{ key: 'urgency', label: 'Urgency', icon: 'flag' },
		{ key: 'size', label: 'Size', icon: 'inbox' },
		{ key: 'category', label: 'Category', icon: 'folder' },
		{ key: 'tags', label: 'Tags', icon: 'tag' }
	];

	let menuOpen = $state(false);
	let submenu = $state<Field | null>(null);
	let newTagName = $state('');
	let newCategoryName = $state('');
	let host = $state<HTMLElement>();

	const activeCount = $derived(
		(value.categoryId ? 1 : 0) +
			(value.assigneeId ? 1 : 0) +
			(value.deadline ? 1 : 0) +
			(value.urgency ? 1 : 0) +
			(value.size ? 1 : 0) +
			value.tagIds.length
	);
	function set(patch: Partial<TaskDefaults>) {
		onChange({ ...value, ...patch });
	}
	function toggleTag(tagId: string) {
		set({ tagIds: value.tagIds.includes(tagId) ? value.tagIds.filter((id) => id !== tagId) : [...value.tagIds, tagId] });
	}
	async function addNewTag() {
		const name = newTagName.trim();
		if (!name || !onCreateTag) return;
		newTagName = '';
		const tag = await onCreateTag(name);
		if (tag) set({ tagIds: [...value.tagIds, tag.id] });
	}
	async function addNewCategory() {
		const name = newCategoryName.trim();
		if (!name || !onCreateCategory) return;
		newCategoryName = '';
		const cat = await onCreateCategory(name);
		if (cat) set({ categoryId: cat.id });
	}
	function toggleMenu() {
		menuOpen = !menuOpen;
		submenu = null;
	}
	function closeMenu() {
		menuOpen = false;
		submenu = null;
	}
	function clearAll() {
		onChange({ categoryId: null, assigneeId: null, deadline: null, urgency: null, size: null, tagIds: [] });
	}
	function onWindowPointerDown(e: PointerEvent) {
		if (menuOpen && !host?.contains(e.target as Node)) closeMenu();
	}
</script>

<svelte:window
	onpointerdown={onWindowPointerDown}
	onkeydown={(e) => e.key === 'Escape' && menuOpen && (submenu ? (submenu = null) : closeMenu())}
/>

{#snippet option(label: string, on: boolean, pick: () => void, color?: string)}
	<button class="menu-item" class:on onclick={pick}>
		<span class="menu-check">{#if on}<Icon name="check" size={14} strokeWidth={2.5} />{/if}</span>
		{#if color}<span class="swatch" style="--c: {color}"></span>{/if}
		<span class="truncate">{label}</span>
	</button>
{/snippet}

<div class="defaults" bind:this={host}>
	<button
		class="trigger"
		class:active={activeCount > 0}
		onclick={toggleMenu}
		aria-expanded={menuOpen}
		title="Defaults for new tasks"
	>
		<Icon name="sliders" size={15} />
		{#if activeCount}<span class="count">{activeCount}</span>{/if}
	</button>

	{#if menuOpen}
		<div class="menu">
			{#if submenu}
				{@const meta = FIELDS.find((m) => m.key === submenu)!}
				<button class="menu-item menu-back" onclick={() => (submenu = null)}>
					<Icon name="chevron-left" size={14} />
					{meta.label}
				</button>
				<hr />
				<div class="menu-list">
					{#if submenu === 'deadline'}
						<DateField
							inline
							clearable={false}
							value={value.deadline}
							aria-label="Pick a date"
							onvalue={(v) => set({ deadline: v })}
						/>
						{#if value.deadline}
							<hr />
							<button class="menu-item danger" onclick={() => set({ deadline: null })}>
								<Icon name="x" size={15} /> Clear deadline
							</button>
						{/if}
					{:else if submenu === 'assignee'}
						{@render option('Unassigned', !value.assigneeId, () => set({ assigneeId: null }))}
						{#each members as m (m.userId)}
							{@render option(m.name || m.email, value.assigneeId === m.userId, () => set({ assigneeId: m.userId }))}
						{/each}
					{:else if submenu === 'urgency'}
						{@render option('None', !value.urgency, () => set({ urgency: null }))}
						{#each URGENCIES as u (u)}
							{@render option(URGENCY_META[u].label, value.urgency === u, () => set({ urgency: u }), URGENCY_META[u].color)}
						{/each}
					{:else if submenu === 'size'}
						{@render option('None', !value.size, () => set({ size: null }))}
						{#each SIZES as sz (sz)}
							{@render option(SIZE_META[sz].full, value.size === sz, () => set({ size: sz }))}
						{/each}
					{:else if submenu === 'category'}
						{@render option('No category', !value.categoryId, () => set({ categoryId: null }))}
						{#each categories as c (c.id)}
							{@render option(c.name, value.categoryId === c.id, () => set({ categoryId: c.id }), c.color)}
						{/each}
						{#if onCreateCategory}
							<form
								onsubmit={(e) => {
									e.preventDefault();
									addNewCategory();
								}}
							>
								<input class="new-item" bind:value={newCategoryName} placeholder="+ new category" maxlength="60" />
							</form>
						{/if}
					{:else if submenu === 'tags'}
						{#each projectTags as tag (tag.id)}
							{@render option(tag.name, value.tagIds.includes(tag.id), () => toggleTag(tag.id), tag.color)}
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
								<input class="new-item" bind:value={newTagName} placeholder="+ new tag" maxlength="60" />
							</form>
						{/if}
					{/if}
				</div>
			{:else}
				{#each FIELDS as f (f.key)}
					<button class="menu-item" onclick={() => (submenu = f.key)}>
						<Icon name={f.icon} size={15} />
						{f.label}
						<span class="menu-trail"><Icon name="chevron-right" size={14} /></span>
					</button>
				{/each}
				{#if activeCount}
					<hr />
					<button class="menu-item danger" onclick={clearAll}>
						<Icon name="x" size={15} /> Clear all defaults
					</button>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.defaults {
		position: relative;
		display: flex;
		align-items: center;
	}
	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 5px;
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
		transition: all var(--transition-fast);
	}
	.trigger:hover {
		background: var(--surface-active);
		color: var(--text);
	}
	.trigger.active {
		color: var(--accent-text);
		background: var(--accent-soft);
	}
	.count {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
	}
	.menu {
		position: absolute;
		top: calc(100% + 6px);
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
	.menu input.new-item {
		border-style: dashed;
	}
</style>
