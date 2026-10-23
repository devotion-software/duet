<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { authClient } from '#lib/auth-client';
	import { toasts } from '#lib/components/ui/toast.svelte';
	import Modal from '#lib/components/ui/Modal.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';

	let { open = $bindable() }: { open: boolean } = $props();

	type Step = 'email' | 'otp';
	let step = $state<Step>('email');
	let email = $state('');
	let otp = $state('');
	let error = $state('');
	let sending = $state(false);
	let verifying = $state(false);
	let passkeyBusy = $state(false);
	let githubBusy = $state(false);

	const emailValid = $derived(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()));

	function reset() {
		step = 'email';
		email = '';
		otp = '';
		error = '';
	}

	async function onSignedIn() {
		reset();
		open = false;
		await invalidateAll();
	}

	async function sendOtp(e?: SubmitEvent) {
		e?.preventDefault();
		if (!emailValid || sending) return;
		error = '';
		sending = true;
		const { error: err } = await authClient.emailOtp.sendVerificationOtp({
			email: email.trim(),
			type: 'sign-in'
		});
		sending = false;
		if (err) {
			error = err.message ?? 'Could not send a code. Try again.';
			return;
		}
		step = 'otp';
		toasts.info('We sent you a 6-digit code.');
	}

	async function verifyOtp(e?: SubmitEvent) {
		e?.preventDefault();
		if (otp.trim().length < 6 || verifying) return;
		error = '';
		verifying = true;
		const { error: err } = await authClient.signIn.emailOtp({
			email: email.trim(),
			otp: otp.trim()
		});
		verifying = false;
		if (err) {
			error = err.message ?? 'That code didn’t work. Try again.';
			otp = '';
			return;
		}
		await onSignedIn();
	}

	async function signInPasskey() {
		if (passkeyBusy) return;
		passkeyBusy = true;
		const res = await authClient.signIn.passkey();
		passkeyBusy = false;
		if (res?.error) {
			toasts.error(res.error.message ?? 'No passkey available on this device.');
			return;
		}
		await onSignedIn();
	}

	async function signInGitHub() {
		if (githubBusy) return;
		githubBusy = true;
		await authClient.signIn.social({
			provider: 'github',
			callbackURL: window.location.href
		});
	}

	function resetToEmail() {
		step = 'email';
		otp = '';
		error = '';
	}
</script>

<Modal
	bind:open
	title="You've been signed out"
	subtitle="Sign back in to keep going."
	size="sm"
	onclose={reset}
>
	{#if step === 'email'}
		<div class="socials">
			<Button variant="outline" size="lg" full icon="github" loading={githubBusy} onclick={signInGitHub}>
				Continue with GitHub
			</Button>
			<Button variant="outline" size="lg" full icon="key" loading={passkeyBusy} onclick={signInPasskey}>
				Sign in with a passkey
			</Button>
		</div>

		<div class="divider"><span>or with email</span></div>

		<form onsubmit={sendOtp} class="email-form">
			<TextField
				bind:value={email}
				type="email"
				size="lg"
				icon="mail"
				placeholder="you@company.com"
				autocomplete="email"
				autofocus
				error={error || undefined}
			/>
			<Button
				type="submit"
				variant="primary"
				size="lg"
				full
				iconRight="arrow-right"
				loading={sending}
				disabled={!emailValid}
			>
				Continue with email
			</Button>
		</form>
	{:else}
		<div class="otp-head">
			<button class="back" onclick={resetToEmail} aria-label="Back">
				<Icon name="chevron-left" size={16} />
			</button>
			<p>We sent a 6-digit code to <strong>{email}</strong>.</p>
		</div>

		<form onsubmit={verifyOtp} class="otp-form">
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="otp-input"
				class:invalid={!!error}
				bind:value={otp}
				inputmode="numeric"
				autocomplete="one-time-code"
				maxlength="6"
				placeholder="······"
				aria-label="Verification code"
				autofocus
				oninput={() => {
					otp = otp.replace(/\D/g, '');
					if (otp.length === 6) verifyOtp();
				}}
			/>
			{#if error}<span class="otp-error">{error}</span>{/if}
			<Button type="submit" variant="primary" size="lg" full loading={verifying} disabled={otp.length < 6}>
				Verify & continue
			</Button>
			<button type="button" class="resend" onclick={() => sendOtp()} disabled={sending}>
				{sending ? 'Sending…' : 'Resend code'}
			</button>
		</form>
	{/if}
</Modal>

<style>
	.socials {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.divider {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: var(--space-5) 0;
		color: var(--text-faint);
		font-size: var(--text-xs);
	}
	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}
	.email-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.otp-head {
		position: relative;
		text-align: center;
		margin-bottom: var(--space-5);
	}
	.otp-head p {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
	.back {
		position: absolute;
		left: 0;
		top: 0;
		display: inline-flex;
		padding: 6px;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
	}
	.back:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.otp-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		align-items: stretch;
	}
	.otp-input {
		width: 100%;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 2rem;
		letter-spacing: 0.5em;
		padding: var(--space-4) var(--space-4) var(--space-4) calc(var(--space-4) + 0.5em);
		background: var(--surface-inset);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text);
	}
	.otp-input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.otp-input.invalid {
		border-color: var(--danger);
	}
	.otp-input::placeholder {
		color: var(--text-faint);
		letter-spacing: 0.4em;
	}
	.otp-error {
		color: var(--danger);
		font-size: var(--text-sm);
		text-align: center;
		margin-top: calc(-1 * var(--space-2));
	}
	.resend {
		color: var(--text-muted);
		font-size: var(--text-sm);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
	}
	.resend:hover:not(:disabled) {
		color: var(--text);
	}
	.resend:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
