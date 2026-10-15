<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Modal from './ui/Modal.svelte';
	import Button from './ui/Button.svelte';
	import TextField from './ui/TextField.svelte';
	import { LIST_WIDTH, PROJECT_COLORS, PROJECT_EMOJI } from '#lib/palette';
	import { isValidColor, isGradient } from '#lib/color';
	import {
		FONT_PRESET_OPTIONS,
		GOOGLE_FONTS,
		fontStyle,
		googleFontsHref,
		isPreset,
		isValidFont
	} from '#lib/font';
	import { toasts } from './ui/toast.svelte';
	import Icon from './ui/Icon.svelte';
	import ProjectIcon from './ProjectIcon.svelte';
	import ListWidthField from './ListWidthField.svelte';
	import Spinner from './ui/Spinner.svelte';
	import { timeAgo } from '#lib/date';
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
		accentGradient?: string | null;
		icon?: string;
		iconUrl?: string | null;
		font?: string;
		status?: ProjectStatus;
		hiddenFields?: RowField[];
		/** The project's own settings; null follows the user's account defaults. */
		listWidthSetting?: number | null;
		countSubtasksSetting?: boolean | null;
	}

	interface Props {
		open: boolean;
		mode?: 'create' | 'edit';
		project?: ProjectLike;
		/** The user's account defaults, shown against the "Default" options in edit mode. */
		defaults?: { listWidth: number; countSubtasks: boolean };
		/** Called with the tasks brought back (and any reopened ancestors) after a restore. */
		onrestore?: (todos: Record<string, unknown>[]) => void;
	}
	let {
		open = $bindable(),
		mode = 'create',
		project = {},
		defaults = { listWidth: LIST_WIDTH.default, countSubtasks: true },
		onrestore
	}: Props = $props();

	interface DeletedTodo {
		id: string;
		title: string;
		deletedAt: Date;
		deletedBy: { id: string; name: string } | null;
		subtasks: number;
	}
	let deleted = $state<DeletedTodo[] | null>(null);
	// Ids with a restore or permanent delete in flight.
	let busy = $state<string[]>([]);

	// ── Accent colour ──────────────────────────────────────────────────────────
	// `color` is the solid representative (hex/rgb/named/… — anything the browser accepts);
	// in gradient mode it's the first stop and all the derived tokens still use it. `grad*`
	// drive the gradient builder. The submitted accentGradient is empty in solid mode.
	type GradType = 'linear' | 'radial' | 'conic';
	const GRAD_TYPES: { value: GradType; label: string }[] = [
		{ value: 'linear', label: 'Linear' },
		{ value: 'radial', label: 'Radial' },
		{ value: 'conic', label: 'Conic' }
	];

	let name = $state(project.name ?? '');
	let description = $state(project.description ?? '');
	let color = $state(project.color ?? PROJECT_COLORS[0]);
	// What's typed in the free-text colour box; applied to `color` only when it's valid.
	let colorText = $state(project.color ?? PROJECT_COLORS[0]);
	let colorMode = $state<'solid' | 'gradient'>('solid');
	let gradType = $state<GradType>('linear');
	let gradAngle = $state(135);
	let gradStops = $state<string[]>(['#6366f1', '#ec4899']);
	let icon = $state(project.icon ?? '📋');
	// An uploaded image overrides the emoji; `iconUrl` is what's shown (saved or a local preview).
	let iconFile = $state<File | null>(null);
	let iconUrl = $state<string | null>(project.iconUrl ?? null);
	let iconPicker = $state<HTMLDetailsElement>();
	let fileInput = $state<HTMLInputElement>();
	// `font` is the applied value: a preset keyword or a custom family name. `fontText` is
	// what's typed in the custom box; it feeds `font` once it's a valid family.
	let font = $state(project.font ?? 'sans');
	let fontText = $state(isPreset(project.font ?? 'sans') ? '' : (project.font ?? ''));
	let status = $state<ProjectStatus>(project.status ?? 'not_started');
	let hidden = $state<RowField[]>(project.hiddenFields ?? []);
	let listWidth = $state<number | null>(project.listWidthSetting ?? null);
	let countSubtasks = $state<boolean | null>(project.countSubtasksSetting ?? null);
	let submitting = $state(false);

	type Tab = 'details' | 'appearance' | 'advanced' | 'deleted';
	let tab = $state<Tab>('details');
	const TABS: { value: Tab; label: string }[] = [
		{ value: 'details', label: 'Details' },
		{ value: 'appearance', label: 'Appearance' },
		{ value: 'advanced', label: 'Advanced' },
		{ value: 'deleted', label: 'Deleted tasks' }
	];

	const colorValid = $derived(isValidColor(colorText));
	// Empty custom box is fine (a preset is in use); a typed value must be a valid family.
	const fontValid = $derived(fontText.trim() === '' || isValidFont(fontText));
	// Load the chosen custom font while the dialog is open so the preview renders in it.
	// Debounced off `font` so typing a name letter-by-letter doesn't fire a Google Fonts
	// request (and a tab-loader flash) on every keystroke.
	let previewFont = $state(font);
	$effect(() => {
		const f = font;
		const t = setTimeout(() => (previewFont = f), 350);
		return () => clearTimeout(t);
	});
	const previewFontHref = $derived(open ? googleFontsHref([previewFont]) : null);

	/** The gradient CSS the builder currently describes. */
	const gradientCss = $derived.by(() => {
		const list = gradStops.join(', ');
		if (gradType === 'linear') return `linear-gradient(${gradAngle}deg, ${list})`;
		if (gradType === 'conic') return `conic-gradient(from ${gradAngle}deg, ${list})`;
		return `radial-gradient(circle, ${list})`;
	});

	// What actually gets submitted and previewed. In gradient mode the first stop is the
	// representative solid colour; in solid mode there's no gradient.
	const effColor = $derived(colorMode === 'gradient' ? (gradStops[0] ?? color) : color);
	const effGradient = $derived(colorMode === 'gradient' ? gradientCss : '');
	const accentStyle = $derived(
		`--accent: ${effColor};` + (effGradient ? ` --accent-gradient: ${effGradient};` : '')
	);

	/** Best-effort parse of a stored gradient back into the builder's controls. */
	function readGradient(css: string): boolean {
		const m = css.trim().match(/^(linear|radial|conic)-gradient\s*\((.*)\)$/i);
		if (!m) return false;
		const type = m[1].toLowerCase() as GradType;
		let body = m[2].trim();
		let angle = 135;
		const angleMatch = body.match(/^(?:from\s+)?(-?\d+(?:\.\d+)?)deg\s*,/i);
		if (angleMatch) {
			angle = Number(angleMatch[1]);
			body = body.slice(angleMatch[0].length);
		} else if (/^(circle|ellipse|at |closest|farthest)/i.test(body)) {
			// Drop a radial shape/position prefix we don't expose, up to the first comma.
			body = body.replace(/^[^,]*,/, '');
		}
		// Split on top-level commas so colours like rgb(…) stay intact, then drop any trailing
		// "position" (e.g. `#fff 50%`) while keeping function colours that contain spaces.
		const stops = splitTopLevel(body)
			.map((s) => s.trim().replace(/\s+-?[\d.]+(?:%|px|em|rem|vh|vw|vmin|vmax)?$/, ''))
			.filter((s) => isValidColor(s));
		if (stops.length < 2) return false;
		gradType = type;
		gradAngle = angle;
		gradStops = stops;
		return true;
	}

	function splitTopLevel(s: string): string[] {
		const out: string[] = [];
		let depth = 0;
		let start = 0;
		for (let i = 0; i < s.length; i++) {
			const c = s[i];
			if (c === '(') depth++;
			else if (c === ')') depth--;
			else if (c === ',' && depth === 0) {
				out.push(s.slice(start, i));
				start = i + 1;
			}
		}
		out.push(s.slice(start));
		return out;
	}

	function addStop() {
		if (gradStops.length < 6) gradStops = [...gradStops, gradStops.at(-1) ?? '#6366f1'];
	}
	function removeStop(i: number) {
		if (gradStops.length > 2) gradStops = gradStops.filter((_, j) => j !== i);
	}
	function setStop(i: number, value: string) {
		gradStops = gradStops.map((s, j) => (j === i ? value : s));
	}

	/** Select a built-in font preset, clearing any typed custom family. */
	function pickFontPreset(value: string) {
		font = value;
		fontText = '';
	}

	/** Apply the typed custom family to `font` once it's valid. */
	function onFontInput(value: string) {
		fontText = value;
		const trimmed = value.trim();
		if (trimmed && isValidFont(trimmed)) font = trimmed.replace(/\s+/g, ' ');
	}

	/** Apply a preset / native-picker / typed solid colour, switching back to solid mode. */
	function pickSolid(value: string) {
		color = value;
		colorText = value;
		colorMode = 'solid';
	}

	// Reset form each time it opens.
	$effect(() => {
		if (open) {
			tab = 'details';
			name = project.name ?? '';
			description = project.description ?? '';
			color = project.color ?? PROJECT_COLORS[0];
			colorText = project.color ?? PROJECT_COLORS[0];
			// Restore the gradient builder from a stored gradient, else reset it to defaults
			// so a previously-opened project's stops don't linger.
			const restored =
				!!project.accentGradient &&
				isGradient(project.accentGradient) &&
				untrack(() => readGradient(project.accentGradient!));
			if (restored) {
				colorMode = 'gradient';
			} else {
				colorMode = 'solid';
				gradType = 'linear';
				gradAngle = 135;
				gradStops = [project.color ?? PROJECT_COLORS[0], '#ec4899'];
			}
			icon = project.icon ?? '📋';
			// Untracked so picking a file doesn't re-run this reset.
			untrack(() => setIconFile(null));
			iconUrl = project.iconUrl ?? null;
			// Use a local, not the `font` state, so this reset effect doesn't take a
			// dependency on `font` (which would re-run the whole reset on every keystroke).
			const initialFont = project.font ?? 'sans';
			font = initialFont;
			fontText = isPreset(initialFont) ? '' : initialFont;
			status = project.status ?? 'not_started';
			hidden = [...(project.hiddenFields ?? [])];
			listWidth = project.listWidthSetting ?? null;
			countSubtasks = project.countSubtasksSetting ?? null;
			deleted = null;
			if (mode === 'edit' && project.id) untrack(() => loadDeleted(project.id!));
		}
	});

	async function deletedApi(url: string, init?: RequestInit) {
		const res = await fetch(url, init);
		if (!res.ok) {
			let message = 'Something went wrong';
			try {
				message = (await res.json()).message ?? message;
			} catch {
				/* ignore */
			}
			throw new Error(message);
		}
		return res.json();
	}

	async function loadDeleted(projectId: string) {
		try {
			const { todos } = await deletedApi(`/api/projects/${projectId}/todos/deleted`);
			deleted = (todos as (DeletedTodo & { deletedAt: string })[]).map((t) => ({
				...t,
				deletedAt: new Date(t.deletedAt)
			}));
		} catch (e) {
			deleted = [];
			toasts.error((e as Error).message);
		}
	}

	async function restore(t: DeletedTodo) {
		busy = [...busy, t.id];
		try {
			const { todos } = await deletedApi(`/api/projects/${project.id}/todos/deleted/${t.id}`, {
				method: 'POST'
			});
			deleted = deleted?.filter((d) => d.id !== t.id) ?? null;
			onrestore?.(todos);
			toasts.success(`Restored “${t.title}”`);
		} catch (e) {
			toasts.error((e as Error).message);
		} finally {
			busy = busy.filter((id) => id !== t.id);
		}
	}

	async function purge(t: DeletedTodo) {
		const what = t.subtasks
			? `“${t.title}” and its ${t.subtasks} subtask${t.subtasks === 1 ? '' : 's'}`
			: `“${t.title}”`;
		if (!confirm(`Permanently delete ${what}? This cannot be undone.`)) return;
		busy = [...busy, t.id];
		try {
			await deletedApi(`/api/projects/${project.id}/todos/deleted/${t.id}`, { method: 'DELETE' });
			deleted = deleted?.filter((d) => d.id !== t.id) ?? null;
		} catch (e) {
			toasts.error((e as Error).message);
		} finally {
			busy = busy.filter((id) => id !== t.id);
		}
	}

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

<svelte:head>
	{#if previewFontHref}
		<link rel="preconnect" href="https://fonts.googleapis.com" />
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
		<link rel="stylesheet" href={previewFontHref} />
	{/if}
</svelte:head>

<Modal bind:open title={mode === 'create' ? 'New project' : 'Project settings'} size="xl">
	<form
		method="POST"
		{action}
		class="pform"
		enctype="multipart/form-data"
		style={accentStyle}
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
		<input type="hidden" name="color" value={effColor} />
		<input type="hidden" name="accentGradient" value={effGradient} />
		<input type="hidden" name="icon" value={icon} />
		<input type="hidden" name="font" value={font} />
		<input type="hidden" name="status" value={status} />
		{#if tab !== 'details'}
			<input type="hidden" name="name" value={name} />
			<input type="hidden" name="description" value={description} />
		{/if}
		{#if mode === 'edit'}
			<input type="hidden" name="listWidth" value={listWidth ?? ''} />
			<input type="hidden" name="countSubtasks" value={countSubtasks ?? 'default'} />
		{/if}
		{#each hidden as f (f)}
			<input type="hidden" name="hidden" value={f} />
		{/each}

		<!-- Live preview -->
		<div class="preview project-surface" style={fontStyle(font)}>
			<span class="prev-icon project-tile"><ProjectIcon {icon} {iconUrl} /></span>
			<div class="prev-text">
				<strong>{name || 'Project name'}</strong>
				<small>{description || 'A short description'}</small>
			</div>
		</div>

		<div class="tabs" role="tablist">
			{#each TABS as t (t.value)}
				{#if t.value === 'details' || t.value === 'appearance' || mode === 'edit'}
					<button
						type="button"
						role="tab"
						class="tab"
						class:sel={tab === t.value}
						aria-selected={tab === t.value}
						onclick={() => (tab = t.value)}
					>
						{t.label}
					</button>
				{/if}
			{/each}
		</div>

		{#if tab === 'details'}
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
				autofocus={mode === 'create'}
				class="grow"
			/>
		</div>

		<div class="field wide">
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

		<div class="field wide">
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
		{/if}

		{#if tab === 'appearance'}
		<div class="field wide">
			<span class="flabel">Colour</span>
			<div class="segmented mode-tabs">
				<button
					type="button"
					class="seg"
					class:sel={colorMode === 'solid'}
					onclick={() => (colorMode = 'solid')}
				>
					Solid
				</button>
				<button
					type="button"
					class="seg"
					class:sel={colorMode === 'gradient'}
					onclick={() => (colorMode = 'gradient')}
				>
					Gradient
				</button>
			</div>

			{#if colorMode === 'solid'}
				<div class="swatches">
					{#each PROJECT_COLORS as c (c)}
						<button
							type="button"
							class="swatch"
							class:sel={color === c}
							style="background: {c}"
							aria-label={c}
							onclick={() => pickSolid(c)}
						></button>
					{/each}
				</div>
				<div class="color-text" class:invalid={!colorValid}>
					<label class="custom-swatch" title="Current colour · click to pick">
						<input
							type="color"
							value={isValidColor(color) ? color : '#6366f1'}
							oninput={(e) => pickSolid(e.currentTarget.value)}
						/>
						<span style="background: {color}"></span>
					</label>
					<input
						type="text"
						value={colorText}
						spellcheck="false"
						autocapitalize="off"
						autocomplete="off"
						placeholder="#6366f1, rgb(99 102 241), rebeccapurple, oklch(…)"
						aria-label="Custom colour value"
						oninput={(e) => {
							colorText = e.currentTarget.value;
							if (isValidColor(colorText)) color = colorText.trim();
						}}
					/>
					<span class="color-status">{colorValid ? 'Valid' : 'Invalid'}</span>
				</div>
			{:else}
				<div class="grad">
					<div class="segmented grad-types">
						{#each GRAD_TYPES as t (t.value)}
							<button
								type="button"
								class="seg"
								class:sel={gradType === t.value}
								onclick={() => (gradType = t.value)}
							>
								{t.label}
							</button>
						{/each}
					</div>

					{#if gradType !== 'radial'}
						<label class="angle">
							<span>Angle <small>{gradAngle}°</small></span>
							<input type="range" min="0" max="360" step="1" bind:value={gradAngle} />
						</label>
					{/if}

					<div class="stops">
						{#each gradStops as stop, i (i)}
							<div class="stop">
								<label class="stop-swatch" title="Stop {i + 1}">
									<input
										type="color"
										value={stop}
										oninput={(e) => setStop(i, e.currentTarget.value)}
									/>
									<span style="background: {stop}"></span>
								</label>
								{#if gradStops.length > 2}
									<button
										type="button"
										class="stop-remove"
										aria-label="Remove stop {i + 1}"
										onclick={() => removeStop(i)}
									>
										<Icon name="x" size={13} strokeWidth={2.5} />
									</button>
								{/if}
							</div>
						{/each}
						{#if gradStops.length < 6}
							<button type="button" class="stop-add" aria-label="Add stop" onclick={addStop}>
								<Icon name="plus" size={15} strokeWidth={2.5} />
							</button>
						{/if}
					</div>

					<div class="grad-preview" style="background: {gradientCss}"></div>
				</div>
			{/if}
		</div>

		<div class="field wide">
			<span class="flabel">Font</span>
			<div class="segmented">
				{#each FONT_PRESET_OPTIONS as f (f.value)}
					<button
						type="button"
						class="seg"
						class:sel={font === f.value}
						style={fontStyle(f.value)}
						onclick={() => pickFontPreset(f.value)}
					>
						{f.label}
					</button>
				{/each}
			</div>
			<div class="font-text" class:invalid={!fontValid}>
				<input
					type="text"
					value={fontText}
					list="pd-google-fonts"
					spellcheck="false"
					autocapitalize="off"
					autocomplete="off"
					placeholder="Any font name — Google Fonts or one you have installed"
					aria-label="Custom font family"
					oninput={(e) => onFontInput(e.currentTarget.value)}
				/>
				{#if fontText.trim()}
					<span class="font-status">{fontValid ? 'Valid' : 'Invalid'}</span>
				{/if}
			</div>
			<datalist id="pd-google-fonts">
				{#each GOOGLE_FONTS as g (g)}
					<option value={g}></option>
				{/each}
			</datalist>
			<p class="font-hint">
				Pick a preset, or type any font — popular Google Fonts suggest as you type and load
				automatically.
			</p>
		</div>
		{/if}

		{#if tab === 'advanced' && mode === 'edit'}
			<div class="field">
				<label for="pd-width">List width</label>
				<ListWidthField id="pd-width" bind:value={listWidth} defaultWidth={defaults.listWidth} />
			</div>

			<div class="field wide">
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

			<div class="field wide">
				<span class="flabel">Sidebar task count</span>
				<div class="fields">
					{#each [{ value: null, label: 'Default' }, { value: false, label: 'Top-level tasks' }, { value: true, label: 'All tasks' }] as opt (opt.label)}
						{@const on = countSubtasks === opt.value}
						<button
							type="button"
							class="field-toggle"
							class:on
							aria-pressed={on}
							title={opt.value === null
								? `Your account default: ${defaults.countSubtasks ? 'all tasks' : 'top-level tasks'}`
								: undefined}
							onclick={() => (countSubtasks = opt.value)}
						>
							{#if on}<Icon name="check" size={12} strokeWidth={2.5} />{/if}{opt.label}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if tab === 'deleted' && mode === 'edit'}
			<div class="field wide">
				{#if deleted === null}
					<div class="deleted-empty"><Spinner /></div>
				{:else if !deleted.length}
					<p class="deleted-empty">No deleted tasks.</p>
				{:else}
					<ul class="deleted">
						{#each deleted as t (t.id)}
							{@const working = busy.includes(t.id)}
							<li>
								<div class="deleted-text">
									<span class="deleted-title">{t.title}</span>
									<small>
										Deleted {timeAgo(t.deletedAt)}{t.deletedBy ? ` by ${t.deletedBy.name}` : ''}{t.subtasks
											? ` · ${t.subtasks} subtask${t.subtasks === 1 ? '' : 's'}`
											: ''}
									</small>
								</div>
								<Button
									type="button"
									variant="secondary"
									size="sm"
									icon="corner-up-left"
									disabled={working}
									onclick={() => restore(t)}
								>
									Restore
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									icon="trash"
									aria-label="Delete permanently"
									title="Delete permanently"
									disabled={working}
									onclick={() => purge(t)}
								/>
							</li>
						{/each}
					</ul>
				{/if}
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
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: start;
		gap: var(--space-4);
	}
	/* Full-bleed rows: preview, tabs, icon + name, free-flowing toggle groups, actions. */
	.preview,
	.tabs,
	.icon-name,
	.field.wide,
	.actions {
		grid-column: 1 / -1;
	}
	.tabs {
		display: flex;
		gap: var(--space-1);
		border-bottom: 1px solid var(--border-subtle);
		margin-bottom: var(--space-1);
	}
	.tab {
		padding: var(--space-2) var(--space-1);
		margin-bottom: -1px;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text-muted);
		border-bottom: 2px solid transparent;
		transition: all var(--transition-fast);
	}
	.tab:hover {
		color: var(--text);
	}
	.tab.sel {
		color: var(--text);
		border-bottom-color: var(--accent);
	}
	.tabs .tab + .tab {
		margin-left: var(--space-3);
	}

	@media (max-width: 640px) {
		.pform {
			grid-template-columns: minmax(0, 1fr);
		}
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
		flex-shrink: 0;
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
	.mode-tabs {
		margin-bottom: var(--space-3);
	}
	/* Free-text colour input with a live valid/invalid badge. */
	.color-text {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.color-text input {
		flex: 1;
		min-width: 0;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		color: var(--text);
		font-family: var(--font-mono, monospace);
		font-size: var(--text-sm);
		box-shadow: var(--shadow-xs);
	}
	.color-text input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.color-text.invalid input {
		border-color: var(--danger);
	}
	.color-status {
		flex-shrink: 0;
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--success);
	}
	.color-text.invalid .color-status {
		color: var(--danger);
	}
	.font-text {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.font-text input {
		flex: 1;
		min-width: 0;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		color: var(--text);
		font-size: var(--text-sm);
		box-shadow: var(--shadow-xs);
	}
	.font-text input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.font-text.invalid input {
		border-color: var(--danger);
	}
	.font-status {
		flex-shrink: 0;
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--success);
	}
	.font-text.invalid .font-status {
		color: var(--danger);
	}
	.font-hint {
		margin: var(--space-2) 0 0;
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}
	.grad {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.angle {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-sm);
		color: var(--text-muted);
	}
	.angle small {
		color: var(--text-subtle);
	}
	.angle input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
	}
	.stops {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.stop {
		position: relative;
		display: inline-flex;
	}
	.stop-swatch {
		position: relative;
		width: 36px;
		height: 36px;
		cursor: pointer;
	}
	.stop-swatch input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.stop-swatch span {
		display: block;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-md);
		box-shadow: 0 0 0 1px var(--border-strong);
	}
	.stop-remove {
		position: absolute;
		top: -6px;
		right: -6px;
		display: grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border-radius: var(--radius-full);
		background: var(--surface-raised);
		color: var(--text-muted);
		box-shadow: 0 0 0 1px var(--border-strong);
	}
	.stop-remove:hover {
		color: var(--danger);
	}
	.stop-add {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-md);
		color: var(--text-muted);
		border: 1px dashed var(--border-strong);
	}
	.stop-add:hover {
		color: var(--text);
		border-color: var(--text-faint);
	}
	.grad-preview {
		height: 48px;
		border-radius: var(--radius-md);
		box-shadow: inset 0 0 0 1px var(--border-strong);
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
	.deleted {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 240px;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
	.deleted li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
	}
	.deleted li + li {
		border-top: 1px solid var(--border);
	}
	.deleted-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.deleted-title {
		font-size: var(--text-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.deleted-text small {
		color: var(--text-subtle);
		font-size: var(--text-xs);
	}
	.deleted-empty {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-subtle);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		margin-top: var(--space-2);
	}
</style>
