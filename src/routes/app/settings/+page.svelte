<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { authClient } from '#lib/auth-client';
	import { theme, THEMES, type Theme } from '#lib/theme.svelte';
	import { toasts } from '#lib/components/ui/toast.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import Icon, { type IconName } from '#lib/components/ui/Icon.svelte';

	let { data } = $props();

	let name = $state(data.user.name ?? '');
	let savingName = $state(false);
	let addingPasskey = $state(false);

	const THEME_META: Record<Theme, { label: string; icon: IconName }> = {
		system: { label: 'System', icon: 'monitor' },
		light: { label: 'Light', icon: 'sun' },
		dark: { label: 'Dark', icon: 'moon' }
	};

	async function saveName() {
		const n = name.trim();
		if (!n || n === data.user.name || savingName) return;
		savingName = true;
		const { error } = await authClient.updateUser({ name: n });
		savingName = false;
		if (error) toasts.error(error.message ?? 'Could not save');
		else {
			toasts.success('Name updated');
			await invalidateAll();
		}
	}

	async function addPasskey() {
		if (addingPasskey) return;
		addingPasskey = true;
		const res = await authClient.passkey.addPasskey({
			name: `${navigatorLabel()} · ${new Date().toLocaleDateString()}`
		});
		addingPasskey = false;
		if (res?.error) {
			toasts.error(res.error.message ?? 'Could not add passkey');
		} else {
			toasts.success('Passkey added');
			await invalidateAll();
		}
	}

	async function removePasskey(id: string) {
		if (!confirm('Remove this passkey?')) return;
		const res = await authClient.passkey.deletePasskey({ id });
		if (res?.error) toasts.error(res.error.message ?? 'Could not remove');
		else {
			toasts.success('Passkey removed');
			await invalidateAll();
		}
	}

	async function signOut() {
		await authClient.signOut();
		await goto('/');
	}

	function navigatorLabel() {
		if (typeof navigator === 'undefined') return 'Device';
		const ua = navigator.userAgent;
		if (/Mac/.test(ua)) return 'Mac';
		if (/Windows/.test(ua)) return 'Windows';
		if (/iPhone|iPad/.test(ua)) return 'iOS';
		if (/Android/.test(ua)) return 'Android';
		return 'Device';
	}
</script>

<svelte:head><title>Settings · Duet</title></svelte:head>

<div class="settings">
	<header class="s-head">
		<a href="/app" class="back"><Icon name="chevron-left" size={16} /> Back</a>
		<h1>Settings</h1>
	</header>

	<!-- Profile -->
	<section class="card">
		<div class="card-head">
			<h2>Profile</h2>
			<p>How you appear across your projects.</p>
		</div>
		<div class="profile">
			<Avatar name={data.user.name} email={data.user.email} image={data.user.image} size={56} />
			<div class="pfields">
				<label class="field">
					<span>Display name</span>
					<div class="name-row">
						<input bind:value={name} placeholder="Your name" maxlength="80" />
						<Button
							variant="secondary"
							size="sm"
							loading={savingName}
							disabled={!name.trim() || name.trim() === data.user.name}
							onclick={saveName}
						>
							Save
						</Button>
					</div>
				</label>
				<label class="field">
					<span>Email</span>
					<input value={data.user.email} readonly class="readonly" />
				</label>
			</div>
		</div>
	</section>

	<!-- Appearance -->
	<section class="card">
		<div class="card-head">
			<h2>Appearance</h2>
			<p>Choose how Duet looks on this device.</p>
		</div>
		<div class="theme-grid">
			{#each THEMES as t (t)}
				<button class="theme-opt" class:sel={theme.value === t} onclick={() => theme.set(t)}>
					<span class="theme-icon"><Icon name={THEME_META[t].icon} size={18} /></span>
					{THEME_META[t].label}
					{#if theme.value === t}<span class="theme-check"><Icon name="check" size={14} /></span>{/if}
				</button>
			{/each}
		</div>
	</section>

	<!-- Passkeys -->
	<section class="card" id="passkeys">
		<div class="card-head row-between">
			<div>
				<h2>Passkeys</h2>
				<p>Sign in instantly with Face ID, Touch ID or a security key.</p>
			</div>
			<Button variant="primary" size="sm" icon="key" loading={addingPasskey} onclick={addPasskey}>
				Add passkey
			</Button>
		</div>
		{#if data.passkeys.length === 0}
			<div class="empty-list">
				<Icon name="key" size={22} />
				<p>No passkeys yet. Add one to skip the email code next time.</p>
			</div>
		{:else}
			<ul class="pk-list">
				{#each data.passkeys as pk (pk.id)}
					<li class="pk">
						<span class="pk-icon"><Icon name="key" size={16} /></span>
						<div class="pk-info">
							<span class="pk-name">{pk.name || 'Passkey'}</span>
							<span class="pk-meta">
								{pk.deviceType === 'singleDevice' ? 'This device' : 'Synced'} · Added
								{new Date(pk.createdAt ?? Date.now()).toLocaleDateString()}
							</span>
						</div>
						<button class="pk-remove" onclick={() => removePasskey(pk.id)} aria-label="Remove passkey">
							<Icon name="trash" size={15} />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Account -->
	<section class="card">
		<div class="card-head">
			<h2>Account</h2>
			<p>Sign-in methods connected to {data.user.email}.</p>
		</div>
		<div class="providers">
			<span class="prov"><Icon name="mail" size={15} /> Email code</span>
			{#if data.providers.includes('github')}
				<span class="prov"><Icon name="github" size={15} /> GitHub</span>
			{/if}
			{#if data.passkeys.length}
				<span class="prov"><Icon name="key" size={15} /> Passkey</span>
			{/if}
		</div>
		<div class="signout">
			<Button variant="outline" icon="logout" onclick={signOut}>Sign out</Button>
		</div>
	</section>
</div>

<style>
	.settings {
		max-width: 680px;
		width: 100%;
		margin: 0 auto;
		padding: var(--space-8) var(--space-6) var(--space-16);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.s-head {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-bottom: var(--space-2);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--text-muted);
		font-size: var(--text-sm);
		width: fit-content;
	}
	.back:hover {
		color: var(--text);
	}
	.s-head h1 {
		font-size: var(--text-2xl);
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
		box-shadow: var(--shadow-xs);
	}
	.card-head {
		margin-bottom: var(--space-4);
	}
	.card-head.row-between {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.card-head h2 {
		font-size: var(--text-md);
	}
	.card-head p {
		color: var(--text-muted);
		font-size: var(--text-sm);
		margin-top: 2px;
	}
	.profile {
		display: flex;
		gap: var(--space-4);
		align-items: flex-start;
	}
	.pfields {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.field > span {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text-muted);
	}
	.name-row {
		display: flex;
		gap: var(--space-2);
	}
	.field input {
		flex: 1;
		min-width: 0;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		padding: 0 var(--space-3);
		height: 38px;
		color: var(--text);
	}
	.field input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.readonly {
		color: var(--text-muted);
		background: var(--surface-inset) !important;
	}
	.theme-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-3);
	}
	.theme-opt {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		transition: all var(--transition-fast);
	}
	.theme-opt:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.theme-opt.sel {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent-text);
	}
	.theme-icon {
		display: inline-flex;
	}
	.theme-check {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		color: var(--accent);
	}
	.empty-list {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-6);
		color: var(--text-subtle);
		text-align: center;
		font-size: var(--text-sm);
	}
	.pk-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.pk {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
	.pk-icon {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		background: var(--accent-soft);
		color: var(--accent-text);
		border-radius: var(--radius-sm);
	}
	.pk-info {
		flex: 1;
		display: flex;
		flex-direction: column;
	}
	.pk-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
	}
	.pk-meta {
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}
	.pk-remove {
		display: inline-flex;
		padding: 7px;
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
	}
	.pk-remove:hover {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.providers {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}
	.prov {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: var(--space-2) var(--space-3);
		background: var(--surface-inset);
		border-radius: var(--radius-full);
		font-size: var(--text-sm);
		color: var(--text-muted);
	}
	.signout {
		border-top: 1px solid var(--border-subtle);
		padding-top: var(--space-4);
	}

	@media (max-width: 560px) {
		.theme-grid {
			grid-template-columns: 1fr;
		}
		.profile {
			flex-direction: column;
		}
	}
</style>
