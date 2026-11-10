<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import ProjectIcon from '#lib/components/ProjectIcon.svelte';
	import TitleText from '#lib/components/ui/TitleText.svelte';
	import { deadlineInfo } from '#lib/date';

	interface TaskRow {
		id: string;
		projectId: string;
		title: string;
		parentTitle: string | null;
		deadline: Date | string | null;
		startedAt: Date | string | null;
	}
	interface ProjectLink {
		slug: string;
		name: string;
		color: string;
		icon: string;
		iconUrl: string | null;
	}

	interface Props {
		tasks: TaskRow[];
		projectById: Map<string, ProjectLink>;
		/** CSS color for the leading dot — defaults to the urgency palette's danger red. */
		dotColor?: string;
		emptyMessage?: string;
	}
	let { tasks, projectById, dotColor = 'var(--danger)', emptyMessage = 'Nothing here right now.' }: Props =
		$props();
</script>

{#if tasks.length}
	<ul class="urgency-list">
		{#each tasks as t (t.id)}
			{@const p = projectById.get(t.projectId)}
			{@const due = deadlineInfo(t.deadline ? new Date(t.deadline) : null)}
			{#if p}
				<li>
					<a class="urgency-row" href="/app/{p.slug}?task={t.id}" style="--accent: {p.color}">
						<span class="u-dot" style="background: {dotColor}"></span>
						<span class="u-main">
							<span class="u-title"><TitleText text={t.title} /></span>
							{#if t.parentTitle}
								<span class="u-parent truncate">
									<Icon name="corner-down-right" size={12} /><TitleText text={t.parentTitle} />
								</span>
							{/if}
						</span>
						{#if t.startedAt}
							<span class="chip started"><Icon name="clock" size={12} />In progress</span>
						{/if}
						{#if due}
							<span class="chip deadline {due.state}">
								<Icon name="calendar" size={12} />{due.label}
							</span>
						{/if}
						<span class="u-project">
							<span class="u-icon"><ProjectIcon icon={p.icon} iconUrl={p.iconUrl} /></span>
							<span class="truncate">{p.name}</span>
						</span>
					</a>
				</li>
			{/if}
		{/each}
	</ul>
{:else}
	<p class="none">{emptyMessage}</p>
{/if}

<style>
	.urgency-list {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}
	.urgency-list li + li {
		border-top: 1px solid var(--border-subtle);
	}
	.urgency-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		color: var(--text);
		font-size: var(--text-sm);
		transition: background var(--transition-fast);
	}
	.urgency-row:hover {
		background: var(--surface-hover);
	}
	.u-dot {
		width: 8px;
		height: 8px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
	}
	.u-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.u-title {
		overflow-wrap: anywhere;
	}
	.u-parent {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		background: var(--surface-inset);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		white-space: nowrap;
	}
	.chip.started {
		color: var(--accent-text);
		background: var(--accent-soft);
	}
	.deadline.overdue {
		color: var(--danger);
		background: var(--danger-soft);
	}
	.deadline.today {
		color: var(--warning);
		background: var(--warning-soft);
	}
	.deadline.soon {
		color: var(--text);
	}
	.u-project {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 180px;
		flex-shrink: 0;
		padding: 2px var(--space-2) 2px 4px;
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--accent-text);
		background: var(--accent-soft);
	}
	.u-icon {
		display: grid;
		place-items: center;
		font-size: 12px;
	}
	.none {
		color: var(--text-subtle);
		font-size: var(--text-sm);
		padding: var(--space-4);
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius-lg);
	}
</style>
