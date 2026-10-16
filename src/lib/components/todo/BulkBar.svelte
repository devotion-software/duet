<script lang="ts">
	import { fly } from 'svelte/transition';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { Copied } from '#lib/copied.svelte';
	import { toDateInput } from '#lib/date';
	import {
		URGENCIES,
		SIZES,
		URGENCY_META,
		SIZE_META,
		isInProgress,
		type Todo,
		type Tag,
		type Category,
		type Member
	} from '#lib/types';
	import type { BulkPatchInput } from '#lib/stores/todos.svelte';

	interface Props {
		selected: Todo[];
		totalVisible: number;
		members: Member[];
		categories: Category[];
		tags: Tag[];
		onApply: (patch: BulkPatchInput) => Promise<boolean>;
		onDelete: () => Promise<boolean>;
		onCopy: () => Promise<boolean>;
		onCopyForAI: () => Promise<boolean>;
		onSelectAll: () => void;
		onClear: () => void;
		onCreateTag: (name: string) => Promise<Tag | null>;
		onCreateCategory: (name: string) => Promise<Category | null>;
	}
	let {
		selected,
		totalVisible,
		members,
		categories,
		tags,
		onApply,
		onDelete,
		onCopy,
		onCopyForAI,
		onSelectAll,
		onClear,
		onCreateTag,
		onCreateCategory
	}: Props = $props();

	let busy = $state(false);
	const copied = new Copied<'list' | 'ai'>();
	let popover = $state<'category' | 'deadline' | 'tags' | null>(null);
	let newTagName = $state('');
	let newCatName = $state('');

	async function apply(patch: BulkPatchInput) {
		busy = true;
		await onApply(patch);
		busy = false;
	}
	// If everything selected is already done, the action reopens instead.
	const allDone = $derived(selected.length > 0 && selected.every((t) => t.completed));
	// Likewise, if everything selected is already in progress, the action stops it.
	const allStarted = $derived(selected.length > 0 && selected.every(isInProgress));

	async function deleteSelected() {
		const n = selected.length;
		if (!confirm(`Delete ${n} task${n === 1 ? '' : 's'}? You can restore them from project settings.`)) return;
		busy = true;
		if (await onDelete()) onClear();
		busy = false;
	}

	// Shared category of the selection, if they all agree (null = none).
	const commonCategoryId = $derived.by(() => {
		const ids = new Set(selected.map((t) => t.categoryId ?? null));
		return ids.size === 1 ? [...ids][0] : undefined;
	});
	function setCategory(categoryId: string | null) {
		popover = null;
		apply({ categoryId });
	}
	async function addNewCategory() {
		const name = newCatName.trim();
		if (!name) return;
		newCatName = '';
		const cat = await onCreateCategory(name);
		if (cat) setCategory(cat.id);
	}

	function setDeadline(value: string | null) {
		popover = null;
		apply({ deadline: value });
	}
	function inDays(n: number) {
		const d = new Date();
		d.setDate(d.getDate() + n);
		return toDateInput(d);
	}

	/** How many of the selected todos carry each tag. */
	const tagCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const t of selected) for (const tag of t.tags) counts.set(tag.id, (counts.get(tag.id) ?? 0) + 1);
		return counts;
	});
	function toggleTag(tagId: string) {
		// All selected have it → remove; otherwise make sure they all do.
		if (tagCounts.get(tagId) === selected.length) apply({ removeTagIds: [tagId] });
		else apply({ addTagIds: [tagId] });
	}
	async function addNewTag() {
		const name = newTagName.trim();
		if (!name) return;
		newTagName = '';
		const tag = await onCreateTag(name);
		if (tag) apply({ addTagIds: [tag.id] });
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (popover) popover = null;
		else onClear();
	}
</script>

<svelte:window {onkeydown} />

<div class="bulk" role="toolbar" aria-label="Bulk edit selected tasks" transition:fly={{ y: 24, duration: 180 }}>
	<div class="count">
		{#if busy}<Spinner size={14} />{/if}
		<strong>{selected.length}</strong> selected
	</div>

	<div class="controls">
		<div class="pop-host">
			<button
				class="ctl"
				class:on={popover === 'category'}
				disabled={busy}
				onclick={() => (popover = popover === 'category' ? null : 'category')}
			>
				<Icon name="folder" size={14} /> Category
			</button>
			{#if popover === 'category'}
				<button class="scrim" aria-label="Close" onclick={() => (popover = null)}></button>
				<div class="pop">
					{#each categories as c (c.id)}
						<button class="pop-item" disabled={busy} onclick={() => setCategory(c.id)}>
							<span class="swatch" style="--c: {c.color}"></span>
							<span class="truncate">{c.name}</span>
							{#if commonCategoryId === c.id}<span class="tick"><Icon name="check" size={13} /></span>{/if}
						</button>
					{:else}
						<p class="pop-empty">No categories yet.</p>
					{/each}
					<form
						onsubmit={(e) => {
							e.preventDefault();
							addNewCategory();
						}}
					>
						<input bind:value={newCatName} placeholder="+ new category" maxlength="80" />
					</form>
					{#if categories.length}
						<hr />
						<button class="pop-item danger" disabled={busy} onclick={() => setCategory(null)}>
							<Icon name="x" size={14} /> Clear category
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<Select
			icon="user"
			variant="ghost"
			placement="top"
			momentary
			disabled={busy}
			placeholder="Assignee"
			aria-label="Set assignee"
			options={[{ value: '', label: 'Unassigned' }, ...members.map((m) => ({ value: m.userId, label: m.name || m.email }))]}
			onvalue={(v) => apply({ assigneeId: v || null })}
		/>

		<div class="pop-host">
			<button
				class="ctl"
				class:on={popover === 'deadline'}
				disabled={busy}
				onclick={() => (popover = popover === 'deadline' ? null : 'deadline')}
			>
				<Icon name="calendar" size={14} /> Deadline
			</button>
			{#if popover === 'deadline'}
				<button class="scrim" aria-label="Close" onclick={() => (popover = null)}></button>
				<div class="pop">
					<button class="pop-item" onclick={() => setDeadline(inDays(0))}>Today</button>
					<button class="pop-item" onclick={() => setDeadline(inDays(1))}>Tomorrow</button>
					<button class="pop-item" onclick={() => setDeadline(inDays(7))}>In a week</button>
					<input
						type="date"
						aria-label="Pick a date"
						onchange={(e) => e.currentTarget.value && setDeadline(e.currentTarget.value)}
					/>
					<hr />
					<button class="pop-item danger" onclick={() => setDeadline(null)}>
						<Icon name="x" size={14} /> Clear deadline
					</button>
				</div>
			{/if}
		</div>

		<Select
			icon="flag"
			variant="ghost"
			placement="top"
			momentary
			disabled={busy}
			placeholder="Urgency"
			aria-label="Set urgency"
			options={[{ value: '', label: 'None' }, ...URGENCIES.map((u) => ({ value: u, label: URGENCY_META[u].label }))]}
			onvalue={(v) => apply({ urgency: v || null })}
		/>

		<Select
			icon="inbox"
			variant="ghost"
			placement="top"
			momentary
			disabled={busy}
			placeholder="Size"
			aria-label="Set size"
			options={[{ value: '', label: 'None' }, ...SIZES.map((s) => ({ value: s, label: SIZE_META[s].full }))]}
			onvalue={(v) => apply({ size: v || null })}
		/>

		<div class="pop-host">
			<button
				class="ctl"
				class:on={popover === 'tags'}
				disabled={busy}
				onclick={() => (popover = popover === 'tags' ? null : 'tags')}
			>
				<Icon name="tag" size={14} /> Tags
			</button>
			{#if popover === 'tags'}
				<button class="scrim" aria-label="Close" onclick={() => (popover = null)}></button>
				<div class="pop tags">
					{#each tags as tag (tag.id)}
						{@const n = tagCounts.get(tag.id) ?? 0}
						<button
							class="pop-item"
							disabled={busy}
							onclick={() => toggleTag(tag.id)}
							title={n === selected.length ? 'Remove from all selected' : 'Add to all selected'}
						>
							<span class="box" class:all={n === selected.length} class:some={n > 0 && n < selected.length}>
								{#if n === selected.length}<Icon name="check" size={11} strokeWidth={3} />{/if}
							</span>
							<span class="swatch" style="--c: {tag.color}"></span>
							<span class="truncate">{tag.name}</span>
						</button>
					{:else}
						<p class="pop-empty">No tags yet.</p>
					{/each}
					<form
						onsubmit={(e) => {
							e.preventDefault();
							addNewTag();
						}}
					>
						<input bind:value={newTagName} placeholder="+ new tag" maxlength="60" />
					</form>
				</div>
			{/if}
		</div>
	</div>

	<div class="actions">
		<button
			class="ctl"
			disabled={busy}
			title="Copy selected as checklist"
			onclick={async () => (await onCopy()) && copied.mark('list')}
		>
			<Icon name={copied.icon('list')} size={14} /> Copy
		</button>
		<button
			class="ctl"
			disabled={busy}
			title="Copy all selected as one doc for AI"
			onclick={async () => (await onCopyForAI()) && copied.mark('ai')}
		>
			<Icon name={copied.icon('ai')} size={14} /> Copy for AI
		</button>
		<button class="ctl" disabled={busy} onclick={() => apply({ inProgress: !allStarted })}>
			<Icon name="clock" size={14} />
			{allStarted ? 'Stop' : 'Start'}
		</button>
		<button class="ctl" disabled={busy} onclick={() => apply({ completed: !allDone })}>
			<Icon name={allDone ? 'circle' : 'check-circle'} size={14} />
			{allDone ? 'Reopen' : 'Complete'}
		</button>
		{#if !allDone}
			<button class="ctl" disabled={busy} onclick={() => apply({ completed: true, notDoing: true })}>
				<Icon name="ban" size={14} /> Not doing
			</button>
		{/if}
		<button class="ctl danger" disabled={busy} onclick={deleteSelected}>
			<Icon name="trash" size={14} /> Delete
		</button>
	</div>

	<div class="end">
		{#if selected.length < totalVisible}
			<button class="link" onclick={onSelectAll}>Select all</button>
		{/if}
		<button class="close" aria-label="Clear selection" title="Clear selection (Esc)" onclick={onClear}>
			<Icon name="x" size={16} />
		</button>
	</div>
</div>

<style>
	.bulk {
		position: fixed;
		left: 0;
		right: 0;
		bottom: var(--space-5);
		width: fit-content;
		margin-inline: auto;
		z-index: var(--z-dropdown);
		display: flex;
		align-items: center;
		gap: var(--space-3);
		max-width: calc(100vw - var(--space-6));
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-xl);
		font-size: var(--text-sm);
	}
	.count {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		white-space: nowrap;
	}
	.count strong {
		color: var(--text);
	}
	.controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-1);
		padding-left: var(--space-3);
		border-left: 1px solid var(--border-subtle);
	}
	.ctl {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		transition: all var(--transition-fast);
	}
	.ctl:hover:not(:disabled),
	.ctl:focus-within,
	.ctl.on {
		background: var(--surface-hover);
		color: var(--text);
	}
	.ctl.danger {
		color: var(--danger);
	}
	.ctl.danger:hover:not(:disabled) {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding-left: var(--space-3);
		border-left: 1px solid var(--border-subtle);
	}
	.end {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding-left: var(--space-2);
		border-left: 1px solid var(--border-subtle);
	}
	.link {
		padding: 0 var(--space-2);
		height: 30px;
		color: var(--accent-text);
		font-weight: var(--weight-medium);
		white-space: nowrap;
		border-radius: var(--radius-sm);
	}
	.link:hover {
		background: var(--accent-soft);
	}
	.close {
		display: inline-flex;
		padding: 7px;
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
	}
	.close:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.pop-host {
		position: relative;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 1;
		cursor: default;
	}
	.pop {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 0;
		z-index: 2;
		min-width: 190px;
		max-height: 320px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1px;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		padding: var(--space-1);
	}
	.pop hr {
		margin: var(--space-1) 0;
		border-color: var(--border-subtle);
	}
	.pop-item {
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
	.pop-item:hover:not(:disabled) {
		background: var(--surface-hover);
	}
	.pop-item.danger {
		color: var(--danger);
	}
	.pop input {
		margin: var(--space-1) var(--space-2);
		font: inherit;
		font-size: var(--text-sm);
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		padding: var(--space-1) var(--space-2);
	}
	.pop input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.pop form input {
		width: calc(100% - var(--space-4));
		border-style: dashed;
	}
	.tick {
		display: inline-flex;
		margin-left: auto;
		color: var(--accent-text);
	}
	.pop-empty {
		padding: var(--space-2) var(--space-3);
		color: var(--text-faint);
	}
	.box {
		display: grid;
		place-items: center;
		width: 15px;
		height: 15px;
		flex-shrink: 0;
		border: 1.5px solid var(--border-strong);
		border-radius: 4px;
		color: var(--accent-contrast);
	}
	.box.all {
		background: var(--accent);
		border-color: var(--accent);
	}
	.box.some::after {
		content: '';
		width: 7px;
		height: 2px;
		border-radius: 1px;
		background: var(--accent);
	}
	.swatch {
		width: 8px;
		height: 8px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background: var(--c);
	}

	@media (max-width: 640px) {
		.bulk {
			left: var(--space-3);
			right: var(--space-3);
			width: auto;
			margin-inline: 0;
			flex-wrap: wrap;
		}
		.controls,
		.actions {
			order: 3;
			width: 100%;
			padding-left: 0;
			border-left: none;
		}
		.end {
			margin-left: auto;
		}
	}
</style>
