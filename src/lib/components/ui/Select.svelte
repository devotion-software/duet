<script lang="ts" module>
	export interface SelectOption {
		value: string;
		label: string;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	import Icon, { type IconName } from './Icon.svelte';

	interface Props {
		options: SelectOption[];
		value?: string | null;
		placeholder?: string;
		label?: string;
		hint?: string;
		error?: string;
		icon?: IconName;
		size?: 'sm' | 'md' | 'lg';
		/** `field` looks like a bordered form control; `ghost` is a minimal toolbar-style trigger. */
		variant?: 'field' | 'ghost';
		/** Which side of the trigger the panel opens toward. */
		placement?: 'bottom' | 'top';
		disabled?: boolean;
		searchable?: boolean;
		/** Lets the user add a new option from the search query. */
		creatable?: boolean;
		createLabel?: (query: string) => string;
		onCreate?: (
			query: string
		) => Promise<SelectOption | null | undefined> | SelectOption | null | undefined | void;
		/** Resets the visible selection after each pick — for one-shot "apply to selection" controls. */
		momentary?: boolean;
		onvalue?: (value: string | null) => void;
		id?: string;
		class?: string;
		'aria-label'?: string;
	}

	let {
		options,
		value = $bindable(null),
		placeholder = 'Select…',
		label,
		hint,
		error,
		icon,
		size = 'md',
		variant = 'field',
		placement = 'bottom',
		disabled = false,
		searchable = true,
		creatable = false,
		createLabel = (q) => `Add "${q}"`,
		onCreate,
		momentary = false,
		onvalue,
		id,
		class: klass = '',
		'aria-label': ariaLabel
	}: Props = $props();

	const generatedId = `s-${Math.random().toString(36).slice(2, 9)}`;
	const fieldId = $derived(id ?? generatedId);

	let open = $state(false);
	let query = $state('');
	let active = $state(0);
	let creating = $state(false);
	let inputEl = $state<HTMLInputElement>();
	let panelEl = $state<HTMLDivElement>();
	let triggerEl = $state<HTMLButtonElement>();
	let alignRight = $state(false);

	const selected = $derived(options.find((o) => o.value === value) ?? null);

	const filtered = $derived(
		query.trim()
			? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
			: options
	);

	const exactMatch = $derived(filtered.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()));
	const showCreate = $derived(creatable && !!onCreate && query.trim().length > 0 && !exactMatch);

	function openList() {
		if (disabled) return;
		open = true;
		query = '';
		active = 0;
		queueMicrotask(() => (searchable ? inputEl : panelEl)?.focus());
	}
	function close() {
		open = false;
		query = '';
		creating = false;
		triggerEl?.focus();
	}

	// A full-viewport fixed scrim would get trapped inside the bounds of any
	// ancestor that forms a containing block (backdrop-filter, transform, filter…),
	// silently breaking click-outside-to-close — Safari enforces this per spec
	// more strictly than other browsers. Walking up from the click target instead
	// is immune to ancestor stacking contexts entirely.
	function onWindowClick(e: MouseEvent) {
		if (!open) return;
		const target = e.target as Node | null;
		if (triggerEl?.contains(target)) return;
		if (panelEl?.contains(target)) return;
		close();
	}

	function pick(opt: SelectOption) {
		if (opt.disabled) return;
		if (!momentary) value = opt.value;
		onvalue?.(opt.value);
		close();
	}

	async function createNew() {
		const q = query.trim();
		if (!q || !onCreate || creating) return;
		creating = true;
		try {
			const opt = await onCreate(q);
			if (opt) {
				if (!momentary) value = opt.value;
				onvalue?.(opt.value);
			}
		} finally {
			creating = false;
			close();
		}
	}

	function onkeydown(e: KeyboardEvent) {
		const total = filtered.length + (showCreate ? 1 : 0);
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = total ? (active + 1) % total : 0;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = total ? (active - 1 + total) % total : 0;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (active < filtered.length) {
				const opt = filtered[active];
				if (opt) pick(opt);
			} else if (showCreate) {
				createNew();
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	// Keep the highlighted row in range whenever the filtered list changes.
	$effect(() => {
		void filtered;
		active = 0;
	});

	// Flip the panel to the right edge of the trigger when it would otherwise
	// overflow the viewport — a fixed `left: 0` anchor pushes it off-screen for
	// triggers near the right edge (e.g. in a narrow side panel).
	$effect(() => {
		if (!open || !panelEl || !triggerEl) return;
		const triggerRect = triggerEl.getBoundingClientRect();
		const panelWidth = panelEl.getBoundingClientRect().width;
		alignRight = triggerRect.left + panelWidth > window.innerWidth;
	});
</script>

<svelte:window onclick={onWindowClick} />

<div class="select-field {klass}">
	{#if label}
		<label for={fieldId}>{label}</label>
	{/if}
	<div class="select-host">
		<button
			type="button"
			bind:this={triggerEl}
			id={fieldId}
			class="control {variant} {size}"
			class:has-icon={icon}
			class:invalid={error}
			class:placeholder={!selected}
			{disabled}
			aria-haspopup="listbox"
			aria-expanded={open}
			aria-label={ariaLabel ?? label}
			onclick={() => (open ? close() : openList())}
		>
			{#if icon}
				<Icon name={icon} size={size === 'sm' ? 15 : 17} class="leading-icon" />
			{/if}
			<span class="value truncate">{selected ? selected.label : placeholder}</span>
			<Icon name="chevrons-up-down" size={13} class="chevron" />
		</button>

		{#if open}
			<div
				class="panel {placement}"
				class:align-right={alignRight}
				role="listbox"
				tabindex="-1"
				bind:this={panelEl}
				{onkeydown}
				aria-label={ariaLabel ?? label ?? 'Options'}
			>
				{#if searchable}
					<input
						bind:this={inputEl}
						bind:value={query}
						class="search"
						type="text"
						placeholder="Search…"
						aria-label="Search options"
					/>
				{/if}
				<div class="list">
					{#each filtered as opt, i (opt.value)}
						<button
							type="button"
							role="option"
							aria-selected={opt.value === value}
							class="item"
							class:active={i === active}
							class:on={opt.value === value}
							disabled={opt.disabled}
							onmouseenter={() => (active = i)}
							onclick={() => pick(opt)}
						>
							<span class="truncate">{opt.label}</span>
							{#if opt.value === value}<Icon name="check" size={14} class="tick" />{/if}
						</button>
					{:else}
						<p class="empty">No matches.</p>
					{/each}
					{#if showCreate}
						<button
							type="button"
							class="item create"
							class:active={active === filtered.length}
							onmouseenter={() => (active = filtered.length)}
							onclick={createNew}
							disabled={creating}
						>
							<Icon name="plus" size={14} />
							<span class="truncate">{createLabel(query.trim())}</span>
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
	{#if error}
		<span class="msg error">{error}</span>
	{:else if hint}
		<span class="msg hint">{hint}</span>
	{/if}
</div>

<style>
	.select-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	label {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text-muted);
	}
	.select-host {
		position: relative;
		min-width: 0;
	}

	.control {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		text-align: left;
		color: var(--text);
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast),
			background-color var(--transition-fast);
	}
	.control:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.control .value {
		flex: 1;
		min-width: 0;
	}
	.control.placeholder .value {
		color: var(--text-faint);
	}
	:global(.control .chevron) {
		flex-shrink: 0;
		color: var(--text-subtle);
	}
	:global(.control .leading-icon) {
		color: var(--text-subtle);
		flex-shrink: 0;
	}

	/* ── field variant (bordered, matches TextField) ── */
	.control.field {
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-xs);
	}
	.control.field:focus-visible,
	.control.field[aria-expanded='true'] {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.control.field.invalid {
		border-color: var(--danger);
	}
	.control.field.sm {
		padding: 0 var(--space-3);
		height: 32px;
		font-size: var(--text-sm);
	}
	.control.field.md {
		padding: 0 var(--space-3-5, 0.85rem);
		height: 40px;
	}
	.control.field.lg {
		padding: 0 var(--space-4);
		height: 48px;
		font-size: var(--text-md);
	}
	.control.field.has-icon.sm {
		padding-left: var(--space-2-5, 0.6rem);
	}

	/* ── ghost variant (minimal, for toolbars) ── */
	.control.ghost {
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-weight: var(--weight-medium);
	}
	.control.ghost:hover:not(:disabled),
	.control.ghost:focus-visible,
	.control.ghost[aria-expanded='true'] {
		outline: none;
		background: var(--surface-hover);
		color: var(--text);
	}
	.control.ghost.sm {
		height: 30px;
		padding: 0 var(--space-2);
		font-size: var(--text-sm);
		gap: 6px;
	}
	.control.ghost.md {
		height: 34px;
		padding: 0 var(--space-3);
		font-size: var(--text-sm);
	}
	.control.ghost.lg {
		height: 38px;
		padding: 0 var(--space-3);
	}
	.control.ghost .value {
		flex: initial;
	}

	.panel {
		position: absolute;
		left: 0;
		z-index: calc(var(--z-dropdown) + 1);
		width: max(220px, 100%);
		max-height: 320px;
		display: flex;
		flex-direction: column;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
	}
	.panel:focus {
		outline: none;
	}
	.panel.bottom {
		top: calc(100% + 6px);
	}
	.panel.top {
		bottom: calc(100% + 6px);
	}
	.panel.align-right {
		left: auto;
		right: 0;
	}
	.search {
		flex-shrink: 0;
		margin: var(--space-1);
		font: inherit;
		font-size: var(--text-sm);
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		padding: var(--space-1) var(--space-2);
	}
	.search:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.list {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: var(--space-1);
	}
	.item {
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
	.item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.item.active:not(:disabled) {
		background: var(--surface-hover);
	}
	.item.on {
		color: var(--accent-text);
		font-weight: var(--weight-medium);
	}
	.item .tick {
		margin-left: auto;
		flex-shrink: 0;
	}
	.item.create {
		color: var(--accent-text);
	}
	.empty {
		padding: var(--space-2) var(--space-3);
		color: var(--text-faint);
		font-size: var(--text-sm);
	}
	.msg {
		font-size: var(--text-xs);
	}
	.msg.hint {
		color: var(--text-subtle);
	}
	.msg.error {
		color: var(--danger);
	}
	.truncate {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
