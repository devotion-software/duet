<script lang="ts">
	import { untrack } from 'svelte';
	import Modal from './ui/Modal.svelte';
	import Button from './ui/Button.svelte';
	import Icon from './ui/Icon.svelte';
	import Spinner from './ui/Spinner.svelte';
	import { toasts } from './ui/toast.svelte';
	import { isValidColor } from '#lib/color';

	interface Item {
		id: string;
		name: string;
		color: string;
		usageCount?: number;
	}
	interface Props {
		open: boolean;
		projectId: string;
	}
	let { open = $bindable(), projectId }: Props = $props();

	type Kind = 'tag' | 'category';
	let kind = $state<Kind>('tag');
	const KINDS: { value: Kind; label: string; icon: 'tag' | 'folder' }[] = [
		{ value: 'tag', label: 'Tags', icon: 'tag' },
		{ value: 'category', label: 'Categories', icon: 'folder' }
	];

	let tags = $state<Item[]>([]);
	let categories = $state<Item[]>([]);
	let loading = $state(false);

	// Id of the row currently being renamed, plus its in-flight edit fields.
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editColor = $state('#64748b');
	let saving = $state(false);
	// Ids with a delete in flight.
	let busy = $state<string[]>([]);

	$effect(() => {
		const isOpen = open;
		const pid = projectId;
		untrack(() => {
			closeEdit();
			if (isOpen) load(pid);
		});
	});

	async function load(pid: string) {
		loading = true;
		kind = 'tag';
		try {
			const [{ tags: t }, { categories: c }] = await Promise.all([
				api(`/api/projects/${pid}/tags`),
				api(`/api/projects/${pid}/categories`)
			]);
			tags = t;
			categories = c;
		} catch (e) {
			toasts.error((e as Error).message);
		} finally {
			loading = false;
		}
	}

	async function api(url: string, init: RequestInit = {}) {
		const res = await fetch(url, {
			...init,
			headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }
		});
		if (!res.ok) {
			let m = 'Something went wrong';
			try {
				m = (await res.json()).message ?? m;
			} catch {
				/* ignore */
			}
			throw new Error(m);
		}
		return res.json();
	}

	function base(k: Kind) {
		return `/api/projects/${projectId}/${k === 'tag' ? 'tags' : 'categories'}`;
	}

	function startEdit(item: Item) {
		editingId = item.id;
		editName = item.name;
		editColor = item.color;
	}

	function closeEdit() {
		editingId = null;
		editName = '';
		editColor = '#64748b';
	}

	function listFor(k: Kind) {
		return k === 'tag' ? tags : categories;
	}
	function setListFor(k: Kind, next: Item[]) {
		if (k === 'tag') tags = next;
		else categories = next;
	}

	async function save(k: Kind, id: string) {
		const name = editName.trim();
		if (!name || saving) return;
		saving = true;
		try {
			const key = k === 'tag' ? 'tag' : 'category';
			const { [key]: updated } = await api(`${base(k)}/${id}`, {
				method: 'PATCH',
				body: JSON.stringify({ name, color: editColor })
			});
			setListFor(
				k,
				listFor(k)
					.map((item) => (item.id === id ? { ...item, ...updated } : item))
					.sort((a, b) => a.name.localeCompare(b.name))
			);
			closeEdit();
			toasts.success(`${k === 'tag' ? 'Tag' : 'Category'} updated`);
		} catch (e) {
			toasts.error((e as Error).message);
		} finally {
			saving = false;
		}
	}

	async function remove(k: Kind, item: Item) {
		const used = item.usageCount ?? 0;
		const noun = k === 'tag' ? 'tag' : 'category';
		const warning = used
			? ` It's used by ${used} task${used === 1 ? '' : 's'}; they'll just lose the ${noun}.`
			: '';
		if (!confirm(`Delete “${item.name}”?${warning}`)) return;
		busy = [...busy, item.id];
		try {
			await api(`${base(k)}/${item.id}`, { method: 'DELETE' });
			setListFor(
				k,
				listFor(k).filter((i) => i.id !== item.id)
			);
			if (editingId === item.id) closeEdit();
		} catch (e) {
			toasts.error((e as Error).message);
		} finally {
			busy = busy.filter((id) => id !== item.id);
		}
	}

	const list = $derived(kind === 'tag' ? tags : categories);
	const editColorValid = $derived(isValidColor(editColor));
</script>

<Modal bind:open title="Tags & categories" size="md">
	<div class="kinds">
		{#each KINDS as k (k.value)}
			<button class="kind" class:sel={kind === k.value} onclick={() => (kind = k.value)}>
				<Icon name={k.icon} size={15} />{k.label}
			</button>
		{/each}
	</div>

	{#if loading && !tags.length && !categories.length}
		<div class="loading"><Spinner /></div>
	{:else if list.length}
		<ul class="items">
			{#each list as item (item.id)}
				<li>
					{#if editingId === item.id}
						<form class="edit-row" onsubmit={(e) => (e.preventDefault(), save(kind, item.id))}>
							<label class="swatch" title="Colour">
								<input type="color" bind:value={editColor} />
								<span style="background: {editColorValid ? editColor : item.color}"></span>
							</label>
							<input
								class="name-input"
								bind:value={editName}
								maxlength={kind === 'tag' ? 60 : 80}
								required
							/>
							<Button variant="ghost" size="sm" type="button" onclick={closeEdit}>Cancel</Button>
							<Button
								variant="primary"
								size="sm"
								type="submit"
								loading={saving}
								disabled={!editName.trim() || !editColorValid}
							>
								Save
							</Button>
						</form>
					{:else}
						<span class="dot" style="background: {item.color}"></span>
						<span class="name">{item.name}</span>
						{#if item.usageCount}
							<span class="count">{item.usageCount} task{item.usageCount === 1 ? '' : 's'}</span>
						{/if}
						<div class="actions">
							<button class="icon-btn" title="Rename" onclick={() => startEdit(item)}>
								<Icon name="pencil" size={15} />
							</button>
							<button
								class="icon-btn danger"
								title="Delete"
								disabled={busy.includes(item.id)}
								onclick={() => remove(kind, item)}
							>
								<Icon name="trash" size={15} />
							</button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">
			No {kind === 'tag' ? 'tags' : 'categories'} yet. Create one from a task's detail panel.
		</p>
	{/if}
</Modal>

<style>
	.loading {
		display: grid;
		place-items: center;
		padding: var(--space-6);
	}
	.kinds {
		display: inline-flex;
		background: var(--surface-inset);
		border-radius: var(--radius-md);
		padding: 3px;
		gap: 2px;
		margin-bottom: var(--space-3);
	}
	.kind {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		transition: all var(--transition-fast);
	}
	.kind:hover {
		color: var(--text);
	}
	.kind.sel {
		background: var(--surface-raised);
		color: var(--text);
		box-shadow: var(--shadow-xs);
	}
	.items {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-height: 360px;
		overflow-y: auto;
	}
	.items li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-2);
		border-radius: var(--radius-md);
	}
	.items li:hover {
		background: var(--surface-hover);
	}
	.dot {
		flex-shrink: 0;
		width: 10px;
		height: 10px;
		border-radius: var(--radius-full);
		box-shadow: 0 0 0 1px var(--border-strong);
	}
	.name {
		flex: 1;
		min-width: 0;
		font-size: var(--text-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}
	.actions {
		display: flex;
		gap: 2px;
		flex-shrink: 0;
	}
	.icon-btn {
		display: inline-flex;
		padding: 6px;
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
		transition: all var(--transition-fast);
	}
	.icon-btn:hover {
		background: var(--surface-inset);
		color: var(--text);
	}
	.icon-btn.danger:hover {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.icon-btn:disabled {
		opacity: 0.5;
		pointer-events: none;
	}
	.empty {
		margin: 0;
		padding: var(--space-5) var(--space-4);
		text-align: center;
		font-size: var(--text-sm);
		color: var(--text-subtle);
	}
	.edit-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1;
	}
	.swatch {
		position: relative;
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		cursor: pointer;
	}
	.swatch input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.swatch span {
		display: block;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-full);
		box-shadow: 0 0 0 1px var(--border-strong);
	}
	.name-input {
		flex: 1;
		min-width: 0;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		padding: var(--space-1) var(--space-2);
		color: var(--text);
		font-size: var(--text-sm);
	}
	.name-input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
</style>
