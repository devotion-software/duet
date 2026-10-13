<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Modal from './ui/Modal.svelte';
	import Button from './ui/Button.svelte';
	import TextField from './ui/TextField.svelte';
	import { LIST_WIDTH, clampListWidth, PROJECT_COLORS, PROJECT_EMOJI, PROJECT_STYLES } from '#lib/palette';
	import { toasts } from './ui/toast.svelte';
	import Icon from './ui/Icon.svelte';
	import ProjectIcon from './ProjectIcon.svelte';
	import {
		PROJECT_STATUSES,
		ROW_FIELDS,
		ROW_FIELD_LABELS,
		type ProjectStatus,
		type RowField
	} from '#lib/types';

	interface ProjectLike {
		id?: string;
		name?: string;
		description?: string | null;
		color?: string;
		icon?: string;
		iconUrl?: string | null;
		style?: string;
		status?: ProjectStatus;
		hiddenFields?: RowField[];
		listWidth?: number;
		countSubtasks?: boolean;
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
	// An uploaded image overrides the emoji; `iconUrl` is what's shown (saved or a local preview).
	let iconFile = $state<File | null>(null);
	let iconUrl = $state<string | null>(project.iconUrl ?? null);
	let iconPicker = $state<HTMLDetailsElement>();
	let fileInput = $state<HTMLInputElement>();
	let style = $state(project.style ?? 'soft');
	let status = $state<ProjectStatus>(project.status ?? 'not_started');
	let hidden = $state<RowField[]>(project.hiddenFields ?? []);
	// Kept separately from `fullWidth` so toggling back restores the last width.
	let listWidth = $state(project.listWidth || LIST_WIDTH.default);
	let fullWidth = $state(project.listWidth === 0);
	let countSubtasks = $state(project.countSubtasks ?? true);
	let submitting = $state(false);

	// Reset form each time it opens.
	$effect(() => {
		if (open) {
			name = project.name ?? '';
			description = project.description ?? '';
			color = project.color ?? PROJECT_COLORS[0];
			icon = project.icon ?? '📋';
			// Untracked so picking a file doesn't re-run this reset.
			untrack(() => setIconFile(null));
			iconUrl = project.iconUrl ?? null;
			style = project.style ?? 'soft';
			status = project.status ?? 'not_started';
			hidden = [...(project.hiddenFields ?? [])];
			listWidth = project.listWidth || LIST_WIDTH.default;
			fullWidth = project.listWidth === 0;
			countSubtasks = project.countSubtasks ?? true;
		}
	});

	function setIconFile(file: File | null) {
		if (iconFile && iconUrl) URL.revokeObjectURL(iconUrl);
		iconFile = file;
		iconUrl = file && URL.createObjectURL(file);
	}

	function pickEmoji(e: string) {
		icon = e;
		setIconFile(null);
		if (iconPicker) iconPicker.open = false;
	}

	function onIconFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			toasts.error('Choose an image or SVG file');
			return;
		}
		setIconFile(file);
		if (iconPicker) iconPicker.open = false;
	}

	const action = $derived(mode === 'create' ? '/app?/createProject' : '/app?/updateProject');
</script>

<Modal bind:open title={mode === 'create' ? 'New project' : 'Project settings'} size="md">
	<form
		method="POST"
		{action}
		class="pform"
		enctype="multipart/form-data"
		style="--accent: {color}"
		use:enhance={({ formData }) => {
			if (iconFile) formData.set('iconFile', iconFile);
			else if (!iconUrl && project.iconUrl) formData.set('iconClear', 'true');
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
				// The action lives on /app, whose load redirects to the first project, so stay put
				// rather than letting enhance navigate to where the submission landed.
				await update({ reset: false, navigate: false });
			};
		}}
	>
		{#if mode === 'edit' && project.id}
			<input type="hidden" name="id" value={project.id} />
		{/if}
		<input type="hidden" name="color" value={color} />
		<input type="hidden" name="icon" value={icon} />
		<input type="hidden" name="style" value={style} />
		<input type="hidden" name="status" value={status} />
		{#if mode === 'edit'}
			<input type="hidden" name="listWidth" value={fullWidth ? 0 : listWidth} />
			<input type="hidden" name="countSubtasks" value={countSubtasks} />
		{/if}
		{#each hidden as f (f)}
			<input type="hidden" name="hidden" value={f} />
		{/each}

		<!-- Live preview -->
		<div class="preview project-surface style-{style}">
			<span class="prev-icon project-tile style-{style}"><ProjectIcon {icon} {iconUrl} /></span>
			<div class="prev-text">
				<strong>{name || 'Project name'}</strong>
				<small>{description || 'A short description'}</small>
			</div>
		</div>

		<div class="icon-name">
			<div class="emoji-field">
				<span class="flabel">Icon</span>
				<details class="emoji-picker" bind:this={iconPicker}>
					<summary><ProjectIcon {icon} {iconUrl} /></summary>
					<div class="emoji-menu">
						<div class="emoji-grid">
							{#each PROJECT_EMOJI as e (e)}
								<button
									type="button"
									class="emoji"
									class:sel={!iconUrl && icon === e}
									onclick={() => pickEmoji(e)}
								>
									{e}
								</button>
							{/each}
						</div>
						<div class="emoji-actions">
							<Button variant="ghost" size="sm" icon="upload" onclick={() => fileInput?.click()}>
								Upload image or SVG…
							</Button>
							{#if iconUrl}
								<Button variant="ghost" size="sm" onclick={() => setIconFile(null)}>
									Remove
								</Button>
							{/if}
						</div>
					</div>
					<input bind:this={fileInput} type="file" accept="image/*,.svg" hidden onchange={onIconFile} />
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

		<div class="field">
			<span class="flabel">Status</span>
			<div class="segmented">
				{#each PROJECT_STATUSES as s (s.value)}
					<button
						type="button"
						class="seg status-{s.value}"
						class:sel={status === s.value}
						onclick={() => (status = s.value)}
					>
						<span class="status-dot"></span>{s.label}
					</button>
				{/each}
			</div>
		</div>

		{#if mode === 'edit'}
			<div class="field">
				<label for="pd-width">List width</label>
				<div class="width-row">
					<input
						type="range"
						class="width-slider"
						aria-label="List width"
						min={LIST_WIDTH.min}
						max={LIST_WIDTH.max}
						step={LIST_WIDTH.step}
						bind:value={listWidth}
						disabled={fullWidth}
					/>
					<div class="width-input" class:disabled={fullWidth}>
						<input
							id="pd-width"
							type="number"
							min={LIST_WIDTH.min}
							max={LIST_WIDTH.max}
							bind:value={listWidth}
							onchange={() => (listWidth = clampListWidth(listWidth || LIST_WIDTH.default))}
							disabled={fullWidth}
						/>
						<span>px</span>
					</div>
					<button
						type="button"
						class="field-toggle"
						class:on={fullWidth}
						aria-pressed={fullWidth}
						onclick={() => (fullWidth = !fullWidth)}
					>
						<Icon name={fullWidth ? 'check' : 'plus'} size={12} strokeWidth={2.5} />Full width
					</button>
				</div>
			</div>

			<div class="field">
				<span class="flabel">Show on tasks</span>
				<div class="fields">
					{#each ROW_FIELDS as f (f)}
						{@const on = !hidden.includes(f)}
						<button
							type="button"
							class="field-toggle"
							class:on
							aria-pressed={on}
							onclick={() => (hidden = on ? [...hidden, f] : hidden.filter((h) => h !== f))}
						>
							<Icon name={on ? 'check' : 'plus'} size={12} strokeWidth={2.5} />{ROW_FIELD_LABELS[f]}
						</button>
					{/each}
				</div>
			</div>

			<div class="field">
				<span class="flabel">Sidebar task count</span>
				<div class="fields">
					{#each [{ value: false, label: 'Top-level tasks' }, { value: true, label: 'All tasks' }] as opt (opt.label)}
						{@const on = countSubtasks === opt.value}
						<button
							type="button"
							class="field-toggle"
							class:on
							aria-pressed={on}
							onclick={() => (countSubtasks = opt.value)}
						>
							{#if on}<Icon name="check" size={12} strokeWidth={2.5} />{/if}{opt.label}
						</button>
					{/each}
				</div>
			</div>
		{/if}

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
		border: 1px solid var(--project-border, var(--border));
	}
	.prev-icon {
		width: 44px;
		height: 44px;
		font-size: 24px;
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
	.emoji-menu {
		position: absolute;
		z-index: var(--z-dropdown);
		top: calc(100% + 6px);
		left: 0;
		width: 268px;
		padding: var(--space-2);
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
	}
	.emoji-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
	}
	.emoji-actions {
		display: flex;
		justify-content: space-between;
		margin-top: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--border);
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
	.seg.status-not_started {
		--status-color: var(--text-subtle);
	}
	.seg.status-in_progress {
		--status-color: var(--warning);
	}
	.seg.status-live {
		--status-color: var(--success);
	}
	.seg.status-archived {
		--status-color: var(--text-faint);
	}
	.status-dot {
		display: inline-block;
		width: 7px;
		height: 7px;
		margin-right: 6px;
		vertical-align: 1px;
		border-radius: var(--radius-full);
		background: var(--status-color);
	}
	.width-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.width-slider {
		flex: 1;
		min-width: 0;
		accent-color: var(--accent);
	}
	.width-slider:disabled {
		opacity: 0.4;
	}
	.width-input {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-xs);
		font-size: var(--text-sm);
		color: var(--text-subtle);
	}
	.width-input:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.width-input.disabled {
		opacity: 0.4;
	}
	.width-input input {
		width: 4.5ch;
		border: none;
		background: none;
		outline: none;
		color: var(--text);
		font: inherit;
		text-align: right;
		appearance: textfield;
		-moz-appearance: textfield;
	}
	.width-input input::-webkit-inner-spin-button,
	.width-input input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.fields {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.field-toggle {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text-subtle);
		border: 1px dashed var(--border-strong);
		transition: all var(--transition-fast);
	}
	.field-toggle:hover {
		color: var(--text);
	}
	.field-toggle.on {
		color: var(--accent-text);
		background: var(--accent-soft);
		border: 1px solid var(--accent-border);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		margin-top: var(--space-2);
	}
</style>
