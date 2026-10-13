import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { todos, todoTags, tags, categories, todoEvents } from './db/app.schema';
import { user } from './db/auth.schema';
import { newId } from './ids';
import type { TaskStatus, TodoEvent, TodoField } from '#lib/types';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Conn = typeof db | Tx;

export interface EventInput {
	todoId: string;
	field: TodoField;
	from?: string | null;
	to?: string | null;
}

/** What history tracks about a task, with ids for comparing and names for display. */
interface Snapshot {
	title: string;
	description: string | null;
	status: TaskStatus;
	parentId: string | null;
	categoryId: string | null;
	category: string | null;
	assigneeId: string | null;
	assignee: string | null;
	deadline: string | null;
	urgency: string | null;
	size: string | null;
	/** tag id → name */
	tags: Map<string, string>;
}

function statusOf(t: { completed: boolean; notDoing: boolean; startedAt: Date | null }): TaskStatus {
	if (t.completed) return t.notDoing ? 'not_doing' : 'done';
	return t.startedAt ? 'in_progress' : 'open';
}

async function snapshot(conn: Conn, projectId: string): Promise<Map<string, Snapshot>> {
	const rows = await conn
		.select({
			id: todos.id,
			title: todos.title,
			description: todos.description,
			completed: todos.completed,
			notDoing: todos.notDoing,
			startedAt: todos.startedAt,
			parentId: todos.parentId,
			categoryId: todos.categoryId,
			category: categories.name,
			assigneeId: todos.assigneeId,
			assignee: user.name,
			deadline: todos.deadline,
			urgency: todos.urgency,
			size: todos.size
		})
		.from(todos)
		.leftJoin(categories, eq(categories.id, todos.categoryId))
		.leftJoin(user, eq(user.id, todos.assigneeId))
		.where(and(eq(todos.projectId, projectId), isNull(todos.deletedAt)));
	const tagRows = await conn
		.select({ todoId: todoTags.todoId, id: tags.id, name: tags.name })
		.from(todoTags)
		.innerJoin(tags, eq(tags.id, todoTags.tagId))
		.innerJoin(todos, eq(todos.id, todoTags.todoId))
		.where(and(eq(todos.projectId, projectId), isNull(todos.deletedAt)));

	const out = new Map<string, Snapshot>();
	for (const r of rows) {
		out.set(r.id, {
			title: r.title,
			description: r.description,
			status: statusOf(r),
			parentId: r.parentId,
			categoryId: r.categoryId,
			category: r.category,
			assigneeId: r.assigneeId,
			assignee: r.assignee,
			deadline: r.deadline?.toISOString() ?? null,
			urgency: r.urgency,
			size: r.size,
			tags: new Map()
		});
	}
	for (const t of tagRows) out.get(t.todoId)?.tags.set(t.id, t.name);
	return out;
}

function diff(
	id: string,
	a: Snapshot,
	b: Snapshot,
	before: Map<string, Snapshot>,
	after: Map<string, Snapshot>
): EventInput[] {
	const out: EventInput[] = [];
	const push = (field: TodoField, from: string | null, to: string | null) =>
		out.push({ todoId: id, field, from, to });

	if (a.status !== b.status) push('status', a.status, b.status);
	if (a.title !== b.title) push('title', a.title, b.title);
	if ((a.description ?? '') !== (b.description ?? '')) push('description', a.description, b.description);
	if (a.parentId !== b.parentId) {
		const title = (map: Map<string, Snapshot>, pid: string | null) =>
			pid ? (map.get(pid)?.title ?? null) : null;
		push('parent', title(before, a.parentId), title(after, b.parentId));
	}
	if (a.categoryId !== b.categoryId) push('category', a.category, b.category);
	if (a.assigneeId !== b.assigneeId) push('assignee', a.assignee, b.assignee);
	if (a.deadline !== b.deadline) push('deadline', a.deadline, b.deadline);
	if (a.urgency !== b.urgency) push('urgency', a.urgency, b.urgency);
	if (a.size !== b.size) push('size', a.size, b.size);
	for (const [tagId, name] of b.tags) if (!a.tags.has(tagId)) push('tag', null, name);
	for (const [tagId, name] of a.tags) if (!b.tags.has(tagId)) push('tag', name, null);
	return out;
}

export async function recordEvents(conn: Conn, actorId: string | null, events: EventInput[]) {
	if (!events.length) return;
	// One timestamp per call so the UI can group a request's changes together.
	const createdAt = new Date();
	await conn.insert(todoEvents).values(
		events.map((e) => ({
			id: newId(),
			todoId: e.todoId,
			actorId,
			field: e.field,
			fromValue: e.from ?? null,
			toValue: e.to ?? null,
			createdAt
		}))
	);
}

/**
 * Run a mutation and record what it changed on every task in the project,
 * including cascades (subtasks closed with their parent, ancestors reopened).
 */
export async function tracked<T>(
	conn: Conn,
	projectId: string,
	actorId: string | null,
	run: () => Promise<T>
): Promise<T> {
	const before = await snapshot(conn, projectId);
	const result = await run();
	const after = await snapshot(conn, projectId);
	const events: EventInput[] = [];
	for (const [id, b] of after) {
		const a = before.get(id);
		if (a) events.push(...diff(id, a, b, before, after));
	}
	await recordEvents(conn, actorId, events);
	return result;
}

/** A task's history, newest first. */
export async function listHistory(projectId: string, todoId: string): Promise<TodoEvent[]> {
	const rows = await db
		.select({
			id: todoEvents.id,
			field: todoEvents.field,
			from: todoEvents.fromValue,
			to: todoEvents.toValue,
			createdAt: todoEvents.createdAt,
			actorId: user.id,
			actorName: user.name,
			actorEmail: user.email,
			actorImage: user.image
		})
		.from(todoEvents)
		.innerJoin(todos, eq(todos.id, todoEvents.todoId))
		.leftJoin(user, eq(user.id, todoEvents.actorId))
		.where(and(eq(todoEvents.todoId, todoId), eq(todos.projectId, projectId)))
		.orderBy(desc(todoEvents.createdAt));
	return rows.map((r) => ({
		id: r.id,
		field: r.field as TodoField,
		from: r.from,
		to: r.to,
		actor: r.actorId ? { id: r.actorId, name: r.actorName!, email: r.actorEmail!, image: r.actorImage } : null,
		createdAt: r.createdAt
	}));
}

/** Record that tasks were created (one `created` entry each). */
export async function recordCreated(conn: Conn, actorId: string, todoIds: string[]) {
	await recordEvents(
		conn,
		actorId,
		todoIds.map((todoId) => ({ todoId, field: 'created' }))
	);
}
