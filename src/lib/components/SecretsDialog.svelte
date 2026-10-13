<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import Modal from './ui/Modal.svelte';
	import Button from './ui/Button.svelte';
	import Icon from './ui/Icon.svelte';
	import Spinner from './ui/Spinner.svelte';
	import { toasts } from './ui/toast.svelte';

	interface Secret {
		id: string;
		name: string;
		note: string | null;
	}
	interface Props {
		open: boolean;
		projectId: string;
	}
	let { open = $bindable(), projectId }: Props = $props();

	let secrets = $state<Secret[]>([]);
	let loading = $state(false);
	// Decrypted values, only held while the dialog is open.
	const revealed = new SvelteMap<string, string>();

	// The add form, or an existing secret being edited (blank value keeps the stored one).
	let editingId = $state<string | null>(null);
	let adding = $state(false);
	let name = $state('');
	let value = $state('');
	let note = $state('');
	let showValue = $state(false);
	let saving = $state(false);

	const base = $derived(`/api/projects/${projectId}/secrets`);

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

	$effect(() => {
		const isOpen = open;
		untrack(() => {
			if (isOpen) load();
			else {
				revealed.clear();
				closeForm();
			}
		});
	});

	async function load() {
		loading = true;
		try {
			secrets = (await api(base)).secrets;
		} catch (err) {
			toasts.error((err as Error).message);
		} finally {
			loading = false;
		}
	}

	async function fetchValue(id: string): Promise<string> {
		const cached = revealed.get(id);
		if (cached !== undefined) return cached;
		const v = (await api(`${base}/${id}`)).value as string;
		revealed.set(id, v);
		return v;
	}

	async function toggleReveal(id: string) {
		if (revealed.has(id)) return revealed.delete(id);
		try {
			await fetchValue(id);
		} catch (err) {
			toasts.error((err as Error).message);
		}
	}

	async function copy(s: Secret) {
		// Copying a hidden secret shouldn't leave it on screen.
		const wasShown = revealed.has(s.id);
		try {
			await navigator.clipboard.writeText(await fetchValue(s.id));
			toasts.success(`Copied ${s.name}`);
		} catch (err) {
			toasts.error((err as Error).message);
		} finally {
			if (!wasShown) revealed.delete(s.id);
		}
	}

	function startAdd() {
		closeForm();
		adding = true;
	}

	function startEdit(s: Secret) {
		closeForm();
		editingId = s.id;
		name = s.name;
		note = s.note ?? '';
	}

	function closeForm() {
		adding = false;
		editingId = null;
		name = value = note = '';
		showValue = false;
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (saving || !name.trim() || (adding && !value)) return;
		saving = true;
		try {
			if (adding) {
				const { secret } = await api(base, {
					method: 'POST',
					body: JSON.stringify({ name, value, note })
				});
				secrets = [...secrets, secret].sort((a, b) => a.name.localeCompare(b.name));
				toasts.success('Secret saved');
			} else if (editingId) {
				const id = editingId;
				const { secret } = await api(`${base}/${id}`, {
					method: 'PATCH',
					body: JSON.stringify(value ? { name, value, note } : { name, note })
				});
				secrets = secrets.map((s) => (s.id === id ? secret : s));
				if (value && revealed.has(id)) revealed.set(id, value);
				toasts.success('Secret updated');
			}
			closeForm();
		} catch (err) {
			toasts.error((err as Error).message);
		} finally {
			saving = false;
		}
	}

	async function remove(s: Secret) {
		if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
		try {
			await api(`${base}/${s.id}`, { method: 'DELETE' });
			secrets = secrets.filter((x) => x.id !== s.id);
			revealed.delete(s.id);
			if (editingId === s.id) closeForm();
		} catch (err) {
			toasts.error((err as Error).message);
		}
	}
</script>

{#snippet form()}
	<form class="sform" onsubmit={save}>
		<div class="row">
			<input
				bind:value={name}
				placeholder="Name, e.g. Stripe API key"
				aria-label="Name"
				maxlength="120"
				required
			/>
		</div>
		<div class="row value-row">
			{#if showValue}
				<textarea
					bind:value
					class="mono"
					rows="2"
					placeholder={adding ? 'Secret value' : 'New value (leave blank to keep current)'}
					aria-label="Value"
					autocomplete="off"
					spellcheck="false"
				></textarea>
			{:else}
				<input
					bind:value
					type="password"
					class="mono"
					placeholder={adding ? 'Secret value' : 'New value (leave blank to keep current)'}
					aria-label="Value"
					autocomplete="new-password"
					required={adding}
				/>
			{/if}
			<button
				type="button"
				class="icon-btn"
				title={showValue ? 'Hide' : 'Show'}
				onclick={() => (showValue = !showValue)}
			>
				<Icon name={showValue ? 'eye-off' : 'eye'} size={16} />
			</button>
		</div>
		<div class="row">
			<input bind:value={note} placeholder="Note (optional)" aria-label="Note" maxlength="500" />
		</div>
		<div class="form-actions">
			<Button variant="ghost" size="sm" type="button" onclick={closeForm}>Cancel</Button>
			<Button
				variant="primary"
				size="sm"
				type="submit"
				loading={saving}
				disabled={!name.trim() || (adding && !value)}
			>
				{adding ? 'Save secret' : 'Save changes'}
			</Button>
		</div>
	</form>
{/snippet}

<Modal
	bind:open
	title="Keys & secrets"
	subtitle="Encrypted at rest. Visible to editors and owners."
	size="md"
>
	{#if loading && !secrets.length}
		<div class="loading"><Spinner /></div>
	{:else}
		{#if secrets.length}
			<ul class="secrets">
				{#each secrets as s (s.id)}
					{#if editingId === s.id}
						<li class="editing">{@render form()}</li>
					{:else}
						{@const v = revealed.get(s.id)}
						<li class="secret">
							<div class="info">
								<span class="name">{s.name}</span>
								{#if v !== undefined}
									<code class="value revealed">{v}</code>
								{:else}
									<code class="value masked" aria-label="Hidden">••••••••••••</code>
								{/if}
								{#if s.note}<span class="note">{s.note}</span>{/if}
							</div>
							<div class="actions">
								<button
									class="icon-btn"
									title={v !== undefined ? 'Hide' : 'Reveal'}
									onclick={() => toggleReveal(s.id)}
								>
									<Icon name={v !== undefined ? 'eye-off' : 'eye'} size={16} />
								</button>
								<button class="icon-btn" title="Copy" onclick={() => copy(s)}>
									<Icon name="copy" size={16} />
								</button>
								<button class="icon-btn" title="Edit" onclick={() => startEdit(s)}>
									<Icon name="pencil" size={16} />
								</button>
								<button class="icon-btn danger" title="Delete" onclick={() => remove(s)}>
									<Icon name="trash" size={16} />
								</button>
							</div>
						</li>
					{/if}
				{/each}
			</ul>
		{:else if !adding}
			<div class="empty">
				<Icon name="lock" size={22} />
				<p>No secrets yet. Store API keys, passwords and tokens for this project here.</p>
			</div>
		{/if}

		{#if adding}
			<div class="adding">{@render form()}</div>
		{:else}
			<div class="add">
				<Button variant="secondary" size="sm" icon="plus" onclick={startAdd}>Add secret</Button>
			</div>
		{/if}
	{/if}
</Modal>

<style>
	.loading {
		display: grid;
		place-items: center;
		padding: var(--space-6);
	}
	.secrets {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.secret {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
	}
	.secret:hover {
		background: var(--surface-hover);
	}
	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
	}
	.value {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-muted);
	}
	.value.revealed {
		color: var(--text);
		white-space: pre-wrap;
		word-break: break-all;
		user-select: all;
	}
	.value.masked {
		letter-spacing: 0.1em;
	}
	.note {
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
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-5) var(--space-4);
		color: var(--text-subtle);
		text-align: center;
		font-size: var(--text-sm);
	}
	.add {
		margin-top: var(--space-3);
	}
	.adding,
	.editing {
		margin-top: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-inset);
	}
	.editing {
		margin-top: 0;
	}
	.sform {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.row {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
	}
	.value-row .icon-btn {
		margin-top: 5px;
	}
	.sform input,
	.sform textarea {
		flex: 1;
		min-width: 0;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
	}
	.sform textarea {
		resize: vertical;
	}
	.sform .mono {
		font-family: var(--font-mono);
	}
	.sform input:focus,
	.sform textarea:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}
</style>
