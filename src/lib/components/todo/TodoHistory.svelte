<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { timeAgo } from '#lib/date';
	import {
		URGENCY_META,
		SIZE_META,
		type Todo,
		type TodoEvent,
		type TodoField,
		type Urgency,
		type Size
	} from '#lib/types';

	interface Props {
		todo: Todo;
	}
	let { todo }: Props = $props();

	let open = $state(false);
	let events = $state<TodoEvent[] | null>(null);
	let loadedFor = $state<string | null>(null);
	let failed = $state(false);

	async function load(id: string) {
		try {
			const res = await fetch(`/api/projects/${todo.projectId}/todos/${id}/history`);
			if (!res.ok) throw new Error();
			const body = (await res.json()) as { events: Record<string, unknown>[] };
			// Ignore a response for a task we've since moved away from.
			if (id !== todo.id) return;
			events = body.events.map((e) => ({
				...(e as unknown as TodoEvent),
				createdAt: new Date(e.createdAt as string)
			}));
			loadedFor = id;
			failed = false;
		} catch {
			if (id === todo.id) failed = true;
		}
	}

	// Reload whenever the task is replaced by a server-confirmed (or realtime)
	// copy, which is when a new change has been recorded. Debounced so a burst
	// of cascaded updates only fetches once.
	$effect(() => {
		if (!open) return;
		void todo;
		void todo.attachments;
		const id = todo.id;
		const fresh = untrack(() => loadedFor !== id);
		if (fresh) events = null;
		const timer = setTimeout(() => load(id), fresh ? 0 : 300);
		return () => clearTimeout(timer);
	});

	// Changes made in one request are shown together under one actor + time.
	const FIELD_ORDER: TodoField[] = [
		'created',
		'deleted',
		'restored',
		'status',
		'title',
		'description',
		'parent',
		'category',
		'assignee',
		'deadline',
		'urgency',
		'size',
		'tag',
		'image'
	];
	const groups = $derived.by(() => {
		const out: { key: string; actor: TodoEvent['actor']; at: Date; events: TodoEvent[] }[] = [];
		for (const e of events ?? []) {
			const last = out.at(-1);
			if (last && last.actor?.id === e.actor?.id && last.at.getTime() === e.createdAt.getTime())
				last.events.push(e);
			else out.push({ key: e.id, actor: e.actor, at: e.createdAt, events: [e] });
		}
		for (const g of out)
			g.events.sort((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field));
		return out;
	});

	const LABELS: Partial<Record<TodoField, string>> = {
		category: 'category',
		deadline: 'deadline',
		urgency: 'urgency',
		size: 'size'
	};

	function display(field: TodoField, v: string | null): string | null {
		if (v === null) return null;
		if (field === 'urgency') return URGENCY_META[v as Urgency]?.label ?? v;
		if (field === 'size') return SIZE_META[v as Size]?.full ?? v;
		if (field === 'deadline') {
			const d = new Date(v);
			return d.toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric',
				...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {})
			});
		}
		return v;
	}

	/** A change as a phrase: `verb`, then the new value in bold and the old one struck through. */
	function describe(e: TodoEvent): { verb: string; value?: string | null; was?: string | null } {
		const from = display(e.field, e.from);
		const to = display(e.field, e.to);
		switch (e.field) {
			case 'created':
				return { verb: 'created this task' };
			case 'deleted':
				return { verb: 'deleted this task' };
			case 'restored':
				return { verb: 'restored this task' };
			case 'status':
				if (e.to === 'done') return { verb: 'completed this task' };
				if (e.to === 'not_doing') return { verb: 'closed as not doing' };
				if (e.to === 'in_progress') return { verb: 'started work' };
				return { verb: e.from === 'in_progress' ? 'stopped work' : 'reopened this task' };
			case 'title':
				return { verb: 'renamed to', value: to, was: from };
			case 'description':
				if (!e.to) return { verb: 'cleared the notes' };
				return { verb: e.from ? 'edited the notes' : 'added notes' };
			case 'parent':
				return to ? { verb: 'moved under', value: to } : { verb: 'moved to the top level' };
			case 'assignee':
				if (!to) return { verb: 'unassigned', value: from };
				return { verb: 'assigned to', value: to, was: from };
			case 'tag':
				return to ? { verb: 'added tag', value: to } : { verb: 'removed tag', value: from };
			case 'image':
				return to ? { verb: 'added image', value: to } : { verb: 'removed image', value: from };
			default: {
				const label = LABELS[e.field] ?? e.field;
				if (!to) return { verb: `cleared ${label}`, was: from };
				if (!from) return { verb: `set ${label} to`, value: to };
				return { verb: `changed ${label} to`, value: to, was: from };
			}
		}
	}
</script>

<div class="section">
	<button class="toggle" onclick={() => (open = !open)} aria-expanded={open}>
		<span class="section-label"><Icon name="clock" size={14} /> History</span>
		<span class="chev" class:open><Icon name="chevron-right" size={14} /></span>
	</button>

	{#if open}
		{#if failed && !events}
			<p class="empty">Couldn't load history.</p>
		{:else if !events}
			<div class="empty"><Spinner size={14} /></div>
		{:else if !groups.length}
			<p class="empty">No changes recorded yet.</p>
		{:else}
			<ol class="feed">
				{#each groups as g (g.key)}
					<li class="entry">
						<Avatar name={g.actor?.name} email={g.actor?.email} image={g.actor?.image} size={20} />
						<div class="body">
							<div class="who">
								<strong>{g.actor ? g.actor.name || g.actor.email : 'Someone'}</strong>
								<time datetime={g.at.toISOString()} title={g.at.toLocaleString()}>
									{timeAgo(g.at)}
								</time>
							</div>
							<ul class="changes">
								{#each g.events as e (e.id)}
									{@const d = describe(e)}
									<li>
										{d.verb}
										{#if d.value}<span class="value">{d.value}</span>{/if}
										{#if d.was}<s class="was">{d.was}</s>{/if}
										{#if e.field === 'description' && e.from}
											<details class="prev">
												<summary>Previous notes</summary>
												<pre>{e.from}</pre>
											</details>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	{/if}
</div>

<style>
	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}
	.section-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--text-subtle);
	}
	.toggle:hover .section-label,
	.toggle:hover .chev {
		color: var(--text);
	}
	.chev {
		display: inline-flex;
		color: var(--text-faint);
		transition: transform var(--transition-fast);
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.empty {
		display: flex;
		color: var(--text-faint);
		font-size: var(--text-xs);
		padding: var(--space-1) 0;
	}
	.feed {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.entry {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
	}
	.body {
		flex: 1;
		min-width: 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}
	.who {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		line-height: 20px;
	}
	.who strong {
		color: var(--text);
		font-weight: var(--weight-medium);
	}
	.who time {
		color: var(--text-faint);
	}
	.changes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.value {
		color: var(--text);
		font-weight: var(--weight-medium);
		overflow-wrap: anywhere;
	}
	.was {
		color: var(--text-faint);
		overflow-wrap: anywhere;
	}
	.prev {
		margin-top: var(--space-1);
	}
	.prev summary {
		cursor: pointer;
		color: var(--text-subtle);
		width: fit-content;
	}
	.prev summary:hover {
		color: var(--text);
	}
	.prev pre {
		margin: var(--space-1) 0 0;
		padding: var(--space-2);
		max-height: 200px;
		overflow: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
	}
</style>
