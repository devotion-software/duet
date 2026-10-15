<script lang="ts">
	import Modal from '#lib/components/ui/Modal.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import { toasts } from '#lib/components/ui/toast.svelte';
	import { ROLE_DESCRIPTIONS, type Member, type Role } from '#lib/types';

	const ROLE_OPTIONS = [
		{ value: 'editor', label: 'Editor' },
		{ value: 'viewer', label: 'Viewer' },
		{ value: 'owner', label: 'Owner' }
	];

	interface Invite {
		id: string;
		email: string;
		role: Role;
	}
	interface Props {
		open: boolean;
		projectId: string;
		members: Member[];
		invites: Invite[];
		currentUserId: string;
		canManage: boolean;
		onChanged: () => void;
	}
	let {
		open = $bindable(),
		projectId,
		members,
		invites,
		currentUserId,
		canManage,
		onChanged
	}: Props = $props();

	let email = $state('');
	let role = $state<Role>('editor');
	let adding = $state(false);

	async function api(url: string, init: RequestInit) {
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

	async function invite(e: SubmitEvent) {
		e.preventDefault();
		if (!email.trim() || adding) return;
		adding = true;
		try {
			const r = await api(`/api/projects/${projectId}/members`, {
				method: 'POST',
				body: JSON.stringify({ email: email.trim(), role })
			});
			toasts.success(r.status === 'invited' ? `Invite sent to ${email.trim()}` : 'Member added');
			email = '';
			onChanged();
		} catch (err) {
			toasts.error((err as Error).message);
		} finally {
			adding = false;
		}
	}

	async function changeRole(userId: string, newRole: Role) {
		try {
			await api(`/api/projects/${projectId}/members/${userId}`, {
				method: 'PATCH',
				body: JSON.stringify({ role: newRole })
			});
			onChanged();
		} catch (err) {
			toasts.error((err as Error).message);
		}
	}

	async function remove(userId: string) {
		try {
			await api(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
			onChanged();
		} catch (err) {
			toasts.error((err as Error).message);
		}
	}
</script>

<Modal bind:open title="Members" subtitle="Who can see and edit this project" size="md">
	{#if canManage}
		<form class="invite" onsubmit={invite}>
			<input
				bind:value={email}
				type="email"
				placeholder="Invite by email…"
				aria-label="Invite email"
			/>
			<Select
				options={ROLE_OPTIONS}
				value={role}
				onvalue={(v) => (role = v as Role)}
				searchable={false}
				size="sm"
				class="role-select"
				aria-label="Role"
			/>
			<Button type="submit" variant="primary" loading={adding} disabled={!email.trim()}>Invite</Button>
		</form>
		<p class="role-hint">{ROLE_DESCRIPTIONS[role]}</p>
	{/if}

	<ul class="members">
		{#each members as m (m.userId)}
			<li class="member">
				<Avatar name={m.name} email={m.email} image={m.image} size={34} />
				<div class="info">
					<span class="name">
						{m.name || m.email}
						{#if m.userId === currentUserId}<span class="you">you</span>{/if}
					</span>
					<span class="email">{m.email}</span>
				</div>
				{#if canManage && m.userId !== currentUserId}
					<Select
						options={ROLE_OPTIONS}
						value={m.role}
						onvalue={(v) => changeRole(m.userId, v as Role)}
						searchable={false}
						size="sm"
						class="member-role-select"
						aria-label="Role"
					/>
					<button class="remove" title="Remove" onclick={() => remove(m.userId)}>
						<Icon name="x" size={16} />
					</button>
				{:else}
					<span class="role-badge">{m.role}</span>
				{/if}
			</li>
		{/each}
	</ul>

	{#if invites.length}
		<div class="pending">
			<span class="pending-label">Pending invites</span>
			{#each invites as inv (inv.id)}
				<div class="invite-row">
					<Icon name="mail" size={15} />
					<span class="pemail">{inv.email}</span>
					<span class="role-badge">{inv.role}</span>
				</div>
			{/each}
		</div>
	{/if}
</Modal>

<style>
	.invite {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}
	.invite input {
		flex: 1;
		min-width: 0;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		padding: 0 var(--space-3);
		height: 38px;
		color: var(--text);
	}
	.invite input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	:global(.role-select) {
		width: 140px;
		flex-shrink: 0;
	}
	.role-hint {
		color: var(--text-subtle);
		font-size: var(--text-xs);
		margin-bottom: var(--space-4);
	}
	.members {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.member {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2);
		border-radius: var(--radius-md);
	}
	.member:hover {
		background: var(--surface-hover);
	}
	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.you {
		font-size: 10px;
		color: var(--accent-text);
		background: var(--accent-soft);
		padding: 1px 6px;
		border-radius: var(--radius-full);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.email {
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}
	:global(.member-role-select) {
		width: 110px;
		flex-shrink: 0;
	}
	.remove {
		display: inline-flex;
		padding: 6px;
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
	}
	.remove:hover {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.role-badge {
		font-size: var(--text-xs);
		color: var(--text-muted);
		text-transform: capitalize;
		padding: 3px var(--space-2);
		background: var(--surface-inset);
		border-radius: var(--radius-full);
	}
	.pending {
		margin-top: var(--space-5);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border-subtle);
	}
	.pending-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.invite-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
	.pemail {
		flex: 1;
	}
</style>
