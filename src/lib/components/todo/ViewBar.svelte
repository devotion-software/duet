<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import {
		DEADLINE_BUCKETS,
		FILTER_LABELS,
		GROUP_LABELS,
		SORT_LABELS,
		defaultView,
		emptyFilter,
		filterCount,
		type FilterField,
		type GroupKey,
		type SortKey,
		type ViewState
	} from '#lib/todoView';
	import {
		SIZES,
		SIZE_META,
		URGENCIES,
		URGENCY_META,
		type Category,
		type Member,
		type Tag
	} from '#lib/types';

	interface Props {
		view: ViewState;
		categories: Category[];
		tags: Tag[];
		members: Member[];
	}
	let { view = $bindable(), categories, tags, members }: Props = $props();

	let popover = $state<'sort' | 'group' | 'filter' | null>(null);
	function toggle(p: typeof popover) {
		popover = popover === p ? null : p;
	}

	type Option = { value: string; label: string; color?: string };
	const options = $derived<Record<FilterField, Option[]>>({
		categories: [
			...categories.map((c) => ({ value: c.id, label: c.name, color: c.color })),
			{ value: '', label: 'No category' }
		],
		tags: [...tags.map((t) => ({ value: t.id, label: t.name, color: t.color })), { value: '', label: 'No tags' }],
		assignees: [
			...members.map((m) => ({ value: m.userId, label: m.name || m.email })),
			{ value: '', label: 'Unassigned' }
		],
		deadlines: DEADLINE_BUCKETS.map((b) => ({ value: b.key, label: b.label, color: b.color || undefined })),
		urgencies: [
			...[...URGENCIES].reverse().map((u) => ({ value: u, label: URGENCY_META[u].label, color: URGENCY_META[u].color })),
			{ value: '', label: 'No urgency' }
		],
		sizes: [...SIZES.map((s) => ({ value: s, label: SIZE_META[s].full })), { value: '', label: 'No size' }]
	});
	const FIELDS = Object.keys(FILTER_LABELS) as FilterField[];

	const activeFilters = $derived(filterCount(view.filter));
	/** One chip per active filter value, labelled from the current options. */
	const chips = $derived(
		FIELDS.flatMap((field) =>
			view.filter[field].map((value) => ({
				field,
				value,
				label: options[field].find((o) => o.value === value)?.label ?? 'Unknown'
			}))
		)
	);
	const customised = $derived(
		view.sort !== 'manual' || view.reverse || view.group !== 'none' || activeFilters > 0
	);

	function setSort(sort: SortKey) {
		// Picking the active sort again flips its direction.
		if (view.sort === sort && sort !== 'manual') view.reverse = !view.reverse;
		else {
			view.sort = sort;
			view.reverse = false;
		}
	}
	function setGroup(group: GroupKey) {
		view.group = group;
		popover = null;
	}
	function toggleFilter(field: FilterField, value: string) {
		const list = view.filter[field];
		view.filter[field] = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
	}
	function reset() {
		view = defaultView();
		popover = null;
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && popover && (popover = null)} />

<div class="viewbar" role="toolbar" aria-label="Sort, group and filter tasks">
	<div class="pop-host">
		<button class="ctl" class:active={view.sort !== 'manual'} class:on={popover === 'sort'} onclick={() => toggle('sort')}>
			<Icon name="chevrons-up-down" size={14} />
			Sort{#if view.sort !== 'manual'}: <strong>{SORT_LABELS[view.sort]}{view.reverse ? ' ↑' : ''}</strong>{/if}
		</button>
		{#if popover === 'sort'}
			<button class="scrim" aria-label="Close" onclick={() => (popover = null)}></button>
			<div class="pop">
				{#each Object.keys(SORT_LABELS) as SortKey[] as key (key)}
					<button class="pop-item" class:current={view.sort === key} onclick={() => setSort(key)}>
						<span class="tick">{#if view.sort === key}<Icon name="check" size={13} strokeWidth={2.5} />{/if}</span>
						{SORT_LABELS[key]}
					</button>
				{/each}
				<hr />
				<label class="pop-item">
					<input type="checkbox" bind:checked={view.reverse} />
					Reverse order
				</label>
			</div>
		{/if}
	</div>

	<div class="pop-host">
		<button class="ctl" class:active={view.group !== 'none'} class:on={popover === 'group'} onclick={() => toggle('group')}>
			<Icon name="menu" size={14} />
			Group{#if view.group !== 'none'}: <strong>{GROUP_LABELS[view.group]}</strong>{/if}
		</button>
		{#if popover === 'group'}
			<button class="scrim" aria-label="Close" onclick={() => (popover = null)}></button>
			<div class="pop">
				{#each Object.keys(GROUP_LABELS) as GroupKey[] as key (key)}
					<button class="pop-item" class:current={view.group === key} onclick={() => setGroup(key)}>
						<span class="tick">{#if view.group === key}<Icon name="check" size={13} strokeWidth={2.5} />{/if}</span>
						{GROUP_LABELS[key]}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="pop-host">
		<button class="ctl" class:active={activeFilters > 0} class:on={popover === 'filter'} onclick={() => toggle('filter')}>
			<Icon name="filter" size={14} />
			Filter{#if activeFilters}<span class="badge">{activeFilters}</span>{/if}
		</button>
		{#if popover === 'filter'}
			<button class="scrim" aria-label="Close" onclick={() => (popover = null)}></button>
			<div class="pop filter">
				{#each FIELDS as field (field)}
					<div class="section">
						<div class="section-head">
							{FILTER_LABELS[field]}
							{#if view.filter[field].length}
								<button class="link" onclick={() => (view.filter[field] = [])}>Clear</button>
							{/if}
						</div>
						{#each options[field] as opt (opt.value)}
							{@const on = view.filter[field].includes(opt.value)}
							<button class="pop-item" onclick={() => toggleFilter(field, opt.value)} aria-pressed={on}>
								<span class="box" class:all={on}>
									{#if on}<Icon name="check" size={11} strokeWidth={3} />{/if}
								</span>
								{#if opt.color}<span class="swatch" style="--c: {opt.color}"></span>{/if}
								<span class="truncate" class:muted={!opt.value}>{opt.label}</span>
							</button>
						{/each}
					</div>
				{/each}
				{#if activeFilters}
					<hr />
					<button class="pop-item" onclick={() => (view.filter = emptyFilter())}>
						<Icon name="x" size={14} /> Clear all filters
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#each chips as chip (chip.field + ':' + chip.value)}
		<button
			class="chip"
			title="Remove filter"
			onclick={() => toggleFilter(chip.field, chip.value)}
		>
			<span class="chip-field">{FILTER_LABELS[chip.field]}:</span>
			{chip.label}
			<Icon name="x" size={12} />
		</button>
	{/each}

	{#if customised}
		<button class="reset" onclick={reset}>Reset view</button>
	{/if}
</div>

<style>
	.viewbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
		font-size: var(--text-sm);
	}
	.ctl {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 28px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--text-subtle);
		font-weight: var(--weight-medium);
		transition: all var(--transition-fast);
	}
	.ctl:hover,
	.ctl.on {
		background: var(--surface-hover);
		color: var(--text);
	}
	.ctl.active {
		color: var(--accent-text);
	}
	.ctl strong {
		font-weight: var(--weight-semibold);
	}
	.badge {
		display: inline-grid;
		place-items: center;
		min-width: 17px;
		height: 17px;
		padding: 0 4px;
		border-radius: var(--radius-full);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 11px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 24px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-full);
		background: var(--accent-soft);
		border: 1px solid var(--accent-border);
		color: var(--text);
		font-size: var(--text-xs);
	}
	.chip:hover {
		border-color: var(--accent);
	}
	.chip-field {
		color: var(--text-subtle);
	}
	.reset {
		height: 28px;
		padding: 0 var(--space-2);
		color: var(--text-subtle);
		border-radius: var(--radius-sm);
	}
	.reset:hover {
		color: var(--text);
		background: var(--surface-hover);
	}

	.pop-host {
		position: relative;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: var(--z-dropdown);
		cursor: default;
	}
	.pop {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: calc(var(--z-dropdown) + 1);
		min-width: 190px;
		max-height: min(420px, 70vh);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1px;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		padding: var(--space-1);
	}
	.pop.filter {
		min-width: 230px;
	}
	.pop hr {
		margin: var(--space-1) 0;
		border-color: var(--border-subtle);
	}
	.section + .section {
		margin-top: var(--space-1);
		padding-top: var(--space-1);
		border-top: 1px solid var(--border-subtle);
	}
	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-1) var(--space-3);
		color: var(--text-faint);
		font-size: 11px;
		font-weight: var(--weight-medium);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.link {
		color: var(--accent-text);
		text-transform: none;
		letter-spacing: 0;
	}
	.pop-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: 6px var(--space-3);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		color: var(--text);
		text-align: left;
		cursor: pointer;
	}
	.pop-item:hover {
		background: var(--surface-hover);
	}
	.pop-item.current {
		font-weight: var(--weight-medium);
	}
	.tick {
		display: inline-flex;
		width: 13px;
		color: var(--accent-text);
	}
	.muted {
		color: var(--text-subtle);
	}
	.box {
		display: grid;
		place-items: center;
		width: 15px;
		height: 15px;
		flex-shrink: 0;
		border: 1.5px solid var(--border-strong);
		border-radius: 4px;
		color: var(--accent-contrast);
	}
	.box.all {
		background: var(--accent);
		border-color: var(--accent);
	}
	.swatch {
		width: 8px;
		height: 8px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background: var(--c);
	}
</style>
