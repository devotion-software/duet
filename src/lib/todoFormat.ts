import { URGENCY_META, SIZE_META, isInProgress, type Todo } from './types';
import { buildChildren, flattenTree } from './todoTree';

function fmtDate(d: Date | null): string | null {
	if (!d) return null;
	return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function checklist(rows: { todo: Todo; depth: number }[], baseDepth = 0): string {
	return rows
		.map(({ todo, depth }) => `${'  '.repeat(depth - baseDepth)}- [${todo.completed ? 'x' : ' '}] ${todo.title}`)
		.join('\n');
}

/**
 * Format a whole todo as markdown for pasting into an AI chat or elsewhere.
 * Pass `all` (the project's todos) to include its subtasks as a checklist.
 */
export function formatTodoForCopy(todo: Todo, projectName?: string, all: Todo[] = []): string {
	const lines: string[] = [];
	lines.push(`# ${todo.title}`);
	const meta: string[] = [];
	if (projectName) meta.push(`**Project:** ${projectName}`);
	meta.push(`**Status:** ${todo.notDoing ? 'Not doing' : todo.completed ? 'Done' : isInProgress(todo) ? 'In progress' : 'Open'}`);
	if (todo.category) meta.push(`**Category:** ${todo.category.name}`);
	if (todo.assignee) meta.push(`**Assignee:** ${todo.assignee.name}`);
	if (todo.deadline) meta.push(`**Deadline:** ${fmtDate(todo.deadline)}`);
	if (todo.urgency) meta.push(`**Urgency:** ${URGENCY_META[todo.urgency].label}`);
	if (todo.size) meta.push(`**Size:** ${SIZE_META[todo.size].full}`);
	if (todo.tags.length) meta.push(`**Tags:** ${todo.tags.map((t) => t.name).join(', ')}`);
	if (meta.length) {
		lines.push('');
		lines.push(meta.join('  \n'));
	}
	if (todo.description?.trim()) {
		lines.push('');
		lines.push('---');
		lines.push('');
		lines.push(todo.description.trim());
	}
	const children = buildChildren(all);
	const subtasks = flattenTree(children.get(todo.id) ?? [], children, 1);
	if (subtasks.length) {
		lines.push('');
		lines.push('## Subtasks');
		lines.push('');
		lines.push(checklist(subtasks, 1));
	}
	return lines.join('\n');
}

/** Format todos as a nested markdown checklist (round-trips through the import dialog). */
export function formatTodosAsChecklist(todos: Todo[]): string {
	const children = buildChildren(todos);
	return checklist(flattenTree(children.get(null) ?? [], children));
}

/** Serialise every field of the given todos as pretty-printed JSON. */
export function formatTodosAsJson(todos: Todo[], project: { id: string; name: string }): string {
	const children = buildChildren(todos);
	const roots = children.get(null) ?? [];
	return JSON.stringify(
		{
			project: { id: project.id, name: project.name },
			exportedAt: new Date().toISOString(),
			count: todos.length,
			// Parents before children, so `parentId` always points backwards.
			todos: flattenTree(roots, children).map((r) => r.todo)
		},
		null,
		2
	);
}
