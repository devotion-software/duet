<script lang="ts">
	import Modal from '#lib/components/ui/Modal.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import ProjectIcon from '#lib/components/ProjectIcon.svelte';
	import { toasts } from '#lib/components/ui/toast.svelte';
	import { ROLE_DESCRIPTIONS, type Role } from '#lib/types';

	const ROLE_OPTIONS = [
		{ value: 'editor', label: 'Editor' },
		{ value: 'viewer', label: 'Viewer' },
		{ value: 'owner', label: 'Owner' }
	];

	interface InviteProject {
		id: string;
		name: string;
		icon: string;
		iconUrl: string | null;
		color: string;
	}
	interface Props {
		open: boolean;
		projects: InviteProject[];
	}
	let { open = $bindable(), projects }: Props = $props();

	let emailsInput = $state('');
	let role = $state<Role>('editor');
	let selected = $state(new Set<string>());
	let sending = $state(false);

	const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
	const emails = $derived(
		[...new Set(emailsInput.split(/[,\s\n]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))].filter(
			(e) => EMAIL_RE.test(e)
		)
	);
	const canSend = $derived(emails.length > 0 && selected.size > 0 && !sending);

	// Reset the form each time the dialog is opened fresh.
	$effect(() => {
		if (open) {
			emailsInput = '';
			role = 'editor';
			selected = new Set(projects.map((p) => p.id));
		}
	});

	function toggle(id: string) {
		const next = new Set(selected);
		if (!next.delete(id)) next.add(id);
		selected = next;
	}

	function setAll(all: boolean) {
		selected = all ? new Set(projects.map((p) => p.id)) : new Set();
	}

	async function invite(e: SubmitEvent) {
		e.preventDefault();
		if (!canSend) return;
		sending = true;
		try {
			const res = await fetch('/api/invites', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ projectIds: [...selected], emails, role })
			});
			if (!res.ok) {
				const m = await res.json().catch(() => null);
				throw new Error(m?.message ?? 'Something went wrong');
			}
			const { results } = await res.json();
			const added = results.filter((r: { status: string }) => r.status === 'added').length;
			const invited = results.filter((r: { status: string }) => r.status === 'invited').length;
			const skipped = results.length - added - invited;
			const parts = [];
			if (added) parts.push(`${added} added`);
			if (invited) parts.push(`${invited} invite${invited === 1 ? '' : 's'} sent`);
			if (skipped) parts.push(`${skipped} skipped`);
			toasts.success(parts.join(', ') || 'Done');
			open = false;
		} catch (err) {
			toasts.error((err as Error).message);
		} finally {
			sending = false;
		}
	}
</script>

<Modal bind:open title="Invite to projects" subtitle="Add teammates to one or more projects at once" size="md">
	<form class="invite-form" onsubmit={invite}>
		<label class="field">
			<span class="field-label">Emails</span>
			<textarea
				bind:value={emailsInput}
				placeholder="jane@example.com, sam@example.com…"
				rows="2"
			></textarea>
		</label>

		<label class="field">
			<span class="field-label">Role</span>
			<Select
				options={ROLE_OPTIONS}
				value={role}
				onvalue={(v) => (role = v as Role)}
				searchable={false}
				size="sm"
			/>
			<p class="role-hint">{ROLE_DESCRIPTIONS[role]}</p>
		</label>

		<div class="field">
			<span class="field-label">
				Projects
				<span class="h2-tools">
					<button type="button" class="tool-btn" onclick={() => setAll(true)}>All</button>
					<button type="button" class="tool-btn" onclick={() => setAll(false)}>None</button>
				</span>
			</span>
			<ul class="projects">
				{#each projects as p (p.id)}
					<li>
						<label class="project-row">
							<input type="checkbox" checked={selected.has(p.id)} onchange={() => toggle(p.id)} />
							<span class="p-icon" style="--accent: {p.color}"><ProjectIcon icon={p.icon} iconUrl={p.iconUrl} /></span>
							<span class="p-name truncate">{p.name}</span>
						</label>
					</li>
				{/each}
			</ul>
		</div>

		<footer class="foot">
			<Button type="submit" variant="primary" loading={sending} disabled={!canSend}>
				Invite{selected.size > 1 ? ` to ${selected.size} projects` : ''}
			</Button>
		</footer>
	</form>
</Modal>

<style>
	.invite-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.field-label {
		display: flex;
		align-items: center;
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.h2-tools {
		display: inline-flex;
		gap: var(--space-1);
		margin-left: auto;
		text-transform: none;
		letter-spacing: normal;
	}
	.tool-btn {
		padding: 1px var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
	}
	.tool-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	textarea {
		resize: vertical;
		min-height: 54px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		color: var(--text);
		font: inherit;
	}
	textarea:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.role-hint {
		color: var(--text-subtle);
		font-size: var(--text-xs);
	}
	.projects {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 220px;
		overflow-y: auto;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-1);
	}
	.project-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.project-row:hover {
		background: var(--surface-hover);
	}
	.p-icon {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		font-size: 14px;
		flex-shrink: 0;
	}
	.p-name {
		font-size: var(--text-sm);
	}
	.foot {
		display: flex;
		justify-content: flex-end;
	}
</style>
