<script lang="ts">
	import Icon from './Icon.svelte';

	interface QuickPick {
		label: string;
		days: number;
	}

	interface Props {
		/** yyyy-mm-dd, matching the native date input format, or null/empty for unset. */
		value?: string | null;
		placeholder?: string;
		label?: string;
		hint?: string;
		error?: string;
		size?: 'sm' | 'md' | 'lg';
		/** `field` looks like a bordered form control; `ghost` is a minimal toolbar-style trigger. */
		variant?: 'field' | 'ghost';
		/** Which side of the trigger the panel opens toward. */
		placement?: 'bottom' | 'top';
		disabled?: boolean;
		clearable?: boolean;
		quickPicks?: QuickPick[];
		onvalue?: (value: string | null) => void;
		id?: string;
		class?: string;
		'aria-label'?: string;
		/** Render just the calendar panel content, with no trigger button or popover — for embedding inside an already-open menu. */
		inline?: boolean;
	}

	let {
		value = $bindable(null),
		placeholder = 'Pick a date…',
		label,
		hint,
		error,
		size = 'md',
		variant = 'field',
		placement = 'bottom',
		disabled = false,
		clearable = true,
		quickPicks = [
			{ label: 'Today', days: 0 },
			{ label: 'Tomorrow', days: 1 },
			{ label: 'In a week', days: 7 }
		],
		onvalue,
		id,
		class: klass = '',
		'aria-label': ariaLabel,
		inline = false
	}: Props = $props();

	const generatedId = `d-${Math.random().toString(36).slice(2, 9)}`;
	const fieldId = $derived(id ?? generatedId);

	const pad = (n: number) => String(n).padStart(2, '0');
	function toInput(d: Date): string {
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}
	function fromInput(s: string): Date {
		const [y, m, d] = s.split('-').map(Number);
		return new Date(y, m - 1, d);
	}
	function addDays(n: number): string {
		const d = new Date();
		d.setDate(d.getDate() + n);
		return toInput(d);
	}

	// Matches the range MySQL's DATE/DATETIME columns accept — typed years outside
	// this (e.g. a stray "202-10-20") would otherwise round-trip as a server error.
	function isPlausibleDate(d: Date): boolean {
		if (isNaN(d.getTime())) return false;
		const y = d.getFullYear();
		return y >= 1000 && y <= 9999;
	}

	/** Accepts yyyy-mm-dd, mm/dd/yyyy, or anything `Date` can parse (e.g. "Oct 25 2026"). */
	function parseTyped(raw: string): string | null {
		const s = raw.trim();
		if (!s) return null;
		let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
		if (m) {
			const d = new Date(+m[1], +m[2] - 1, +m[3]);
			if (isPlausibleDate(d)) return toInput(d);
		}
		m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
		if (m) {
			const d = new Date(+m[3], +m[1] - 1, +m[2]);
			if (isPlausibleDate(d)) return toInput(d);
		}
		const parsed = new Date(s);
		if (isPlausibleDate(parsed)) return toInput(parsed);
		return null;
	}

	const selectedDate = $derived(value ? fromInput(value) : null);
	const today = new Date();
	const todayStr = toInput(today);

	const display = $derived(
		selectedDate
			? selectedDate.toLocaleDateString(undefined, {
					month: 'short',
					day: 'numeric',
					...(selectedDate.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {})
				})
			: placeholder
	);

	let open = $state(false);
	let viewYear = $state(today.getFullYear());
	let viewMonth = $state(today.getMonth());
	let panelEl = $state<HTMLDivElement>();
	let controlEl = $state<HTMLDivElement>();
	let inputEl = $state<HTMLInputElement>();
	let draft = $state('');
	let dirty = $state(false);
	let cancelling = false;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	const PREVIEW_DEBOUNCE_MS = 400;
	let align = $state<'left' | 'right'>('left');
	let effectivePlacement = $state(placement);

	const PANEL_WIDTH = 268;

	// Flip horizontal alignment / vertical side so the panel stays on-screen.
	// Runs once with an estimated height on open, then again once the panel has
	// actually mounted so the real height (based on quick-picks/clear-row) is used.
	function updatePosition() {
		if (!controlEl) return;
		const margin = 8;
		const rect = controlEl.getBoundingClientRect();

		align = rect.left + PANEL_WIDTH > window.innerWidth - margin ? 'right' : 'left';

		const estHeight = panelEl?.offsetHeight ?? 360;
		const spaceBelow = window.innerHeight - rect.bottom;
		const spaceAbove = rect.top;
		const needed = estHeight + margin + 6;
		if (placement === 'bottom' && spaceBelow < needed && spaceAbove > spaceBelow) {
			effectivePlacement = 'top';
		} else if (placement === 'top' && spaceAbove < needed && spaceBelow > spaceAbove) {
			effectivePlacement = 'bottom';
		} else {
			effectivePlacement = placement;
		}
	}

	$effect(() => {
		if (open && panelEl) updatePosition();
	});

	const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

	const weeks = $derived.by(() => {
		const first = new Date(viewYear, viewMonth, 1);
		const start = new Date(first);
		start.setDate(start.getDate() - first.getDay());
		const days: { date: Date; str: string; inMonth: boolean }[] = [];
		for (let i = 0; i < 42; i++) {
			const d = new Date(start);
			d.setDate(start.getDate() + i);
			days.push({ date: d, str: toInput(d), inMonth: d.getMonth() === viewMonth });
		}
		const out: (typeof days)[] = [];
		for (let i = 0; i < 42; i += 7) out.push(days.slice(i, i + 7));
		return out;
	});

	const monthLabel = $derived(
		new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
	);

	function syncViewToSelection() {
		const base = selectedDate ?? today;
		viewYear = base.getFullYear();
		viewMonth = base.getMonth();
	}

	function openPanel() {
		if (disabled || open) return;
		draft = selectedDate ? toInput(selectedDate) : '';
		dirty = false;
		syncViewToSelection();
		updatePosition();
		open = true;
	}

	// Inline mode has no trigger to call openPanel() from, so seed the
	// calendar's view month from the selection (or today) once on mount.
	$effect(() => {
		if (inline) syncViewToSelection();
	});
	function close() {
		open = false;
	}

	// A full-viewport fixed scrim would get trapped inside the bounds of any
	// ancestor that forms a containing block (backdrop-filter, transform, filter…),
	// silently breaking click-outside-to-close — Safari enforces this per spec
	// more strictly than other browsers. Walking up from the click target instead
	// is immune to ancestor stacking contexts entirely.
	function onWindowClick(e: MouseEvent) {
		if (inline || !open) return;
		const target = e.target as Node | null;
		if (controlEl?.contains(target)) return;
		if (panelEl?.contains(target)) return;
		close();
	}

	function pick(str: string) {
		value = str;
		onvalue?.(str);
		dirty = false;
		close();
	}
	function clear() {
		value = null;
		onvalue?.(null);
		dirty = false;
		close();
	}
	function shiftMonth(n: number) {
		const d = new Date(viewYear, viewMonth + n, 1);
		viewYear = d.getFullYear();
		viewMonth = d.getMonth();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	function onInputChange(e: Event) {
		draft = (e.currentTarget as HTMLInputElement).value;
		dirty = true;
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(commitDraft, PREVIEW_DEBOUNCE_MS);
	}

	function commitDraft() {
		clearTimeout(debounceTimer);
		if (cancelling) {
			cancelling = false;
			dirty = false;
			return;
		}
		if (!dirty) return;
		dirty = false;
		const trimmed = draft.trim();
		if (!trimmed) {
			if (value) {
				value = null;
				onvalue?.(null);
			}
			return;
		}
		const parsed = parseTyped(trimmed);
		if (parsed && parsed !== value) {
			value = parsed;
			onvalue?.(parsed);
			syncViewToSelection();
		}
	}

	function onInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitDraft();
			close();
			inputEl?.blur();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			clearTimeout(debounceTimer);
			cancelling = true;
			close();
		}
	}
</script>

{#snippet panelContent()}
	{#if quickPicks.length}
		<div class="quick">
			{#each quickPicks as qp (qp.label)}
				{@const str = addDays(qp.days)}
				<button type="button" class="chip" class:on={value === str} onclick={() => pick(str)}>
					{qp.label}
				</button>
			{/each}
		</div>
		<hr />
	{/if}
	<div class="cal">
		<div class="cal-head">
			<button type="button" class="nav" aria-label="Previous month" onclick={() => shiftMonth(-1)}>
				<Icon name="chevron-left" size={14} />
			</button>
			<span class="month">{monthLabel}</span>
			<button type="button" class="nav" aria-label="Next month" onclick={() => shiftMonth(1)}>
				<Icon name="chevron-right" size={14} />
			</button>
		</div>
		<div class="weekdays">
			{#each WEEKDAYS as w, i (i)}
				<span>{w}</span>
			{/each}
		</div>
		<div class="grid">
			{#each weeks as week, wi (wi)}
				{#each week as day (day.str)}
					<button
						type="button"
						class="day"
						class:muted={!day.inMonth}
						class:today={day.str === todayStr}
						class:on={day.str === value}
						onclick={() => pick(day.str)}
					>
						{day.date.getDate()}
					</button>
				{/each}
			{/each}
		</div>
	</div>
	{#if clearable && selectedDate}
		<hr />
		<button type="button" class="clear-row" onclick={clear}>
			<Icon name="x" size={14} /> Clear date
		</button>
	{/if}
{/snippet}

<svelte:window onclick={onWindowClick} onresize={() => open && updatePosition()} />

{#if inline}
	<div class="panel inline" role="dialog" aria-label={ariaLabel ?? label ?? 'Pick a date'}>
		{@render panelContent()}
	</div>
{:else}
	<div class="date-field {klass}">
		{#if label}
			<label for={fieldId}>{label}</label>
		{/if}
		<div class="date-host">
			<div
				bind:this={controlEl}
				class="control {variant} {size}"
				class:invalid={error}
				class:has-clear={clearable && selectedDate && !disabled}
				class:disabled
				class:open
			>
				<button
					type="button"
					class="icon-btn"
					tabindex="-1"
					aria-hidden="true"
					{disabled}
					onclick={() => inputEl?.focus()}
				>
					<Icon name="calendar" size={size === 'sm' ? 15 : 17} class="leading-icon" />
				</button>
				<input
					bind:this={inputEl}
					id={fieldId}
					type="text"
					class="value-input"
					role="combobox"
					aria-haspopup="dialog"
					aria-expanded={open}
					aria-controls={`${fieldId}-panel`}
					aria-label={ariaLabel ?? label}
					autocomplete="off"
					{disabled}
					placeholder={open ? 'yyyy-mm-dd' : placeholder}
					value={open ? draft : selectedDate ? display : ''}
					onfocus={openPanel}
					oninput={onInputChange}
					onkeydown={onInputKeydown}
					onblur={commitDraft}
				/>
			</div>
			{#if clearable && selectedDate && !disabled}
				<button type="button" class="clear" aria-label="Clear date" onclick={clear}>
					<Icon name="x" size={13} />
				</button>
			{/if}

			{#if open}
				<div
					id={`${fieldId}-panel`}
					class="panel {effectivePlacement} align-{align}"
					role="dialog"
					tabindex="-1"
					bind:this={panelEl}
					{onkeydown}
					aria-label={ariaLabel ?? label ?? 'Pick a date'}
				>
					{@render panelContent()}
				</div>
			{/if}
		</div>
		{#if error}
			<span class="msg error">{error}</span>
		{:else if hint}
			<span class="msg hint">{hint}</span>
		{/if}
	</div>
{/if}

<style>
	.date-field {
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
	.date-host {
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
	.control.disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.value-input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		padding: 0;
		font: inherit;
		color: inherit;
		cursor: text;
	}
	.value-input:disabled {
		cursor: not-allowed;
	}
	.value-input::placeholder {
		color: var(--text-faint);
	}
	:global(.control .leading-icon) {
		color: var(--text-subtle);
		flex-shrink: 0;
	}
	.icon-btn {
		display: flex;
		flex-shrink: 0;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.icon-btn:disabled {
		cursor: not-allowed;
	}
	.control.has-clear {
		padding-right: calc(var(--space-3) + 20px);
	}
	.clear {
		position: absolute;
		top: 50%;
		right: var(--space-2);
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
	}
	.clear:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	/* ── field variant (bordered, matches TextField / Select) ── */
	.control.field {
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-xs);
	}
	.control.field:focus-within,
	.control.field.open {
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

	/* ── ghost variant (minimal, for toolbars) ── */
	.control.ghost {
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-weight: var(--weight-medium);
	}
	.control.ghost:hover:not(.disabled),
	.control.ghost:focus-within,
	.control.ghost.open {
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
		z-index: calc(var(--z-dropdown) + 1);
		width: 268px;
		max-width: calc(100vw - 16px);
		display: flex;
		flex-direction: column;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		padding: var(--space-2);
		gap: var(--space-1);
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
	.panel.align-left {
		left: 0;
	}
	.panel.align-right {
		left: auto;
		right: 0;
	}
	.panel.inline {
		position: static;
		border: none;
		box-shadow: none;
		background: none;
		padding: 0;
		width: 100%;
	}

	.quick {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.chip {
		padding: var(--space-1) var(--space-2-5, 0.6rem);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--text-muted);
		background: var(--surface-hover);
	}
	.chip:hover {
		color: var(--text);
	}
	.chip.on {
		background: var(--accent);
		color: var(--accent-contrast, #fff);
	}

	hr {
		border: none;
		border-top: 1px solid var(--border);
		margin: var(--space-1) 0;
	}

	.cal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 var(--space-1);
	}
	.month {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--text);
	}
	.nav {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
	}
	.nav:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.weekdays,
	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
	}
	.weekdays {
		margin-top: var(--space-1);
	}
	.weekdays span {
		text-align: center;
		font-size: var(--text-xs);
		color: var(--text-faint);
		padding: var(--space-1) 0;
	}
	.day {
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 1;
		margin: 1px;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		color: var(--text);
	}
	.day:hover:not(.on) {
		background: var(--surface-hover);
	}
	.day.muted {
		color: var(--text-faint);
	}
	.day.today {
		font-weight: var(--weight-medium);
		box-shadow: inset 0 0 0 1px var(--border-strong);
	}
	.day.on {
		background: var(--accent);
		color: var(--accent-contrast, #fff);
	}

	.clear-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-2-5, 0.6rem);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		color: var(--danger);
		text-align: left;
	}
	.clear-row:hover {
		background: color-mix(in oklab, var(--danger), transparent 90%);
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
