<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import ProjectDialog from '#lib/components/ProjectDialog.svelte';
	import ProjectIcon from '#lib/components/ProjectIcon.svelte';
	import ProjectStatusBadge from '#lib/components/ProjectStatusBadge.svelte';
	import { buildSidebar } from '#lib/sidebar';
	import { deadlineInfo } from '#lib/date';

	let { data } = $props();

	let createOpen = $state(false);

	const projectById = $derived(new Map(data.projects.map((p) => [p.id, p])));
	// Current projects in the same order as the sidebar, folders flattened.
	const projects = $derived(
		buildSidebar(data.folders, data.projects)
			.flatMap((i) => (i.type === 'folder' ? i.projectIds : [i.id]))
			.map((id) => projectById.get(id)!)
			.filter((p) => p.status !== 'archived')
	);
	const totals = $derived(
		projects.reduce(
			(t, p) => {
				const s = data.stats[p.id];
				return { open: t.open + s.open, done: t.done + s.done };
			},
			{ open: 0, done: 0 }
		)
	);

	const hour = new Date().getHours();
	const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
	const firstName = $derived((data.user.name || '').split(' ')[0]);

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<svelte:head><title>Home · Duet</title></svelte:head>

{#if data.projects.length === 0}
	<div class="empty">
		<div class="empty-card">
			<span class="emoji">🎉</span>
			<h1>Welcome to Duet</h1>
			<p>
				Projects keep your todos organised. Create your first one to start capturing tasks — give it
				a colour and make it yours.
			</p>
			<Button variant="primary" size="lg" icon="plus" onclick={() => (createOpen = true)}>
				Create your first project
			</Button>
			<ul class="hints">
				<li><Icon name="sparkles" size={15} /> Add tasks in a single keystroke</li>
				<li><Icon name="clipboard" size={15} /> Paste an existing checklist to import</li>
				<li><Icon name="users" size={15} /> Invite your team as you grow</li>
			</ul>
		</div>
	</div>
{:else}
	<div class="home">
		<header class="home-head">
			<h1>{greeting}{firstName ? `, ${firstName}` : ''}</h1>
			<p class="summary">
				{plural(totals.open, 'open task')} across {plural(projects.length, 'project')}
				· {totals.done} done
				{#if data.urgent.length}· <span class="urgent-text">{data.urgent.length} urgent</span>{/if}
			</p>
		</header>

		<section class="section">
			<h2><Icon name="alert-circle" size={16} /> Urgent</h2>
			{#if data.urgent.length}
				<ul class="urgent-list">
					{#each data.urgent as t (t.id)}
						{@const p = projectById.get(t.projectId)!}
						{@const due = deadlineInfo(t.deadline ? new Date(t.deadline) : null)}
						<li>
							<a class="urgent-row" href="/app/{p.slug}?task={t.id}" style="--accent: {p.color}">
								<span class="u-dot" title="Urgent"></span>
								<span class="u-main">
									<span class="u-title">{t.title}</span>
									{#if t.parentTitle}
										<span class="u-parent truncate">
											<Icon name="corner-down-right" size={12} />{t.parentTitle}
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
					{/each}
				</ul>
			{:else}
				<p class="none">Nothing urgent right now. 🎉</p>
			{/if}
		</section>

		<section class="section">
			<h2><Icon name="folder" size={16} /> Projects</h2>
			{#if projects.length}
				<div class="grid">
					{#each projects as p (p.id)}
						{@const s = data.stats[p.id]}
						{@const total = s.open + s.done}
						<a class="card style-{p.style}" href="/app/{p.slug}" style="--accent: {p.color}">
							<div class="card-head">
								<span class="c-icon project-tile style-{p.style}"><ProjectIcon icon={p.icon} iconUrl={p.iconUrl} /></span>
								<span class="c-name truncate">{p.name}</span>
								<ProjectStatusBadge status={p.status} />
							</div>
							{#if p.description}
								<p class="c-desc" title={p.description}>{p.description}</p>
							{/if}
							<div class="c-foot">
								<div class="stats">
									<span class="stat"><strong>{s.open}</strong> to do</span>
									<span class="stat"><strong>{s.done}</strong> done</span>
									{#if s.urgent}
										<span class="stat urgent"><strong>{s.urgent}</strong> urgent</span>
									{/if}
								</div>
								<div
									class="bar"
									role="progressbar"
									aria-label="{p.name} progress"
									aria-valuemin={0}
									aria-valuemax={total}
									aria-valuenow={s.done}
								>
									<span style="width: {total ? (s.done / total) * 100 : 0}%"></span>
								</div>
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<p class="none">All your projects are archived.</p>
			{/if}
		</section>
	</div>
{/if}

<ProjectDialog bind:open={createOpen} mode="create" />

<style>
	.empty {
		flex: 1;
		display: grid;
		place-items: center;
		padding: var(--space-8) var(--space-5);
	}
	.empty-card {
		max-width: 440px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
	}
	.emoji {
		font-size: 52px;
	}
	.empty h1 {
		font-size: var(--text-2xl);
	}
	.empty p {
		color: var(--text-muted);
		line-height: var(--leading-normal);
	}
	.hints {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-4);
		color: var(--text-subtle);
		font-size: var(--text-sm);
	}
	.hints li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		justify-content: center;
	}
	.hints :global(svg) {
		color: var(--accent);
	}

	/* Home */
	.home {
		width: 100%;
		max-width: 1080px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-6) var(--space-12);
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
	}
	.home-head h1 {
		font-size: var(--text-2xl);
		margin-bottom: var(--space-1);
	}
	.summary {
		color: var(--text-subtle);
		font-size: var(--text-sm);
	}
	.urgent-text {
		color: var(--danger);
		font-weight: var(--weight-medium);
	}
	.section h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-subtle);
		margin-bottom: var(--space-3);
	}
	.none {
		color: var(--text-subtle);
		font-size: var(--text-sm);
		padding: var(--space-4);
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius-lg);
	}

	/* Urgent tasks */
	.urgent-list {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}
	.urgent-list li + li {
		border-top: 1px solid var(--border-subtle);
	}
	.urgent-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		color: var(--text);
		font-size: var(--text-sm);
		transition: background var(--transition-fast);
	}
	.urgent-row:hover {
		background: var(--surface-hover);
	}
	.u-dot {
		width: 8px;
		height: 8px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background: var(--danger);
	}
	.u-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
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

	/* Project cards */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-4);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-xs);
		transition:
			transform var(--transition-base),
			box-shadow var(--transition-base),
			border-color var(--transition-base);
	}
	.card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
		border-color: var(--accent-border);
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.c-icon {
		width: 34px;
		height: 34px;
		font-size: 18px;
	}
	.c-name {
		flex: 1;
		min-width: 0;
		font-weight: var(--weight-semibold);
	}
	.c-desc {
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.c-foot {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.stats {
		display: flex;
		gap: var(--space-4);
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}
	.stat strong {
		font-size: var(--text-sm);
		color: var(--text);
		margin-right: 2px;
	}
	.stat.urgent,
	.stat.urgent strong {
		color: var(--danger);
	}
	.bar {
		height: 4px;
		border-radius: var(--radius-full);
		background: var(--surface-inset);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
		border-radius: inherit;
	}

	@media (max-width: 820px) {
		.home {
			padding: var(--space-5) var(--space-4) var(--space-10);
		}
		.u-project {
			max-width: 110px;
		}
	}
</style>
