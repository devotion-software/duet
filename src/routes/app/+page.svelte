<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import ProjectDialog from '#lib/components/ProjectDialog.svelte';

	let createOpen = $state(false);
</script>

<svelte:head><title>Duet</title></svelte:head>

<div class="empty">
	<div class="empty-card">
		<span class="emoji">🎉</span>
		<h1>Welcome to Duet</h1>
		<p>
			Projects keep your todos organised. Create your first one to start capturing tasks — give it a
			colour and make it yours.
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
	h1 {
		font-size: var(--text-2xl);
	}
	p {
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
</style>
