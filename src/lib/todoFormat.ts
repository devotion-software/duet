import { URGENCY_META, SIZE_META, type Todo } from './types';

function fmtDate(d: Date | null): string | null {
	if (!d) return null;
	return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Format a whole todo as markdown for pasting into an AI chat or elsewhere. */
export function formatTodoForCopy(todo: Todo, projectName?: string): string {
	const lines: string[] = [];
	lines.push(`# ${todo.title}`);
	const meta: string[] = [];
	if (projectName) meta.push(`**Project:** ${projectName}`);
	meta.push(`**Status:** ${todo.completed ? 'Done' : 'Open'}`);
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
	return lines.join('\n');
}

/** Format todos as a markdown checklist (round-trips through the import dialog). */
export function formatTodosAsChecklist(todos: Todo[]): string {
	return todos.map((t) => `- [${t.completed ? 'x' : ' '}] ${t.title}`).join('\n');
}

/** Serialise every field of the given todos as pretty-printed JSON. */
export function formatTodosAsJson(todos: Todo[], project: { id: string; name: string }): string {
	return JSON.stringify(
		{
			project: { id: project.id, name: project.name },
			exportedAt: new Date().toISOString(),
			count: todos.length,
			todos
		},
		null,
		2
	);
}
