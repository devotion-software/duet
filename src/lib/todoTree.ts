import type { Todo } from './types';

/** Siblings: open tasks first, each group in manual (sortOrder) order. */
export function compareSiblings(a: Todo, b: Todo) {
	return (
		Number(a.completed) - Number(b.completed) ||
		b.sortOrder - a.sortOrder ||
		b.createdAt.getTime() - a.createdAt.getTime()
	);
}

/**
 * Index todos by parent id, siblings sorted. Roots live under `null`; a task
 * whose parent isn't in the list (e.g. mid-sync) is treated as a root.
 */
export function buildChildren(todos: Todo[]): Map<string | null, Todo[]> {
	const ids = new Set(todos.map((t) => t.id));
	const map = new Map<string | null, Todo[]>();
	for (const t of todos) {
		const key = t.parentId && ids.has(t.parentId) ? t.parentId : null;
		const list = map.get(key) ?? [];
		list.push(t);
		map.set(key, list);
	}
	for (const list of map.values()) list.sort(compareSiblings);
	return map;
}

/** `ids` plus every descendant of them. */
export function withDescendants(todos: Todo[], ids: Iterable<string>): Set<string> {
	const children = buildChildren(todos);
	const out = new Set<string>();
	const stack = [...ids];
	while (stack.length) {
		const id = stack.pop()!;
		if (out.has(id)) continue;
		out.add(id);
		for (const c of children.get(id) ?? []) stack.push(c.id);
	}
	return out;
}

/** Ancestors of `id`, nearest first. */
export function ancestorsOf(todos: Todo[], id: string): Todo[] {
	const byId = new Map(todos.map((t) => [t.id, t]));
	const out: Todo[] = [];
	const seen = new Set([id]);
	let cur = byId.get(id)?.parentId;
	while (cur && !seen.has(cur) && byId.has(cur)) {
		const t = byId.get(cur)!;
		out.push(t);
		seen.add(cur);
		cur = t.parentId;
	}
	return out;
}

/** Depth-first walk of the subtrees under `roots`, parents before children. */
export function flattenTree(
	roots: Todo[],
	children: Map<string | null, Todo[]>,
	depth = 0
): { todo: Todo; depth: number }[] {
	return roots.flatMap((todo) => [
		{ todo, depth },
		...flattenTree(children.get(todo.id) ?? [], children, depth + 1)
	]);
}
