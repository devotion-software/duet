<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import ImageViewer from '#lib/components/ui/ImageViewer.svelte';
	import DocumentViewer from '#lib/components/ui/DocumentViewer.svelte';
	import Markdown from '#lib/components/Markdown.svelte';
	import SubtaskAdd from '#lib/components/todo/SubtaskAdd.svelte';
	import TodoHistory from '#lib/components/todo/TodoHistory.svelte';
	import { toDateInput } from '#lib/date';
	import { Copied } from '#lib/copied.svelte';
	import { dialogOpen } from '#lib/shortcuts';
	import {
		URGENCIES,
		SIZES,
		URGENCY_META,
		SIZE_META,
		isInProgress,
		type Todo,
		type Tag,
		type Category,
		type Member,
		type Attachment
	} from '#lib/types';
	import type { NewTodoInput } from '#lib/stores/todos.svelte';

	interface Props {
		todo: Todo;
		/** Project colour, so the panel matches its project. */
		accent: string;
		canEdit: boolean;
		members: Member[];
		categories: Category[];
		tags: Tag[];
		onUpdate: (patch: Partial<NewTodoInput>) => void;
		onToggle: (id: string) => void;
		onSetInProgress: (id: string, inProgress: boolean) => void;
		onNotDoing: (id: string) => void;
		onDelete: (id: string) => void;
		onCopy: (todo: Todo) => Promise<boolean>;
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
		accent,
		canEdit,
		members,
		categories,
		tags,
		onUpdate,
		onToggle,
		onSetInProgress,
		onNotDoing,
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

	const copied = new Copied<'head' | 'cta'>();
	async function copy(button: 'head' | 'cta') {
		if (await onCopy(todo)) copied.mark(button);
	}
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
	function onkeydown(e: KeyboardEvent) {
		// A dialog on top (e.g. delete confirmation) owns Escape.
		if (e.defaultPrevented || dialogOpen()) return;
		if (e.key === 'Escape') onClose();
		else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			// Blurring the focused field fires its onblur save before closing.
			(document.activeElement as HTMLElement | null)?.blur();
			onClose();
		}
	}

	// ── Attachments ──
	let uploading = $state(false);
	let viewing = $state<number | null>(null);
	let viewingDoc = $state<Attachment | null>(null);
	const imageAttachments = $derived(
		todo.attachments.filter((a) => a.mime?.startsWith('image/'))
	);
	const viewerImages = $derived(imageAttachments.map((a) => ({ src: a.url, name: a.name })));
	function viewerIndex(att: (typeof todo.attachments)[number]) {
		return imageAttachments.findIndex((a) => a.id === att.id);
	}
	let dragging = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	async function uploadFiles(files: Iterable<File>) {
		const list = [...files];
		if (!list.length) return;
		uploading = true;
		for (const file of list) await onAddAttachment(file);
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

<div class="panel-overlay" style="--accent: {accent}" transition:fade={{ duration: 150 }}>
	<button class="panel-scrim" aria-label="Close" onclick={onClose}></button>
	<aside
		class="panel"
		transition:fly={{ x: 420, duration: 240 }}
		aria-label="Task details"
		onpaste={onPaste}
	>
		<header class="panel-head project-surface">
			<div class="status">
				<button
					class="check"
					class:on={todo.completed}
					class:skipped={todo.notDoing}
					disabled={!canEdit}
					onclick={() => onToggle(todo.id)}
					aria-label="Toggle complete"
					title={todo.completed ? 'Reopen' : undefined}
				>
					{#if todo.notDoing}<Icon name="ban" size={13} />
					{:else if todo.completed}<Icon name="check" size={13} strokeWidth={3} />{/if}
					<span>{todo.notDoing ? 'Not doing' : todo.completed ? 'Completed' : 'Mark done'}</span>
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
					<button
						class="check"
						disabled={!canEdit}
						onclick={() => onNotDoing(todo.id)}
						title="Close without doing it"
					>
						<Icon name="ban" size={13} />
						<span>Not doing</span>
					</button>
				{/if}
			</div>
			<div class="head-actions">
				<button class="icon-act" title="Copy for AI" onclick={() => copy('head')}>
					<Icon name={copied.icon('head')} size={17} />
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
			<div class="title-wrap">
				<textarea
					class="title-input"
					bind:this={titleEl}
					bind:value={title}
					onblur={saveTitle}
					rows="1"
					readonly={!canEdit}
					placeholder="Task title"
					maxlength="500"
				></textarea>
				{#if title.length > 400}
					<span class="char-count" class:limit={title.length >= 500}>{title.length}/500</span>
				{/if}
			</div>

			<!-- Attributes grid -->
			<div class="attrs">
				<label class="attr">
					<span class="attr-label"><Icon name="folder" size={14} /> Category</span>
					<Select
						size="sm"
						disabled={!canEdit}
						value={todo.categoryId ?? ''}
						placeholder="None"
						aria-label="Category"
						options={[{ value: '', label: 'None' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
						onvalue={(v) => onUpdate({ categoryId: v || null })}
						creatable={canEdit}
						onCreate={async (name) => {
							const cat = await onCreateCategory(name);
							return cat ? { value: cat.id, label: cat.name } : null;
						}}
					/>
				</label>

				<label class="attr">
					<span class="attr-label"><Icon name="corner-down-right" size={14} /> Parent</span>
					<Select
						size="sm"
						disabled={!canEdit}
						value={todo.parentId ?? ''}
						placeholder="None (top level)"
						aria-label="Parent"
						options={[
							{ value: '', label: 'None (top level)' },
							...parentOptions.map(({ todo: t, depth }) => ({ value: t.id, label: optionLabel(t, depth) }))
						]}
						onvalue={(v) => onUpdate({ parentId: v || null })}
					/>
				</label>

				<label class="attr">
					<span class="attr-label"><Icon name="user" size={14} /> Assignee</span>
					<Select
						size="sm"
						disabled={!canEdit}
						value={todo.assigneeId ?? ''}
						placeholder="Unassigned"
						aria-label="Assignee"
						options={[{ value: '', label: 'Unassigned' }, ...members.map((m) => ({ value: m.userId, label: m.name || m.email }))]}
						onvalue={(v) => onUpdate({ assigneeId: v || null })}
					/>
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
					<Select
						size="sm"
						disabled={!canEdit}
						value={todo.urgency ?? ''}
						placeholder="None"
						aria-label="Urgency"
						options={[{ value: '', label: 'None' }, ...URGENCIES.map((u) => ({ value: u, label: URGENCY_META[u].label }))]}
						onvalue={(v) => onUpdate({ urgency: v || null })}
					/>
				</label>

				<label class="attr">
					<span class="attr-label"><Icon name="inbox" size={14} /> Size</span>
					<Select
						size="sm"
						disabled={!canEdit}
						value={todo.size ?? ''}
						placeholder="None"
						aria-label="Size"
						options={[{ value: '', label: 'None' }, ...SIZES.map((s) => ({ value: s, label: SIZE_META[s].full }))]}
						onvalue={(v) => onUpdate({ size: v || null })}
					/>
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
									class:skipped={sub.notDoing}
									disabled={!canEdit}
									onclick={() => onToggle(sub.id)}
									aria-label={sub.completed ? 'Mark as not done' : 'Mark as done'}
									aria-pressed={sub.completed}
								>
									{#if sub.notDoing}<Icon name="x" size={9} strokeWidth={3} />
									{:else if sub.completed}<Icon name="check" size={10} strokeWidth={3} />{/if}
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

			<!-- Attachments -->
			<div class="section">
				<div class="desc-head">
					<span class="section-label"><Icon name="image" size={14} /> Attachments</span>
					{#if canEdit && uploading}<Spinner size={13} />{/if}
				</div>

				{#if todo.attachments.length}
					<div class="img-grid">
						{#each todo.attachments as att (att.id)}
							{@const isImage = !!att.mime?.startsWith('image/')}
							<div class="thumb">
								{#if isImage}
									<button
										class="thumb-open"
										onclick={() => (viewing = viewerIndex(att))}
										aria-label="View image"
									>
										<img src={att.url} alt={att.name ?? 'attachment'} loading="lazy" />
									</button>
								{:else}
									<button class="thumb-open file" onclick={() => (viewingDoc = att)}>
										<Icon name="file" size={22} />
										<span class="file-name" title={att.name}>{att.name}</span>
									</button>
								{/if}
								{#if canEdit}
									<button
										class="thumb-del"
										onclick={() => onRemoveAttachment(att.id)}
										aria-label="Remove attachment"
									>
										<Icon name="x" size={12} />
									</button>
								{/if}
							</div>
						{/each}
					</div>
					<ImageViewer images={viewerImages} bind:index={viewing} />
					<DocumentViewer
						doc={viewingDoc && { src: viewingDoc.url, name: viewingDoc.name, mime: viewingDoc.mime }}
						onClose={() => (viewingDoc = null)}
					/>
				{/if}

				{#if canEdit}
					<div
						class="dropzone"
						class:dragging
						role="button"
						tabindex="0"
						onclick={() => fileInput?.click()}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								fileInput?.click();
							}
						}}
						ondragover={(e) => {
							e.preventDefault();
							dragging = true;
						}}
						ondragleave={() => (dragging = false)}
						ondrop={onDrop}
					>
						<input
							bind:this={fileInput}
							type="file"
							multiple
							onchange={onFileInput}
							onclick={(e) => e.stopPropagation()}
							hidden
						/>
						<Icon name="upload" size={16} />
						<span>Drag &amp; drop, paste, or click to upload</span>
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

			<TodoHistory {todo} />

			<div class="foot-meta">
				{#if todo.assignee}
					<span class="fm"><Avatar name={todo.assignee.name} image={todo.assignee.image} size={18} /> {todo.assignee.name}</span>
				{/if}
				<span class="fm">Created {todo.createdAt.toLocaleDateString()}</span>
			</div>

			<div class="copy-cta">
				<Button variant="subtle" icon={copied.icon('cta')} full onclick={() => copy('cta')}>
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
		border-bottom: 1px solid var(--project-border, var(--border-subtle));
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
	.check.skipped {
		background: var(--surface-inset);
		border-color: var(--border-strong);
		color: var(--text-muted);
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
	.sub-check.skipped {
		background: var(--surface-inset);
		border-color: var(--border-strong);
		color: var(--text-subtle);
	}
	.sub-title {
		flex: 1;
		min-width: 0;
		text-align: left;
		font-size: var(--text-sm);
		color: var(--text);
		padding: var(--space-1) 0;
		overflow-wrap: anywhere;
	}
	.sub.done .sub-title {
		color: var(--text-subtle);
		text-decoration: line-through;
	}
	.title-wrap {
		position: relative;
		flex-shrink: 0;
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
		overflow-wrap: anywhere;
	}
	.title-input:focus {
		outline: none;
	}
	.char-count {
		position: absolute;
		right: 0;
		bottom: calc(-1 * var(--space-4));
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--text-faint);
	}
	.char-count.limit {
		color: var(--danger);
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
		width: 100%;
	}
	.add-inline input:focus {
		outline: none;
		border-color: var(--accent);
		border-style: solid;
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
	.thumb-open {
		display: block;
		width: 100%;
		height: 100%;
		cursor: zoom-in;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.thumb-open.file {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: var(--space-2);
		color: var(--text-muted);
		text-align: center;
		cursor: pointer;
	}
	.thumb-open.file:hover {
		color: var(--text);
		background: var(--surface-hover);
	}
	.file-name {
		width: 100%;
		font-size: 10px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		cursor: pointer;
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
