<script lang="ts">
	import { fly } from 'svelte/transition';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { PROJECT_STATUSES, type ProjectStatus, type Member } from '#lib/types';
	import type { ProjectFolder } from '#lib/sidebar';

	interface BulkProject {
		id: string;
		name: string;
		icon: string;
		iconUrl: string | null;
		color: string;
		role: 'owner' | 'editor' | 'viewer';
		status: ProjectStatus;
	}
	interface Props {
		selected: BulkProject[];
		totalVisible: number;
		folders: ProjectFolder[];
		onRename: (name: string) => Promise<boolean>;
		onStatus: (status: ProjectStatus) => Promise<boolean>;
		onMove: (folderId: string | null) => Promise<boolean>;
		onInvite: () => void;
		onLoadMembers: () => Promise<Member[]>;
		onRemoveMember: (userId: string) => Promise<boolean>;
		onCopy: () => Promise<boolean>;
		onDownload: () => Promise<boolean>;
		onDelete: () => Promise<boolean>;
		onSelectAll: () => void;
		onClear: () => void;
	}
	let {
		selected,
		totalVisible,
		folders,
		onRename,
		onStatus,
		onMove,
		onInvite,
		onLoadMembers,
		onRemoveMember,
		onCopy,
		onDownload,
		onDelete,
		onSelectAll,
		onClear
	}: Props = $props();

	let busy = $state(false);
	let popover = $state<'status' | 'folder' | 'members' | null>(null);
	let renameValue = $state('');
	let renaming = $state(false);
	let membersList = $state<Member[] | null>(null);
	let loadingMembers = $state(false);

	const allOwners = $derived(selected.length > 0 && selected.every((p) => p.role === 'owner'));

	// The selection's shared status, if they all agree.
	const commonStatus = $derived.by(() => {
		const ids = new Set(selected.map((p) => p.status));
		return ids.size === 1 ? [...ids][0] : undefined;
	});

	async function run(action: () => Promise<boolean>) {
		busy = true;
		await action();
		busy = false;
	}

	function startRename() {
		if (selected.length !== 1) return;
		renameValue = selected[0].name;
		renaming = true;
	}
	async function submitRename() {
		const name = renameValue.trim();
		renaming = false;
		if (!name || name === selected[0]?.name) return;
		await run(() => onRename(name));
	}

	async function openMembers() {
		popover = popover === 'members' ? null : 'members';
		if (popover === 'members' && !membersList) {
			loadingMembers = true;
			membersList = await onLoadMembers();
			loadingMembers = false;
		}
	}

	async function removeMember(userId: string) {
		if (!confirm('Remove this member from all selected projects?')) return;
		busy = true;
		const ok = await onRemoveMember(userId);
		if (ok) membersList = membersList?.filter((m) => m.userId !== userId) ?? null;
		busy = false;
	}

	async function deleteSelected() {
		const n = selected.length;
		if (!confirm(`Delete ${n} project${n === 1 ? '' : 's'} and all their tasks? This cannot be undone.`)) return;
		busy = true;
		if (await onDelete()) onClear();
		busy = false;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (renaming) renaming = false;
		else if (popover) popover = null;
		else onClear();
	}
</script>

<svelte:window {onkeydown} />

<div class="bulk" role="toolbar" aria-label="Bulk edit selected projects" transition:fly={{ y: 24, duration: 180 }}>
	<div class="count">
		{#if busy}<Spinner size={14} />{/if}
		<strong>{selected.length}</strong> selected
	</div>

	<div class="controls">
		{#if selected.length === 1}
			{#if renaming}
				<form
					class="rename-form"
					onsubmit={(e) => {
						e.preventDefault();
						submitRename();
					}}
				>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						bind:value={renameValue}
						autofocus
						maxlength="160"
						aria-label="Project name"
						onfocus={(e) => e.currentTarget.select()}
						onblur={submitRename}
						onkeydown={(e) => {
							if (e.key === 'Escape') renaming = false;
						}}
					/>
				</form>
			{:else}
				<button class="ctl" disabled={busy} onclick={startRename}>
					<Icon name="pencil" size={14} /> Rename
				</button>
			{/if}
		{/if}

		{#if allOwners}
			<div class="pop-host">
				<button
					class="ctl"
					class:on={popover === 'status'}
					disabled={busy}
					onclick={() => (popover = popover === 'status' ? null : 'status')}
				>
					<Icon name="flag" size={14} /> Status
				</button>
				{#if popover === 'status'}
					<button class="scrim" aria-label="Close" onclick={() => (popover = null)}></button>
					<div class="pop">
						{#each PROJECT_STATUSES as s (s.value)}
							<button
								class="pop-item"
								disabled={busy}
								onclick={() => {
									popover = null;
									run(() => onStatus(s.value));
								}}
							>
								<span class="status-dot status-{s.value}"></span>
								<span class="truncate">{s.label}</span>
								{#if commonStatus === s.value}<span class="tick"><Icon name="check" size={13} /></span>{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<div class="pop-host">
			<button
				class="ctl"
				class:on={popover === 'folder'}
				disabled={busy}
				onclick={() => (popover = popover === 'folder' ? null : 'folder')}
			>
				<Icon name="folder" size={14} /> Move to folder
			</button>
			{#if popover === 'folder'}
				<button class="scrim" aria-label="Close" onclick={() => (popover = null)}></button>
				<div class="pop">
					{#each folders as f (f.id)}
						<button
							class="pop-item"
							disabled={busy}
							onclick={() => {
								popover = null;
								run(() => onMove(f.id));
							}}
						>
							<Icon name="folder" size={14} />
							<span class="truncate">{f.name}</span>
						</button>
					{:else}
						<p class="pop-empty">No folders yet.</p>
					{/each}
					{#if folders.length}<hr />{/if}
					<button
						class="pop-item"
						disabled={busy}
						onclick={() => {
							popover = null;
							run(() => onMove(null));
						}}
					>
						<Icon name="x" size={14} /> No folder
					</button>
				</div>
			{/if}
		</div>

		{#if allOwners}
			<div class="pop-host">
				<button class="ctl" class:on={popover === 'members'} disabled={busy} onclick={openMembers}>
					<Icon name="users" size={14} /> Members
				</button>
				{#if popover === 'members'}
					<button class="scrim" aria-label="Close" onclick={() => (popover = null)}></button>
					<div class="pop members">
						<button
							class="pop-item"
							disabled={busy}
							onclick={() => {
								popover = null;
								onInvite();
							}}
						>
							<Icon name="users" size={14} /> Invite…
						</button>
						<hr />
						{#if loadingMembers}
							<p class="pop-empty">Loading…</p>
						{:else if membersList?.length}
							{#each membersList as m (m.userId)}
								<div class="pop-item member-row">
									<span class="truncate">{m.name || m.email}</span>
									<button
										class="member-remove"
										disabled={busy}
										title="Remove from all selected projects"
										onclick={() => removeMember(m.userId)}
									>
										<Icon name="x" size={13} />
									</button>
								</div>
							{/each}
						{:else}
							<p class="pop-empty">No shared members.</p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="actions">
		<button class="ctl" disabled={busy} title="Copy selected projects as checklists" onclick={() => run(onCopy)}>
			<Icon name="copy" size={14} /> Copy
		</button>
		<button class="ctl" disabled={busy} title="Download selected projects as JSON" onclick={() => run(onDownload)}>
			<Icon name="download" size={14} /> Download JSON
		</button>
		{#if allOwners}
			<button class="ctl danger" disabled={busy} onclick={deleteSelected}>
				<Icon name="trash" size={14} /> Delete
			</button>
		{/if}
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
		white-space: nowrap;
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
	.rename-form input {
		height: 30px;
		padding: 0 var(--space-2);
		font: inherit;
		font-size: var(--text-sm);
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--accent-border, var(--border-strong));
		border-radius: var(--radius-sm);
		width: 180px;
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
		min-width: 200px;
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
	.pop-empty {
		padding: var(--space-2) var(--space-3);
		color: var(--text-faint);
	}
	.tick {
		display: inline-flex;
		margin-left: auto;
		color: var(--accent-text);
	}
	.status-dot {
		width: 7px;
		height: 7px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background: var(--status-color);
	}
	.status-dot.status-not_started {
		--status-color: var(--text-subtle);
	}
	.status-dot.status-in_progress {
		--status-color: var(--warning);
	}
	.status-dot.status-live {
		--status-color: var(--success);
	}
	.status-dot.status-archived {
		--status-color: var(--text-faint);
	}
	.member-row {
		justify-content: space-between;
		gap: var(--space-2);
	}
	.member-remove {
		display: inline-flex;
		padding: 3px;
		border-radius: var(--radius-xs);
		color: var(--text-faint);
		flex-shrink: 0;
	}
	.member-remove:hover:not(:disabled) {
		background: var(--danger-soft);
		color: var(--danger);
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
