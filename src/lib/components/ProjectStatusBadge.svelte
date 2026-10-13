<script lang="ts">
	import { PROJECT_STATUSES, type ProjectStatus } from '#lib/types';

	let { status }: { status: ProjectStatus } = $props();

	const label = $derived(PROJECT_STATUSES.find((s) => s.value === status)?.label ?? status);
</script>

<span class="status status-{status}"><span class="dot"></span>{label}</span>

<style>
	.status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 1px var(--space-2);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		white-space: nowrap;
		color: var(--status-color);
		background: color-mix(in oklab, var(--status-color) 13%, var(--surface));
		border: 1px solid color-mix(in oklab, var(--status-color) 30%, transparent);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background: currentColor;
	}
	.status-not_started {
		--status-color: var(--text-subtle);
	}
	.status-in_progress {
		--status-color: var(--warning);
	}
	.status-live {
		--status-color: var(--success);
	}
	.status-archived {
		--status-color: var(--text-faint);
	}
</style>
