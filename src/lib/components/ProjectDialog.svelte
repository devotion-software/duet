<script lang="ts">
	import { enhance } from '$app/forms';
	import Modal from './ui/Modal.svelte';
	import Button from './ui/Button.svelte';
	import TextField from './ui/TextField.svelte';
	import { PROJECT_COLORS, PROJECT_EMOJI, PROJECT_STYLES } from '#lib/palette';
	import { toasts } from './ui/toast.svelte';

	interface ProjectLike {
		id?: string;
		name?: string;
		description?: string | null;
		color?: string;
		icon?: string;
		style?: string;
	}

	interface Props {
		open: boolean;
		mode?: 'create' | 'edit';
		project?: ProjectLike;
	}
	let { open = $bindable(), mode = 'create', project = {} }: Props = $props();

	let name = $state(project.name ?? '');
	let description = $state(project.description ?? '');
	let color = $state(project.color ?? PROJECT_COLORS[0]);
	let icon = $state(project.icon ?? '📋');
	let style = $state(project.style ?? 'soft');
	let submitting = $state(false);

	// Reset form each time it opens.
	$effect(() => {
		if (open) {
			name = project.name ?? '';
			description = project.description ?? '';
			color = project.color ?? PROJECT_COLORS[0];
			icon = project.icon ?? '📋';
			style = project.style ?? 'soft';
		}
	});

	const action = $derived(mode === 'create' ? '/app?/createProject' : '/app?/updateProject');
</script>

<Modal bind:open title={mode === 'create' ? 'New project' : 'Project settings'} size="md">
	<form
		method="POST"
		{action}
		class="pform"
		style="--accent: {color}"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				submitting = false;
				if (result.type === 'redirect') {
					open = false;
				} else if (result.type === 'success') {
					open = false;
					toasts.success(mode === 'create' ? 'Project created' : 'Project updated');
				} else if (result.type === 'failure') {
					toasts.error((result.data?.message as string) ?? 'Something went wrong');
				}
				await update({ reset: false });
			};
		}}
	>
		{#if mode === 'edit' && project.id}
			<input type="hidden" name="id" value={project.id} />
		{/if}
		<input type="hidden" name="color" value={color} />
		<input type="hidden" name="icon" value={icon} />
		<input type="hidden" name="style" value={style} />

		<!-- Live preview -->
		<div class="preview style-{style}">
			<span class="prev-icon">{icon}</span>
			<div class="prev-text">
				<strong>{name || 'Project name'}</strong>
				<small>{description || 'A short description'}</small>
			</div>
		</div>

		<div class="icon-name">
			<div class="emoji-field">
				<span class="flabel">Icon</span>
				<details class="emoji-picker">
					<summary>{icon}</summary>
					<div class="emoji-grid">
						{#each PROJECT_EMOJI as e (e)}
							<button type="button" class="emoji" class:sel={icon === e} onclick={() => (icon = e)}>
								{e}
							</button>
						{/each}
					</div>
				</details>
			</div>
			<TextField
				bind:value={name}
				name="name"
				label="Name"
				placeholder="e.g. Website redesign"
				maxlength={160}
				required
				class="grow"
			/>
		</div>

		<div class="field">
			<label for="pd-desc">Description <span class="opt">optional</span></label>
			<textarea
				id="pd-desc"
				name="description"
				bind:value={description}
				placeholder="What is this project about?"
				rows="2"
				maxlength="500"
			></textarea>
		</div>

		<div class="field">
			<span class="flabel">Colour</span>
			<div class="swatches">
				{#each PROJECT_COLORS as c (c)}
					<button
						type="button"
						class="swatch"
						class:sel={color === c}
						style="background: {c}"
						aria-label={c}
						onclick={() => (color = c)}
					></button>
				{/each}
				<label class="custom-swatch" title="Custom colour">
					<input type="color" bind:value={color} />
					<span style="background: {color}"></span>
				</label>
			</div>
		</div>

		<div class="field">
			<span class="flabel">Style</span>
			<div class="segmented">
				{#each PROJECT_STYLES as s (s.value)}
					<button
						type="button"
						class="seg"
						class:sel={style === s.value}
						onclick={() => (style = s.value)}
					>
						{s.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="actions">
			<Button variant="ghost" type="button" onclick={() => (open = false)}>Cancel</Button>
			<Button variant="primary" type="submit" loading={submitting} disabled={!name.trim()}>
				{mode === 'create' ? 'Create project' : 'Save changes'}
			</Button>
		</div>
	</form>
</Modal>

<style>
	.pform {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.preview {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
	}
	.preview.style-soft {
		background: var(--accent-soft);
		border-color: var(--accent-border);
	}
	.preview.style-solid {
		background: var(--accent);
		border-color: transparent;
	}
	.preview.style-solid strong,
	.preview.style-solid small {
		color: var(--accent-contrast);
	}
	.preview.style-solid small {
		opacity: 0.85;
	}
	.preview.style-outline {
		background: var(--surface);
		border: 2px solid var(--accent);
	}
	.preview.style-glass {
		background: color-mix(in oklab, var(--accent) 12%, var(--surface));
		backdrop-filter: blur(6px);
		border-color: var(--accent-border);
	}
	.prev-icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		font-size: 24px;
		background: color-mix(in oklab, var(--surface) 70%, transparent);
		border-radius: var(--radius-md);
	}
	.prev-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.prev-text strong {
		font-weight: var(--weight-semibold);
	}
	.prev-text small {
		color: var(--text-muted);
		font-size: var(--text-xs);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.icon-name {
		display: flex;
		gap: var(--space-3);
		align-items: flex-end;
	}
	.emoji-field .flabel,
	.field .flabel,
	.field label {
		display: block;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text-muted);
		margin-bottom: var(--space-2);
	}
	.opt {
		color: var(--text-faint);
		font-weight: var(--weight-normal);
	}
	:global(.pform .grow) {
		flex: 1;
	}
	.emoji-picker {
		position: relative;
	}
	.emoji-picker summary {
		list-style: none;
		cursor: pointer;
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		font-size: 20px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
	}
	.emoji-picker summary::-webkit-details-marker {
		display: none;
	}
	.emoji-grid {
		position: absolute;
		z-index: var(--z-dropdown);
		top: calc(100% + 6px);
		left: 0;
		width: 268px;
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
		padding: var(--space-2);
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
	}
	.emoji {
		height: 34px;
		font-size: 19px;
		border-radius: var(--radius-sm);
	}
	.emoji:hover {
		background: var(--surface-hover);
	}
	.emoji.sel {
		background: var(--accent-soft);
	}
	textarea {
		width: 100%;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		color: var(--text);
		resize: vertical;
		font-family: inherit;
		box-shadow: var(--shadow-xs);
	}
	textarea:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.swatch {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		box-shadow: 0 0 0 1px var(--border-strong);
		transition: transform var(--transition-fast);
	}
	.swatch:hover {
		transform: scale(1.12);
	}
	.swatch.sel {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--accent);
	}
	.custom-swatch {
		position: relative;
		width: 28px;
		height: 28px;
		cursor: pointer;
	}
	.custom-swatch input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.custom-swatch span {
		display: block;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		background: conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red);
		box-shadow: 0 0 0 1px var(--border-strong);
	}
	.segmented {
		display: inline-flex;
		background: var(--surface-inset);
		border-radius: var(--radius-md);
		padding: 3px;
		gap: 2px;
	}
	.seg {
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		transition: all var(--transition-fast);
	}
	.seg:hover {
		color: var(--text);
	}
	.seg.sel {
		background: var(--surface-raised);
		color: var(--text);
		box-shadow: var(--shadow-xs);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		margin-top: var(--space-2);
	}
</style>
