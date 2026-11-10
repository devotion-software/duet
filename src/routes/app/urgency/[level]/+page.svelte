<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import UrgencyTaskList from '#lib/components/UrgencyTaskList.svelte';
	import { URGENCIES, URGENCY_META } from '#lib/types';

	let { data } = $props();

	const projectById = $derived(new Map(data.projects.map((p) => [p.id, p])));
	const meta = $derived(URGENCY_META[data.level]);
</script>

<svelte:head>
	<title>{meta.label} tasks · Duet</title>
</svelte:head>

<div class="page">
	<header class="head">
		<a class="back" href="/app"><Icon name="chevron-left" size={14} /> Home</a>
		<h1>
			<span class="dot" style="background: {meta.color}"></span>
			All {meta.label.toLowerCase()} tasks
		</h1>
		<p class="summary">
			{data.tasks.length} open task{data.tasks.length === 1 ? '' : 's'} across all projects
		</p>
		<nav class="levels" aria-label="Switch urgency">
			{#each URGENCIES as level (level)}
				<a
					class="level-link"
					class:active={level === data.level}
					href="/app/urgency/{level}"
				>
					<span class="level-dot" style="background: {URGENCY_META[level].color}"></span>
					{URGENCY_META[level].label}
				</a>
			{/each}
		</nav>
	</header>

	<UrgencyTaskList
		tasks={data.tasks}
		{projectById}
		dotColor={meta.color}
		emptyMessage="No {meta.label.toLowerCase()} tasks right now. 🎉"
	/>
</div>

<style>
	.page {
		width: 100%;
		max-width: 1080px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-6) var(--space-12);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-subtle);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		margin-bottom: var(--space-3);
	}
	.back:hover {
		color: var(--text);
	}
	.head h1 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-2xl);
		margin-bottom: var(--space-1);
	}
	.dot {
		width: 10px;
		height: 10px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
	}
	.summary {
		color: var(--text-subtle);
		font-size: var(--text-sm);
		margin-bottom: var(--space-4);
	}
	.levels {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.level-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		border: 1px solid var(--border);
		color: var(--text-subtle);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		transition: all var(--transition-fast);
	}
	.level-link:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.level-link.active {
		color: var(--accent-text);
		background: var(--accent-soft);
		border-color: var(--accent-border);
	}
	.level-dot {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
	}
</style>
