/**
 * Open-task counts computed from a project page's live task list, keyed by project id.
 * The sidebar prefers these over the server-loaded counts so ticks show immediately.
 */
export const liveCounts = $state<Record<string, number>>({});
