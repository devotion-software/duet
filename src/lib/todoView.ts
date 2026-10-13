import { compareSiblings } from './todoTree';
import {
	SIZES,
	SIZE_META,
	URGENCIES,
	URGENCY_META,
	type Category,
	type Member,
	type Tag,
	type Todo
} from './types';

// Sorting, grouping and filtering of the task list. `''` stands for "no value"
// (no category, unassigned, no deadline…) wherever a filter or group key is used.

export type SortKey = 'manual' | 'deadline' | 'urgency' | 'size' | 'category' | 'assignee' | 'title' | 'created';
export type GroupKey = 'none' | 'category' | 'tag' | 'assignee' | 'deadline' | 'urgency' | 'size';
export type DeadlineBucket = 'overdue' | 'today' | 'week' | 'later' | '';
export type FilterField = 'categories' | 'tags' | 'assignees' | 'deadlines' | 'urgencies' | 'sizes';

export type ViewFilter = Record<FilterField, string[]>;

export interface ViewState {
	sort: SortKey;
	/** Flip the sort's natural direction (empty values still sink to the bottom). */
	reverse: boolean;
	group: GroupKey;
	filter: ViewFilter;
}

export const SORT_LABELS: Record<SortKey, string> = {
	manual: 'Manual',
	deadline: 'Deadline',
	urgency: 'Urgency',
	size: 'Size',
	category: 'Category',
	assignee: 'Assignee',
	title: 'Title',
	created: 'Date created'
};
export const GROUP_LABELS: Record<GroupKey, string> = {
	none: 'None',
	category: 'Category',
	tag: 'Tag',
	assignee: 'Assignee',
	deadline: 'Deadline',
	urgency: 'Urgency',
	size: 'Size'
};
export const FILTER_LABELS: Record<FilterField, string> = {
	categories: 'Category',
	tags: 'Tag',
	assignees: 'Assignee',
	deadlines: 'Deadline',
	urgencies: 'Urgency',
	sizes: 'Size'
};
export const DEADLINE_BUCKETS: { key: DeadlineBucket; label: string; color: string }[] = [
	{ key: 'overdue', label: 'Overdue', color: '#ef4444' },
	{ key: 'today', label: 'Today', color: '#f59e0b' },
	{ key: 'week', label: 'Next 7 days', color: '#0ea5e9' },
	{ key: 'later', label: 'Later', color: '#64748b' },
	{ key: '', label: 'No deadline', color: '' }
];

export function emptyFilter(): ViewFilter {
	return { categories: [], tags: [], assignees: [], deadlines: [], urgencies: [], sizes: [] };
}
export function defaultView(): ViewState {
	return { sort: 'manual', reverse: false, group: 'none', filter: emptyFilter() };
}
export function filterCount(f: ViewFilter): number {
	return Object.values(f).reduce((n, v) => n + v.length, 0);
}

/** Parse a stored view, falling back to defaults for anything missing or stale. */
export function parseView(raw: string | null): ViewState {
	const view = defaultView();
	if (!raw) return view;
	try {
		const v = JSON.parse(raw);
		if (v.sort in SORT_LABELS) view.sort = v.sort;
		if (v.group in GROUP_LABELS) view.group = v.group;
		view.reverse = !!v.reverse;
		for (const k of Object.keys(view.filter) as FilterField[])
			if (Array.isArray(v.filter?.[k])) view.filter[k] = v.filter[k].filter((x: unknown) => typeof x === 'string');
	} catch {
		/* ignore corrupt storage */
	}
	return view;
}

export function deadlineBucket(deadline: Date | null, now = new Date()): DeadlineBucket {
	if (!deadline) return '';
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const day = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate()).getTime();
	const diff = Math.round((day - today) / 86400000);
	if (diff < 0) return 'overdue';
	if (diff === 0) return 'today';
	if (diff <= 7) return 'week';
	return 'later';
}

// ── Filtering ──

export function matchesFilter(t: Todo, f: ViewFilter): boolean {
	const has = (list: string[], v: string) => !list.length || list.includes(v);
	return (
		has(f.categories, t.categoryId ?? '') &&
		has(f.assignees, t.assigneeId ?? '') &&
		has(f.urgencies, t.urgency ?? '') &&
		has(f.sizes, t.size ?? '') &&
		has(f.deadlines, deadlineBucket(t.deadline)) &&
		(!f.tags.length || (t.tags.length ? t.tags.some((x) => f.tags.includes(x.id)) : f.tags.includes('')))
	);
}

// ── Sorting ──

const SIZE_RANK = Object.fromEntries(SIZES.map((s, i) => [s, i]));

/** Sort value for a task; `null` means "no value" and always sorts last. */
function sortValue(t: Todo, key: SortKey): number | string | null {
	switch (key) {
		case 'deadline':
			return t.deadline?.getTime() ?? null;
		case 'urgency':
			// Most urgent first by default.
			return t.urgency ? -URGENCY_META[t.urgency].rank : null;
		case 'size':
			return t.size ? SIZE_RANK[t.size] : null;
		case 'category':
			return t.category?.name.toLowerCase() ?? null;
		case 'assignee':
			return t.assignee?.name.toLowerCase() ?? null;
		case 'title':
			return t.title.toLowerCase();
		case 'created':
			// Newest first by default.
			return -t.createdAt.getTime();
		case 'manual':
			return null;
	}
}

/** Comparator for siblings: open before done, then the chosen key, then manual order. */
export function viewComparator(sort: SortKey, reverse: boolean) {
	return (a: Todo, b: Todo): number => {
		if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
		if (sort === 'manual') return reverse ? -compareSiblings(a, b) : compareSiblings(a, b);
		const va = sortValue(a, sort);
		const vb = sortValue(b, sort);
		if (va !== vb) {
			if (va === null) return 1;
			if (vb === null) return -1;
			const c = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
			if (c) return reverse ? -c : c;
		}
		return compareSiblings(a, b);
	};
}

// ── Grouping ──

export interface TodoGroup {
	key: string;
	label: string;
	color: string;
	todos: Todo[];
}

export interface GroupContext {
	categories: Category[];
	tags: Tag[];
	members: Member[];
}

/** The ordered list of possible groups for a grouping, empty bucket last. */
function groupDefs(group: GroupKey, ctx: GroupContext): Omit<TodoGroup, 'todos'>[] {
	switch (group) {
		case 'category':
			return [
				...ctx.categories.map((c) => ({ key: c.id, label: c.name, color: c.color })),
				{ key: '', label: 'No category', color: '' }
			];
		case 'tag':
			return [
				...ctx.tags.map((t) => ({ key: t.id, label: t.name, color: t.color })),
				{ key: '', label: 'No tags', color: '' }
			];
		case 'assignee':
			return [
				...ctx.members.map((m) => ({ key: m.userId, label: m.name || m.email, color: '' })),
				{ key: '', label: 'Unassigned', color: '' }
			];
		case 'deadline':
			return DEADLINE_BUCKETS;
		case 'urgency':
			return [
				...[...URGENCIES].reverse().map((u) => ({ key: u, label: URGENCY_META[u].label, color: URGENCY_META[u].color })),
				{ key: '', label: 'No urgency', color: '' }
			];
		case 'size':
			return [
				...SIZES.map((s) => ({ key: s, label: SIZE_META[s].full, color: '' })),
				{ key: '', label: 'No size', color: '' }
			];
		case 'none':
			return [];
	}
}

/** Keys of the groups a task belongs to — several for a task with several tags. */
function groupKeys(t: Todo, group: GroupKey): string[] {
	switch (group) {
		case 'category':
			return [t.categoryId ?? ''];
		case 'tag':
			return t.tags.length ? t.tags.map((x) => x.id) : [''];
		case 'assignee':
			return [t.assigneeId ?? ''];
		case 'deadline':
			return [deadlineBucket(t.deadline)];
		case 'urgency':
			return [t.urgency ?? ''];
		case 'size':
			return [t.size ?? ''];
		case 'none':
			return [''];
	}
}

/**
 * Split (already sorted) tasks into groups, keeping their order within each
 * group and dropping empty groups. Grouping is by each task's own fields, so
 * callers pass top-level tasks and subtasks travel with their parent.
 */
export function groupTodos(todos: Todo[], group: GroupKey, ctx: GroupContext): TodoGroup[] {
	if (group === 'none') return [{ key: '', label: '', color: '', todos }];
	const defs = groupDefs(group, ctx);
	const byKey = new Map(defs.map((d) => [d.key, [] as Todo[]]));
	for (const t of todos) {
		// A value with no matching definition (e.g. a member who left) falls into the empty bucket.
		const targets = new Set(groupKeys(t, group).map((k) => byKey.get(k) ?? byKey.get('')!));
		for (const list of targets) list.push(t);
	}
	return defs.map((d) => ({ ...d, todos: byKey.get(d.key)! })).filter((g) => g.todos.length);
}
