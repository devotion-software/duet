<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import Markdown from '#lib/components/Markdown.svelte';
	import SubtaskAdd from '#lib/components/todo/SubtaskAdd.svelte';
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
	import type { NewTodoInput } from '#lib/stores/todos.svelte';

	interface Props {
		todo: Todo;
		canEdit: boolean;
		members: Member[];
		categories: Category[];
		tags: Tag[];
		onUpdate: (patch: Partial<NewTodoInput>) => void;
		onToggle: (id: string) => void;
		onSetInProgress: (id: string, inProgress: boolean) => void;
		onDelete: (id: string) => void;
		onCopy: (todo: Todo) => void;
		onClose: () => void;
		onCreateTag: (name: string) => Promise<Tag | null>;
		onCreateCategory: (name: string) => Promise<Category | null>;
		onAddAttachment: (file: File) => Promise<void>;
		onRemoveAttachment: (id: string) => void;
		/** Parent chain, nearest first. */
		ancestors: Todo[];
		/** Direct subtasks, in display order. */
		subtasks: Todo[];
		/** Tasks this one may move under (excludes itself and its subtree). */
		parentOptions: { todo: Todo; depth: number }[];
		onOpenTask: (id: string) => void;
		onAddSubtask: (title: string) => Promise<unknown>;
	}
	let {
		todo,
		canEdit,
		members,
		categories,
		tags,
		onUpdate,
		onToggle,
		onSetInProgress,
		onDelete,
		onCopy,
		onClose,
		onCreateTag,
		onCreateCategory,
		onAddAttachment,
		onRemoveAttachment,
		ancestors,
		subtasks,
		parentOptions,
		onOpenTask,
		onAddSubtask
	}: Props = $props();

	const inProgress = $derived(isInProgress(todo));
	const subtasksDone = $derived(subtasks.filter((t) => t.completed).length);
	function optionLabel(t: Todo, depth: number) {
		const title = t.title.length > 60 ? `${t.title.slice(0, 59)}…` : t.title;
		return `${'\u00a0\u00a0\u00a0'.repeat(depth)}${depth ? '↳ ' : ''}${title}`;
	}

	let title = $state(todo.title);
	let description = $state(todo.description ?? '');
	let descMode = $state<'write' | 'preview'>('write');
	let titleEl = $state<HTMLTextAreaElement | undefined>();

	// Keep the title textarea sized to its content (incl. programmatic changes).
	$effect(() => {
		void title;
		if (titleEl) {
			titleEl.style.height = 'auto';
			titleEl.style.height = `${titleEl.scrollHeight}px`;
		}
	});
	let newTagName = $state('');
	let newCatName = $state('');

	// Re-seed editable fields when switching to a different todo.
	let lastId = $state(todo.id);
	$effect(() => {
		if (todo.id !== lastId) {
			lastId = todo.id;
			title = todo.title;
			description = todo.description ?? '';
			descMode = 'write';
		}
	});

	const selectedTagIds = $derived(new Set(todo.tags.map((t) => t.id)));

	function saveTitle() {
		const t = title.trim();
		if (t && t !== todo.title) onUpdate({ title: t });
		else title = todo.title;
	}
	function saveDescription() {
		if (description !== (todo.description ?? '')) onUpdate({ description });
	}
	function toggleTag(tagId: string) {
		const next = new Set(selectedTagIds);
		if (next.has(tagId)) next.delete(tagId);
		else next.add(tagId);
		onUpdate({ tagIds: [...next] });
	}
	async function addTag() {
		const name = newTagName.trim();
		if (!name) return;
		const tag = await onCreateTag(name);
		newTagName = '';
		if (tag) onUpdate({ tagIds: [...selectedTagIds, tag.id] });
	}
	async function addCategory() {
		const name = newCatName.trim();
		if (!name) return;
		const cat = await onCreateCategory(name);
		newCatName = '';
		if (cat) onUpdate({ categoryId: cat.id });
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	// ── Image attachments ──
	let uploading = $state(false);
	let dragging = $state(false);

	async function uploadFiles(files: Iterable<File>) {
		const images = [...files].filter((f) => f.type.startsWith('image/'));
		if (!images.length) return;
		uploading = true;
		for (const file of images) await onAddAttachment(file);
		uploading = false;
	}
	function onFileInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		if (input.files) uploadFiles(input.files);
		input.value = '';
	}
	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		if (!canEdit) return;
		if (e.dataTransfer?.files) uploadFiles(e.dataTransfer.files);
	}
	function onPaste(e: ClipboardEvent) {
		if (!canEdit || !e.clipboardData) return;
		const files = [...e.clipboardData.items]
			.filter((i) => i.kind === 'file')
			.map((i) => i.getAsFile())
			.filter((f): f is File => !!f);
		if (files.length) uploadFiles(files);
	}
</script>

<svelte:window on:keydown={onkeydown} />

<div class="panel-overlay" transition:fade={{ duration: 150 }}>
	<button class="panel-scrim" aria-label="Close" onclick={onClose}></button>
	<aside
		class="panel"
		transition:fly={{ x: 420, duration: 240 }}
		aria-label="Task details"
		onpaste={onPaste}
	>
		<header class="panel-head">
			<div class="status">
				<button
					class="check"
					class:on={todo.completed}
					disabled={!canEdit}
					onclick={() => onToggle(todo.id)}
					aria-label="Toggle complete"
				>
					{#if todo.completed}<Icon name="check" size={13} strokeWidth={3} />{/if}
					<span>{todo.completed ? 'Completed' : 'Mark done'}</span>
				</button>
				{#if !todo.completed}
					<button
						class="check progress"
						class:on={inProgress}
						disabled={!canEdit}
						onclick={() => onSetInProgress(todo.id, !inProgress)}
						aria-pressed={inProgress}
						title={inProgress ? 'Stop progress' : 'Mark as in progress'}
					>
						<Icon name="clock" size={13} />
						<span>{inProgress ? 'In progress' : 'Start'}</span>
					</button>
				{/if}
			</div>
			<div class="head-actions">
				<button class="icon-act" title="Copy for AI" onclick={() => onCopy(todo)}>
					<Icon name="copy" size={17} />
				</button>
				{#if canEdit}
					<button class="icon-act danger" title="Delete" onclick={() => onDelete(todo.id)}>
						<Icon name="trash" size={17} />
					</button>
				{/if}
				<button class="icon-act" title="Close" onclick={onClose}>
					<Icon name="x" size={18} />
				</button>
			</div>
		</header>

		<div class="panel-body">
			{#if ancestors.length}
				<nav class="crumbs" aria-label="Parent tasks">
					{#each [...ancestors].reverse() as a, i (a.id)}
						{#if i}<Icon name="chevron-right" size={12} />{/if}
						<button class="crumb" class:done={a.completed} onclick={() => onOpenTask(a.id)}>
							{a.title}
						</button>
					{/each}
				</nav>
			{/if}
			<textarea
				class="title-input"
				bind:this={titleEl}
				bind:value={title}
				onblur={saveTitle}
				rows="1"
				readonly={!canEdit}
				placeholder="Task title"
			></textarea>

			<!-- Attributes grid -->
			<div class="attrs">
				<label class="attr">
					<span class="attr-label"><Icon name="folder" size={14} /> Category</span>
					<select
						disabled={!canEdit}
						value={todo.categoryId ?? ''}
						onchange={(e) => onUpdate({ categoryId: e.currentTarget.value || null })}
					>
						<option value="">None</option>
						{#each categories as c (c.id)}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
				</label>

				<label class="attr">
					<span class="attr-label"><Icon name="corner-down-right" size={14} /> Parent</span>
					<select
						disabled={!canEdit}
						value={todo.parentId ?? ''}
						onchange={(e) => onUpdate({ parentId: e.currentTarget.value || null })}
					>
						<option value="">None (top level)</option>
						{#each parentOptions as { todo: t, depth } (t.id)}
							<option value={t.id}>{optionLabel(t, depth)}</option>
						{/each}
					</select>
				</label>

				<label class="attr">
					<span class="attr-label"><Icon name="user" size={14} /> Assignee</span>
					<select
						disabled={!canEdit}
						value={todo.assigneeId ?? ''}
						onchange={(e) => onUpdate({ assigneeId: e.currentTarget.value || null })}
					>
						<option value="">Unassigned</option>
						{#each members as m (m.userId)}
							<option value={m.userId}>{m.name || m.email}</option>
						{/each}
					</select>
				</label>

				<label class="attr">
					<span class="attr-label"><Icon name="calendar" size={14} /> Deadline</span>
					<input
						type="date"
						disabled={!canEdit}
						value={toDateInput(todo.deadline)}
						onchange={(e) => onUpdate({ deadline: e.currentTarget.value || null })}
					/>
				</label>

				<label class="attr">
					<span class="attr-label"><Icon name="flag" size={14} /> Urgency</span>
					<select
						disabled={!canEdit}
						value={todo.urgency ?? ''}
						onchange={(e) => onUpdate({ urgency: e.currentTarget.value || null })}
					>
						<option value="">None</option>
						{#each URGENCIES as u (u)}
							<option value={u}>{URGENCY_META[u].label}</option>
						{/each}
					</select>
				</label>

				<label class="attr">
					<span class="attr-label"><Icon name="inbox" size={14} /> Size</span>
					<select
						disabled={!canEdit}
						value={todo.size ?? ''}
						onchange={(e) => onUpdate({ size: e.currentTarget.value || null })}
					>
						<option value="">None</option>
						{#each SIZES as s (s)}
							<option value={s}>{SIZE_META[s].full}</option>
						{/each}
					</select>
				</label>
			</div>

			<!-- Tags -->
			<div class="section">
				<span class="section-label"><Icon name="tag" size={14} /> Tags</span>
				<div class="tag-list">
					{#each tags as tag (tag.id)}
						<button
							class="tag-chip"
							class:on={selectedTagIds.has(tag.id)}
							style="--c: {tag.color}"
							disabled={!canEdit}
							onclick={() => toggleTag(tag.id)}
						>
							{tag.name}
						</button>
					{/each}
					{#if canEdit}
						<form
							class="add-inline"
							onsubmit={(e) => {
								e.preventDefault();
								addTag();
							}}
						>
							<input bind:value={newTagName} placeholder="+ tag" maxlength="60" />
						</form>
					{/if}
				</div>
			</div>

			{#if canEdit && categories.length === 0}
				<form
					class="add-inline standalone"
					onsubmit={(e) => {
						e.preventDefault();
						addCategory();
					}}
				>
					<input bind:value={newCatName} placeholder="+ add a category" maxlength="80" />
				</form>
			{/if}

			<!-- Subtasks -->
			{#if subtasks.length || canEdit}
				<div class="section">
					<div class="desc-head">
						<span class="section-label"><Icon name="check-circle" size={14} /> Subtasks</span>
						{#if subtasks.length}
							<span class="sub-count">{subtasksDone}/{subtasks.length}</span>
						{/if}
					</div>
					{#if subtasks.length}
						<div class="sub-progress" aria-hidden="true">
							<span style="width: {(subtasksDone / subtasks.length) * 100}%"></span>
						</div>
					{/if}
					<ul class="sub-list">
						{#each subtasks as sub (sub.id)}
							<li class="sub" class:done={sub.completed}>
								<button
									class="sub-check"
									class:on={sub.completed}
									disabled={!canEdit}
									onclick={() => onToggle(sub.id)}
									aria-label={sub.completed ? 'Mark as not done' : 'Mark as done'}
									aria-pressed={sub.completed}
								>
									{#if sub.completed}<Icon name="check" size={10} strokeWidth={3} />{/if}
								</button>
								<button class="sub-title" onclick={() => onOpenTask(sub.id)}>{sub.title}</button>
								<Icon name="chevron-right" size={14} />
							</li>
						{/each}
					</ul>
					{#if canEdit}
						<SubtaskAdd onAdd={onAddSubtask} />
					{/if}
				</div>
			{/if}

			<!-- Images -->
			<div class="section">
				<div class="desc-head">
					<span class="section-label"><Icon name="image" size={14} /> Images</span>
					{#if canEdit}
						<label class="upload-btn">
							<input type="file" accept="image/*" multiple onchange={onFileInput} hidden />
							{#if uploading}<Spinner size={13} />{:else}<Icon name="plus" size={13} />{/if}
							Add
						</label>
					{/if}
				</div>

				{#if todo.attachments.length}
					<div class="img-grid">
						{#each todo.attachments as att (att.id)}
							<div class="thumb">
								<a href={att.url} target="_blank" rel="noreferrer">
									<img src={att.url} alt={att.name ?? 'attachment'} loading="lazy" />
								</a>
								{#if canEdit}
									<button
										class="thumb-del"
										onclick={() => onRemoveAttachment(att.id)}
										aria-label="Remove image"
									>
										<Icon name="x" size={12} />
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				{#if canEdit}
					<div
						class="dropzone"
						class:dragging
						role="button"
						tabindex="0"
						ondragover={(e) => {
							e.preventDefault();
							dragging = true;
						}}
						ondragleave={() => (dragging = false)}
						ondrop={onDrop}
					>
						<Icon name="upload" size={16} />
						<span>Drag &amp; drop, paste, or use <strong>Add</strong></span>
					</div>
				{/if}
			</div>

			<!-- Description -->
			<div class="section">
				<div class="desc-head">
					<span class="section-label"><Icon name="clipboard" size={14} /> Notes</span>
					<div class="desc-tabs">
						<button class:on={descMode === 'write'} onclick={() => (descMode = 'write')}>Write</button>
						<button class:on={descMode === 'preview'} onclick={() => (descMode = 'preview')}>
							Preview
						</button>
					</div>
				</div>
				{#if descMode === 'write'}
					<textarea
						class="desc-input"
						bind:value={description}
						onblur={saveDescription}
						readonly={!canEdit}
						rows="8"
						placeholder="Add notes… markdown & ```code``` supported"
					></textarea>
				{:else}
					<div class="desc-preview">
						{#if description.trim()}
							<Markdown source={description} />
						{:else}
							<p class="empty-preview">Nothing to preview yet.</p>
						{/if}
					</div>
				{/if}
			</div>

			<div class="foot-meta">
				{#if todo.assignee}
					<span class="fm"><Avatar name={todo.assignee.name} image={todo.assignee.image} size={18} /> {todo.assignee.name}</span>
				{/if}
				<span class="fm">Created {todo.createdAt.toLocaleDateString()}</span>
			</div>

			<div class="copy-cta">
				<Button variant="subtle" icon="copy" full onclick={() => onCopy(todo)}>
					Copy whole task for AI
				</Button>
			</div>
		</div>
	</aside>
</div>

<style>
	.panel-overlay {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal);
		display: flex;
		justify-content: flex-end;
	}
	.panel-scrim {
		position: absolute;
		inset: 0;
		background: var(--overlay-bg);
		backdrop-filter: blur(2px);
		cursor: default;
	}
	.panel {
		position: relative;
		width: min(480px, 100vw);
		height: 100%;
		background: var(--surface);
		border-left: 1px solid var(--border);
		box-shadow: var(--shadow-xl);
		display: flex;
		flex-direction: column;
	}
	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text-muted);
	}
	.check.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-contrast);
	}
	.check.progress.on {
		background: var(--accent-soft);
		color: var(--accent-text);
	}
	.status {
		display: flex;
		gap: var(--space-2);
	}
	.head-actions {
		display: flex;
		gap: var(--space-1);
	}
	.icon-act {
		display: inline-flex;
		padding: 7px;
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
		transition: all var(--transition-fast);
	}
	.icon-act:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.icon-act.danger:hover {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.panel-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.crumbs {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 2px;
		margin-bottom: calc(var(--space-4) * -1);
		color: var(--text-faint);
		font-size: var(--text-xs);
	}
	.crumb {
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 2px var(--space-1);
		border-radius: var(--radius-xs);
		color: var(--text-subtle);
	}
	.crumb:hover {
		color: var(--text);
		background: var(--surface-hover);
	}
	.crumb.done {
		text-decoration: line-through;
	}
	.sub-count {
		font-size: var(--text-xs);
		color: var(--text-subtle);
		font-variant-numeric: tabular-nums;
	}
	.sub-progress {
		height: 3px;
		border-radius: var(--radius-full);
		background: var(--surface-inset);
		overflow: hidden;
	}
	.sub-progress span {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width var(--transition-fast);
	}
	.sub-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.sub {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-md);
		color: var(--text-faint);
	}
	.sub:hover {
		background: var(--surface-hover);
	}
	.sub-check {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		border: 1.6px solid var(--border-strong);
		display: grid;
		place-items: center;
		color: var(--accent-contrast);
	}
	.sub-check:hover:not(:disabled) {
		border-color: var(--accent);
	}
	.sub-check.on {
		background: var(--accent);
		border-color: var(--accent);
	}
	.sub-title {
		flex: 1;
		min-width: 0;
		text-align: left;
		font-size: var(--text-sm);
		color: var(--text);
		padding: var(--space-1) 0;
	}
	.sub.done .sub-title {
		color: var(--text-subtle);
		text-decoration: line-through;
	}
	.title-input {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		line-height: var(--leading-snug);
		color: var(--text);
		border: none;
		background: none;
		resize: none;
		overflow: hidden;
		width: 100%;
		min-height: 2em;
		flex-shrink: 0;
		letter-spacing: var(--tracking-tight);
	}
	.title-input:focus {
		outline: none;
	}
	.attrs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
	}
	.attr {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.attr-label,
	.section-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--text-subtle);
	}
	.attr select,
	.attr input,
	.desc-input {
		font: inherit;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-2);
		font-size: var(--text-sm);
		min-width: 0;
		max-width: 100%;
	}
	.attr select:focus,
	.attr input:focus,
	.desc-input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}
	.tag-chip {
		padding: 3px var(--space-3);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--text-muted);
		background: var(--surface-inset);
		border: 1px solid var(--border);
		transition: all var(--transition-fast);
	}
	.tag-chip:hover:not(:disabled) {
		border-color: var(--c);
	}
	.tag-chip.on {
		color: color-mix(in oklab, var(--c), var(--text) 25%);
		background: color-mix(in oklab, var(--c) 18%, var(--surface));
		border-color: color-mix(in oklab, var(--c) 40%, transparent);
	}
	.add-inline input {
		background: none;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-full);
		padding: 3px var(--space-3);
		font-size: var(--text-xs);
		color: var(--text);
		width: 90px;
	}
	.add-inline input:focus {
		outline: none;
		border-color: var(--accent);
		border-style: solid;
	}
	.add-inline.standalone input {
		width: 100%;
		border-radius: var(--radius-sm);
	}
	.desc-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.desc-tabs {
		display: inline-flex;
		background: var(--surface-inset);
		border-radius: var(--radius-sm);
		padding: 2px;
		gap: 2px;
	}
	.desc-tabs button {
		padding: 3px var(--space-3);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--text-muted);
		border-radius: var(--radius-xs);
	}
	.desc-tabs button.on {
		background: var(--surface-raised);
		color: var(--text);
		box-shadow: var(--shadow-xs);
	}
	.desc-input {
		width: 100%;
		resize: vertical;
		min-height: 160px;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
	}
	.desc-preview {
		min-height: 120px;
		padding: var(--space-3);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}
	.empty-preview {
		color: var(--text-faint);
		font-size: var(--text-sm);
	}
	.foot-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		color: var(--text-faint);
		font-size: var(--text-xs);
	}
	.fm {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.copy-cta {
		margin-top: auto;
		padding-top: var(--space-2);
	}

	/* Images */
	.upload-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px var(--space-2);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--accent-text);
		background: var(--accent-soft);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: background var(--transition-fast);
	}
	.upload-btn:hover {
		background: color-mix(in oklab, var(--accent) 22%, var(--surface));
	}
	.img-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
		gap: var(--space-2);
	}
	.thumb {
		position: relative;
		aspect-ratio: 1;
		border-radius: var(--radius-md);
		overflow: hidden;
		border: 1px solid var(--border);
		background: var(--surface-inset);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.thumb-del {
		position: absolute;
		top: 4px;
		right: 4px;
		display: inline-flex;
		padding: 4px;
		border-radius: var(--radius-full);
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		opacity: 0;
		transition: opacity var(--transition-fast);
	}
	.thumb:hover .thumb-del {
		opacity: 1;
	}
	.thumb-del:hover {
		background: var(--danger);
	}
	.dropzone {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-3);
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-subtle);
		font-size: var(--text-xs);
		transition: all var(--transition-fast);
	}
	.dropzone:hover,
	.dropzone.dragging {
		border-color: var(--accent);
		color: var(--accent-text);
		background: var(--accent-soft);
	}

	@media (max-width: 560px) {
		.attrs {
			grid-template-columns: 1fr;
		}
	}
</style>
