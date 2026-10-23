import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { db } from './db';
import {
	todos,
	todoTags,
	tags,
	categories,
	attachments,
	todoLinks,
	projects,
	projectMembers,
	type Urgency,
	type Size,
	type LinkKind
} from './db/app.schema';
import { user } from './db/auth.schema';
import { newId } from './ids';
import { tracked, recordEvents, recordCreated } from './history';
import type { ImportItem, ImportRef } from '#lib/parseImport';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Conn = typeof db | Tx;

// `description` is a TEXT column (65,535-byte capacity); cap well under the worst-case
// utf8mb4 limit (~16,383 chars at 4 bytes/char) so an oversized value is silently
// truncated instead of throwing an uncaught "Data too long" error from MySQL.
const MAX_DESCRIPTION_LEN = 15000;

/** Live (not deleted) todos in the project. */
const liveIn = (projectId: string) => and(eq(todos.projectId, projectId), isNull(todos.deletedAt));

// ─── Task tree ──────────────────────────────────────────────────────────────
/** id → parentId for every live todo in the project. */
async function loadTree(conn: Conn, projectId: string): Promise<Map<string, string | null>> {
	const rows = await conn
		.select({ id: todos.id, parentId: todos.parentId })
		.from(todos)
		.where(liveIn(projectId));
	return new Map(rows.map((r) => [r.id, r.parentId]));
}

function childrenIndex(tree: Map<string, string | null>): Map<string, string[]> {
	const kids = new Map<string, string[]>();
	for (const [id, parentId] of tree) {
		if (!parentId) continue;
		const list = kids.get(parentId) ?? [];
		list.push(id);
		kids.set(parentId, list);
	}
	return kids;
}

/** The given ids plus all their descendants, grouped by depth below the roots. */
function subtreeLevels(tree: Map<string, string | null>, ids: string[]): string[][] {
	const kids = childrenIndex(tree);
	const seen = new Set<string>();
	const levels: string[][] = [];
	let level = ids.filter((id) => tree.has(id));
	while (level.length) {
		level = level.filter((id) => !seen.has(id));
		for (const id of level) seen.add(id);
		if (level.length) levels.push(level);
		level = level.flatMap((id) => kids.get(id) ?? []);
	}
	return levels;
}

function ancestorsOf(tree: Map<string, string | null>, id: string): string[] {
	const out: string[] = [];
	const seen = new Set([id]);
	let cur = tree.get(id);
	while (cur && !seen.has(cur)) {
		out.push(cur);
		seen.add(cur);
		cur = tree.get(cur);
	}
	return out;
}

/**
 * Check a requested parent for `todoId` (null when creating). Returns the
 * parent id, null for top level, or throws if it's outside the project or
 * would create a cycle.
 */
export async function validateParent(
	projectId: string,
	todoId: string | null,
	parentId: string | null | undefined
): Promise<string | null> {
	if (!parentId) return null;
	const tree = await loadTree(db, projectId);
	if (!tree.has(parentId)) throw new ParentError('Parent task not found');
	if (todoId && (parentId === todoId || ancestorsOf(tree, parentId).includes(todoId)))
		throw new ParentError("A task can't be nested inside itself");
	return parentId;
}

export class ParentError extends Error {}

/**
 * Set completion while keeping the tree consistent: completing a task completes
 * its whole subtree (and stops any progress on it), reopening one reopens its
 * ancestors. With `notDoing`, the tasks (and any open subtasks) are closed as
 * not doing rather than done. Returns every id whose state was considered (the
 * requested ids plus the cascade).
 */
async function setCompleted(
	conn: Conn,
	projectId: string,
	ids: string[],
	completed: boolean,
	notDoing = false
) {
	const tree = await loadTree(conn, projectId);
	const targets = completed
		? subtreeLevels(tree, ids).flat()
		: [...new Set(ids.filter((id) => tree.has(id)).flatMap((id) => [id, ...ancestorsOf(tree, id)]))];
	if (targets.length) {
		// Only flip the ones changing state, so existing completedAt stamps survive.
		await conn
			.update(todos)
			.set(
				completed
					? { completed, completedAt: new Date(), startedAt: null, notDoing }
					: { completed, completedAt: null, notDoing: false }
			)
			.where(and(inArray(todos.id, targets), eq(todos.completed, !completed)));
		// Already-closed tasks that were asked for directly switch between done and not doing.
		if (completed) await conn.update(todos).set({ notDoing }).where(inArray(todos.id, ids));
	}
	return targets;
}

/**
 * Soft-delete tasks and all their descendants; returns every deleted id. The
 * whole batch shares one stamp so it can be restored together.
 */
async function deleteSubtrees(conn: Conn, projectId: string, ids: string[], actorId: string) {
	const deleted = subtreeLevels(await loadTree(conn, projectId), ids).flat();
	if (!deleted.length) return [];
	await conn
		.update(todos)
		.set({ deletedAt: new Date(), deletedById: actorId })
		.where(inArray(todos.id, deleted));
	await recordEvents(
		conn,
		actorId,
		deleted.map((todoId) => ({ todoId, field: 'deleted' }))
	);
	return deleted;
}

/** sortOrder for a task joining `parentId`: top of the list, or last subtask. */
async function siblingSortOrder(conn: Conn, projectId: string, parentId: string | null) {
	if (!parentId) {
		const [row] = await conn
			.select({ max: sql<number>`coalesce(max(${todos.sortOrder}), 0)` })
			.from(todos)
			.where(liveIn(projectId));
		return Number(row?.max ?? 0) + 1;
	}
	const [row] = await conn
		.select({ min: sql<number>`coalesce(min(${todos.sortOrder}), 1)` })
		.from(todos)
		.where(and(liveIn(projectId), eq(todos.parentId, parentId)));
	return Number(row?.min ?? 1) - 1;
}

/**
 * Ensure category/assignee/tag references actually belong to the project,
 * stripping anything that doesn't (prevents cross-project reference injection).
 */
export async function validateRefs(
	projectId: string,
	input: { categoryId?: string | null; assigneeId?: string | null; tagIds?: string[] }
): Promise<{ categoryId: string | null; assigneeId: string | null; tagIds: string[] }> {
	let categoryId: string | null = null;
	let assigneeId: string | null = null;
	let tagIds: string[] = [];

	if (input.categoryId) {
		const [row] = await db
			.select({ id: categories.id })
			.from(categories)
			.where(and(eq(categories.id, input.categoryId), eq(categories.projectId, projectId)))
			.limit(1);
		categoryId = row ? input.categoryId : null;
	}
	if (input.assigneeId) {
		const [row] = await db
			.select({ id: projectMembers.id })
			.from(projectMembers)
			.where(
				and(eq(projectMembers.userId, input.assigneeId), eq(projectMembers.projectId, projectId))
			)
			.limit(1);
		assigneeId = row ? input.assigneeId : null;
	}
	if (input.tagIds?.length) {
		const rows = await db
			.select({ id: tags.id })
			.from(tags)
			.where(and(eq(tags.projectId, projectId), inArray(tags.id, input.tagIds)));
		tagIds = rows.map((r) => r.id);
	}
	return { categoryId, assigneeId, tagIds };
}

export interface TodoTag {
	id: string;
	name: string;
	color: string;
}
export interface AttachmentRef {
	id: string;
	name: string | null;
	mime: string | null;
	size: number | null;
	url: string;
}
export interface TodoLink {
	id: string;
	kind: LinkKind;
	url: string | null;
	title: string | null;
	linkedTodo: {
		id: string;
		title: string;
		completed: boolean;
		deletedAt: Date | null;
		projectId: string;
		projectSlug: string;
		projectName: string;
	} | null;
}
export interface TodoItem {
	id: string;
	projectId: string;
	parentId: string | null;
	title: string;
	description: string | null;
	completed: boolean;
	completedAt: Date | null;
	notDoing: boolean;
	startedAt: Date | null;
	deadline: Date | null;
	urgency: Urgency | null;
	size: Size | null;
	sortOrder: number;
	categoryId: string | null;
	category: { id: string; name: string; color: string } | null;
	assigneeId: string | null;
	assignee: { id: string; name: string; image: string | null } | null;
	createdAt: Date;
	updatedAt: Date;
	tags: TodoTag[];
	attachments: AttachmentRef[];
	links: TodoLink[];
}

export async function listTodos(projectId: string): Promise<TodoItem[]> {
	const rows = await db
		.select({
			todo: todos,
			catId: categories.id,
			catName: categories.name,
			catColor: categories.color,
			asgId: user.id,
			asgName: user.name,
			asgImage: user.image
		})
		.from(todos)
		.leftJoin(categories, eq(categories.id, todos.categoryId))
		.leftJoin(user, eq(user.id, todos.assigneeId))
		.where(liveIn(projectId))
		.orderBy(asc(todos.completed), desc(todos.sortOrder), desc(todos.createdAt));

	const tagRows = await db
		.select({
			todoId: todoTags.todoId,
			id: tags.id,
			name: tags.name,
			color: tags.color
		})
		.from(todoTags)
		.innerJoin(tags, eq(tags.id, todoTags.tagId))
		.innerJoin(todos, eq(todos.id, todoTags.todoId))
		.where(liveIn(projectId));

	const tagsByTodo = new Map<string, TodoTag[]>();
	for (const t of tagRows) {
		const list = tagsByTodo.get(t.todoId) ?? [];
		list.push({ id: t.id, name: t.name, color: t.color });
		tagsByTodo.set(t.todoId, list);
	}

	const attachmentRows = await db
		.select({
			id: attachments.id,
			todoId: attachments.todoId,
			name: attachments.name,
			mime: attachments.mime,
			size: attachments.size
		})
		.from(attachments)
		.innerJoin(todos, eq(todos.id, attachments.todoId))
		.where(liveIn(projectId))
		.orderBy(asc(attachments.createdAt));

	const attByTodo = new Map<string, AttachmentRef[]>();
	for (const a of attachmentRows) {
		const list = attByTodo.get(a.todoId) ?? [];
		list.push({
			id: a.id,
			name: a.name,
			mime: a.mime,
			size: a.size,
			// Every access is authorized through the app, not a public URL.
			url: `/api/projects/${projectId}/attachments/${a.id}/raw`
		});
		attByTodo.set(a.todoId, list);
	}

	const linkedTodo = alias(todos, 'linked_todo');
	const linkedProject = alias(projects, 'linked_project');
	const linkRows = await db
		.select({
			todoId: todoLinks.todoId,
			id: todoLinks.id,
			kind: todoLinks.kind,
			url: todoLinks.url,
			title: todoLinks.title,
			linkedTodoId: linkedTodo.id,
			linkedTitle: linkedTodo.title,
			linkedCompleted: linkedTodo.completed,
			linkedDeletedAt: linkedTodo.deletedAt,
			linkedProjectId: linkedProject.id,
			linkedProjectSlug: linkedProject.slug,
			linkedProjectName: linkedProject.name
		})
		.from(todoLinks)
		.innerJoin(todos, eq(todos.id, todoLinks.todoId))
		.leftJoin(linkedTodo, eq(linkedTodo.id, todoLinks.linkedTodoId))
		.leftJoin(linkedProject, eq(linkedProject.id, linkedTodo.projectId))
		.where(liveIn(projectId))
		.orderBy(asc(todoLinks.createdAt));

	const linksByTodo = new Map<string, TodoLink[]>();
	for (const l of linkRows) {
		const list = linksByTodo.get(l.todoId) ?? [];
		list.push({
			id: l.id,
			kind: l.kind,
			url: l.url,
			title: l.title,
			linkedTodo: l.linkedTodoId
				? {
						id: l.linkedTodoId,
						title: l.linkedTitle!,
						completed: l.linkedCompleted!,
						deletedAt: l.linkedDeletedAt,
						projectId: l.linkedProjectId!,
						projectSlug: l.linkedProjectSlug!,
						projectName: l.linkedProjectName!
					}
				: null
		});
		linksByTodo.set(l.todoId, list);
	}

	return rows.map((r) => ({
		id: r.todo.id,
		projectId: r.todo.projectId,
		parentId: r.todo.parentId,
		title: r.todo.title,
		description: r.todo.description,
		completed: r.todo.completed,
		completedAt: r.todo.completedAt,
		notDoing: r.todo.notDoing,
		startedAt: r.todo.startedAt,
		deadline: r.todo.deadline,
		urgency: r.todo.urgency,
		size: r.todo.size,
		sortOrder: r.todo.sortOrder,
		categoryId: r.todo.categoryId,
		category: r.catId ? { id: r.catId, name: r.catName!, color: r.catColor! } : null,
		assigneeId: r.todo.assigneeId,
		assignee: r.asgId ? { id: r.asgId, name: r.asgName!, image: r.asgImage } : null,
		createdAt: r.todo.createdAt,
		updatedAt: r.todo.updatedAt,
		tags: tagsByTodo.get(r.todo.id) ?? [],
		attachments: attByTodo.get(r.todo.id) ?? [],
		links: linksByTodo.get(r.todo.id) ?? []
	}));
}

export interface TodoInput {
	title: string;
	/** Must already be checked with `validateParent`. */
	parentId?: string | null;
	description?: string | null;
	categoryId?: string | null;
	assigneeId?: string | null;
	deadline?: Date | null;
	urgency?: Urgency | null;
	size?: Size | null;
	tagIds?: string[];
	completed?: boolean;
}

/** Start or stop progress on tasks; starting a done task reopens it (and its ancestors). */
async function setInProgress(conn: Conn, projectId: string, ids: string[], inProgress: boolean) {
	if (!inProgress) {
		await conn.update(todos).set({ startedAt: null }).where(inArray(todos.id, ids));
		return [];
	}
	const reopened = await setCompleted(conn, projectId, ids, false);
	// Keep the original start time for tasks already in progress.
	await conn
		.update(todos)
		.set({ startedAt: sql`coalesce(${todos.startedAt}, now(3))` })
		.where(inArray(todos.id, ids));
	return reopened;
}

export async function createTodo(projectId: string, userId: string, input: TodoInput) {
	const id = newId();
	const parentId = input.parentId ?? null;
	const sortOrder = await siblingSortOrder(db, projectId, parentId);
	await db.insert(todos).values({
		id,
		projectId,
		parentId,
		title: input.title.trim().slice(0, 500),
		description: input.description?.trim().slice(0, MAX_DESCRIPTION_LEN) || null,
		categoryId: input.categoryId || null,
		assigneeId: input.assigneeId || null,
		deadline: input.deadline ?? null,
		urgency: input.urgency ?? null,
		size: input.size ?? null,
		completed: input.completed ?? false,
		completedAt: input.completed ? new Date() : null,
		sortOrder,
		createdById: userId
	});
	if (input.tagIds?.length) await setTodoTags(id, input.tagIds);
	await recordCreated(db, userId, [id]);
	// A new open subtask means its ancestors aren't done any more.
	const affected =
		parentId && !input.completed
			? await tracked(db, projectId, userId, () => setCompleted(db, projectId, [parentId], false))
			: [];
	return { id, affected };
}

/** Returns the ids of other todos changed as a side effect (re-parenting). */
export async function updateTodo(
	projectId: string,
	todoId: string,
	input: Partial<TodoInput> & { inProgress?: boolean },
	actorId: string
): Promise<string[]> {
	return tracked(db, projectId, actorId, async () => {
		const values: Record<string, unknown> = {};
		let affected: string[] = [];
		if (input.parentId !== undefined) {
			const parentId = input.parentId || null;
			const [current] = await db
				.select({ parentId: todos.parentId, completed: todos.completed })
				.from(todos)
				.where(eq(todos.id, todoId))
				.limit(1);
			if (current && current.parentId !== parentId) {
				values.parentId = parentId;
				values.sortOrder = await siblingSortOrder(db, projectId, parentId);
				if (parentId && !current.completed)
					affected = await setCompleted(db, projectId, [parentId], false);
			}
		}
		if (input.title !== undefined) values.title = input.title.trim().slice(0, 500);
		if (input.description !== undefined)
			values.description = input.description?.trim().slice(0, MAX_DESCRIPTION_LEN) || null;
		if (input.categoryId !== undefined) values.categoryId = input.categoryId || null;
		if (input.assigneeId !== undefined) values.assigneeId = input.assigneeId || null;
		if (input.deadline !== undefined) values.deadline = input.deadline;
		if (input.urgency !== undefined) values.urgency = input.urgency;
		if (input.size !== undefined) values.size = input.size;
		if (Object.keys(values).length) {
			await db.update(todos).set(values).where(eq(todos.id, todoId));
		}
		if (input.tagIds !== undefined) await setTodoTags(todoId, input.tagIds);
		if (input.inProgress !== undefined)
			affected = [...affected, ...(await setInProgress(db, projectId, [todoId], input.inProgress))];
		return affected;
	});
}

export interface BulkPatch {
	categoryId?: string | null;
	assigneeId?: string | null;
	deadline?: Date | null;
	urgency?: Urgency | null;
	size?: Size | null;
	completed?: boolean;
	/** With `completed`, close as not doing rather than done. */
	notDoing?: boolean;
	inProgress?: boolean;
	/** Tags are added/removed per todo rather than replaced wholesale. */
	addTagIds?: string[];
	removeTagIds?: string[];
}

/** Apply the same change to many todos; ids outside the project are ignored. */
export async function bulkUpdateTodos(
	projectId: string,
	todoIds: string[],
	patch: BulkPatch,
	actorId: string
) {
	return db.transaction((tx) =>
		tracked(tx, projectId, actorId, async () => {
			const ids = (
				await tx
					.select({ id: todos.id })
					.from(todos)
					.where(and(liveIn(projectId), inArray(todos.id, todoIds)))
			).map((r) => r.id);
			if (!ids.length) return [];
			const touched = new Set(ids);

			const values: Record<string, unknown> = {};
			if (patch.categoryId !== undefined) values.categoryId = patch.categoryId || null;
			if (patch.assigneeId !== undefined) values.assigneeId = patch.assigneeId || null;
			if (patch.deadline !== undefined) values.deadline = patch.deadline;
			if (patch.urgency !== undefined) values.urgency = patch.urgency;
			if (patch.size !== undefined) values.size = patch.size;
			// Always bump updatedAt so tag-only changes register too.
			await tx
				.update(todos)
				.set({ ...values, updatedAt: new Date() })
				.where(inArray(todos.id, ids));
			if (patch.completed !== undefined) {
				for (const id of await setCompleted(tx, projectId, ids, patch.completed, patch.notDoing))
					touched.add(id);
			}
			if (patch.inProgress !== undefined) {
				for (const id of await setInProgress(tx, projectId, ids, patch.inProgress)) touched.add(id);
			}

			const add = [...new Set(patch.addTagIds ?? [])].filter(Boolean);
			if (add.length) {
				await tx
					.insert(todoTags)
					.values(ids.flatMap((todoId) => add.map((tagId) => ({ todoId, tagId }))))
					// Already-tagged todos are left as-is.
					.onDuplicateKeyUpdate({ set: { tagId: sql`${todoTags.tagId}` } });
			}
			const remove = [...new Set(patch.removeTagIds ?? [])].filter(Boolean);
			if (remove.length) {
				await tx
					.delete(todoTags)
					.where(and(inArray(todoTags.todoId, ids), inArray(todoTags.tagId, remove)));
			}
			return [...touched];
		})
	);
}

/** Delete many todos and their subtasks; ids outside the project are ignored. */
export async function bulkDeleteTodos(projectId: string, todoIds: string[], actorId: string) {
	return db.transaction((tx) => deleteSubtrees(tx, projectId, todoIds, actorId));
}

/** Returns every id whose completion may have changed (subtree or ancestors). */
export async function toggleTodo(
	projectId: string,
	todoId: string,
	completed: boolean,
	notDoing: boolean,
	actorId: string
) {
	return db.transaction((tx) =>
		tracked(tx, projectId, actorId, () => setCompleted(tx, projectId, [todoId], completed, notDoing))
	);
}

/** Delete a todo and its subtasks; returns every deleted id. */
export async function deleteTodo(projectId: string, todoId: string, actorId: string) {
	return db.transaction((tx) => deleteSubtrees(tx, projectId, [todoId], actorId));
}

/** Verify a live todo belongs to a project (authorization guard for mutations). */
export async function todoBelongsToProject(todoId: string, projectId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: todos.id })
		.from(todos)
		.where(and(eq(todos.id, todoId), liveIn(projectId)))
		.limit(1);
	return !!row;
}

// ─── Deleted tasks ──────────────────────────────────────────────────────────
export interface DeletedTodo {
	id: string;
	title: string;
	completed: boolean;
	deletedAt: Date;
	deletedBy: { id: string; name: string } | null;
	/** Subtasks deleted along with it, which come back with it. */
	subtasks: number;
}

interface TreeRow {
	id: string;
	parentId: string | null;
	title: string;
	completed: boolean;
	deletedAt: Date | null;
}

/** Every todo in the project, deleted or not. */
async function loadAll(conn: Conn, projectId: string): Promise<Map<string, TreeRow>> {
	const rows = await conn
		.select({
			id: todos.id,
			parentId: todos.parentId,
			title: todos.title,
			completed: todos.completed,
			deletedAt: todos.deletedAt
		})
		.from(todos)
		.where(eq(todos.projectId, projectId));
	return new Map(rows.map((r) => [r.id, r]));
}

const sameStamp = (a: Date | null, b: Date | null) => !!a && !!b && a.getTime() === b.getTime();

/** A deleted task plus the descendants deleted along with it (same stamp), parents first. */
function deletedBatch(rows: Map<string, TreeRow>, id: string): string[] {
	const root = rows.get(id);
	if (!root?.deletedAt) return [];
	const kids = childrenIndex(new Map([...rows].map(([k, r]) => [k, r.parentId])));
	const out: string[] = [];
	const seen = new Set<string>();
	let level = [id];
	while (level.length) {
		for (const k of level) seen.add(k);
		out.push(...level);
		level = level
			.flatMap((k) => kids.get(k) ?? [])
			.filter((k) => !seen.has(k) && sameStamp(rows.get(k)!.deletedAt, root.deletedAt));
	}
	return out;
}

/**
 * Deleted tasks that can be restored, newest first. Subtasks deleted with their
 * parent are folded into it rather than listed separately.
 */
export async function listDeletedTodos(projectId: string): Promise<DeletedTodo[]> {
	const rows = await loadAll(db, projectId);
	const deleted = await db
		.select({
			id: todos.id,
			parentId: todos.parentId,
			title: todos.title,
			completed: todos.completed,
			deletedAt: todos.deletedAt,
			byId: user.id,
			byName: user.name
		})
		.from(todos)
		.leftJoin(user, eq(user.id, todos.deletedById))
		.where(and(eq(todos.projectId, projectId), sql`${todos.deletedAt} is not null`))
		.orderBy(desc(todos.deletedAt));
	return deleted
		.filter((r) => {
			const parent = r.parentId ? rows.get(r.parentId) : undefined;
			return !sameStamp(parent?.deletedAt ?? null, r.deletedAt);
		})
		.map((r) => ({
			id: r.id,
			title: r.title,
			completed: r.completed,
			deletedAt: r.deletedAt!,
			deletedBy: r.byId ? { id: r.byId, name: r.byName! } : null,
			subtasks: deletedBatch(rows, r.id).length - 1
		}));
}

/**
 * Bring back a deleted task and the subtasks deleted with it. If its parent is
 * still deleted it returns at the top level; restoring an open task under a
 * done parent reopens the parent. Returns null if the task isn't deleted.
 */
export async function restoreTodo(projectId: string, todoId: string, actorId: string) {
	return db.transaction(async (tx) => {
		const rows = await loadAll(tx, projectId);
		const restored = deletedBatch(rows, todoId);
		if (!restored.length) return null;
		const root = rows.get(todoId)!;
		const parent = root.parentId ? rows.get(root.parentId) : undefined;

		await tx
			.update(todos)
			.set({ deletedAt: null, deletedById: null })
			.where(inArray(todos.id, restored));
		await recordEvents(
			tx,
			actorId,
			restored.map((id) => ({ todoId: id, field: 'restored' }))
		);

		let affected: string[] = [];
		if (parent?.deletedAt) {
			await tx
				.update(todos)
				.set({ parentId: null, sortOrder: await siblingSortOrder(tx, projectId, null) })
				.where(eq(todos.id, todoId));
			await recordEvents(tx, actorId, [{ todoId, field: 'parent', from: parent.title }]);
		} else if (parent && !root.completed) {
			affected = await tracked(tx, projectId, actorId, () =>
				setCompleted(tx, projectId, [parent.id], false)
			);
		}
		return { restored, affected };
	});
}

/** Permanently remove a deleted task and its subtasks; returns the ids, or null if it isn't deleted. */
export async function purgeTodo(projectId: string, todoId: string) {
	return db.transaction(async (tx) => {
		const rows = await loadAll(tx, projectId);
		if (!rows.get(todoId)?.deletedAt) return null;
		const levels = subtreeLevels(new Map([...rows].map(([k, r]) => [k, r.parentId])), [todoId]);
		// Deepest first, so the FK cascade never has to recurse (InnoDB stops at 15).
		for (const level of [...levels].reverse()) {
			await tx.delete(todos).where(inArray(todos.id, level));
		}
		return levels.flat();
	});
}

export async function setTodoTags(todoId: string, tagIds: string[]) {
	await db.delete(todoTags).where(eq(todoTags.todoId, todoId));
	const unique = [...new Set(tagIds)].filter(Boolean);
	if (unique.length) {
		await db.insert(todoTags).values(unique.map((tagId) => ({ todoId, tagId })));
	}
}

/** Find-or-create tags/categories by name; returns lowercased name → id. */
async function ensureNamed(
	tx: Tx,
	table: typeof tags | typeof categories,
	projectId: string,
	wanted: ImportRef[]
): Promise<Map<string, string>> {
	const byName = new Map<string, ImportRef>();
	for (const r of wanted) if (!byName.has(r.name.toLowerCase())) byName.set(r.name.toLowerCase(), r);
	if (!byName.size) return new Map();

	const load = async () =>
		new Map(
			(await tx.select({ id: table.id, name: table.name }).from(table).where(eq(table.projectId, projectId))).map(
				(r) => [r.name.toLowerCase(), r.id]
			)
		);
	const existing = await load();
	const missing = [...byName.entries()].filter(([k]) => !existing.has(k)).map(([, r]) => r);
	if (!missing.length) return existing;
	await tx
		.insert(table)
		.values(missing.map((r) => ({ id: newId(), projectId, name: r.name, color: r.color })))
		// Keep existing rows (and their colours) on a collation-level name clash.
		.onDuplicateKeyUpdate({ set: { name: sql`${table.name}` } });
	return load();
}

/**
 * Bulk import of parsed items (checklist lines or a JSON export). Items keep
 * their given order at the top of the list; tags and categories are matched
 * by name (created if missing) and assignees kept only if they're members.
 */
export async function importTodos(projectId: string, userId: string, items: ImportItem[]) {
	// Drop blank items, re-pointing parent indexes at the surviving positions.
	const kept = new Map<number, number>();
	items.forEach((i, idx) => {
		if (i.title.trim()) kept.set(idx, kept.size);
	});
	items = items
		.filter((i) => i.title.trim())
		.map((i) => ({ ...i, parentIndex: kept.get(i.parentIndex ?? -1) ?? null }));
	if (!items.length) return 0;

	return db.transaction(async (tx) => {
		const categoryIds = await ensureNamed(
			tx,
			categories,
			projectId,
			items.flatMap((i) => (i.category ? [i.category] : []))
		);
		const tagIds = await ensureNamed(
			tx,
			tags,
			projectId,
			items.flatMap((i) => i.tags ?? [])
		);
		const memberIds = new Set(
			(
				await tx
					.select({ userId: projectMembers.userId })
					.from(projectMembers)
					.where(eq(projectMembers.projectId, projectId))
			).map((r) => r.userId)
		);

		const base = await siblingSortOrder(tx, projectId, null);
		const now = new Date();
		const ids = items.map(() => newId());

		const links: { todoId: string; tagId: string }[] = [];
		const rows = items.map((i, idx) => {
			const id = ids[idx];
			const itemTagIds = new Set((i.tags ?? []).map((t) => tagIds.get(t.name.toLowerCase())));
			for (const tagId of itemTagIds) if (tagId) links.push({ todoId: id, tagId });
			return {
				id,
				projectId,
				parentId: i.parentIndex != null ? (ids[i.parentIndex] ?? null) : null,
				title: i.title.trim().slice(0, 500),
				description: i.description?.trim().slice(0, MAX_DESCRIPTION_LEN) || null,
				completed: i.completed,
				completedAt: i.completed ? (i.completedAt ?? now) : null,
				deadline: i.deadline ?? null,
				urgency: i.urgency ?? null,
				size: i.size ?? null,
				categoryId: (i.category && categoryIds.get(i.category.name.toLowerCase())) || null,
				assigneeId: i.assigneeId && memberIds.has(i.assigneeId) ? i.assigneeId : null,
				// Larger sortOrder floats to the top, so the first item gets the highest.
				sortOrder: base + items.length - 1 - idx,
				createdById: userId
			};
		});
		// Parents must exist before their children for the FK check.
		await tx.insert(todos).values(parentsFirst(rows));
		if (links.length) await tx.insert(todoTags).values(links);
		await recordCreated(tx, userId, ids);
		return rows.length;
	});
}

/** Order rows so every parent precedes its children; cyclic links are dropped. */
function parentsFirst<T extends { id: string; parentId: string | null }>(rows: T[]): T[] {
	const byId = new Map(rows.map((r) => [r.id, r]));
	const depth = new Map<string, number>();
	const depthOf = (r: T, path: Set<string>): number => {
		const known = depth.get(r.id);
		if (known !== undefined) return known;
		const parent = r.parentId ? byId.get(r.parentId) : undefined;
		if (!parent || path.has(parent.id)) {
			r.parentId = null;
			depth.set(r.id, 0);
			return 0;
		}
		path.add(r.id);
		const d = depthOf(parent, path) + 1;
		depth.set(r.id, d);
		return d;
	};
	for (const r of rows) depthOf(r, new Set());
	return [...rows].sort((a, b) => depth.get(a.id)! - depth.get(b.id)!);
}

export async function reorderTodos(projectId: string, orderedIds: string[]) {
	// Highest sortOrder = top of list.
	const n = orderedIds.length;
	await Promise.all(
		orderedIds.map((todoId, i) =>
			db
				.update(todos)
				.set({ sortOrder: n - i })
				.where(and(eq(todos.id, todoId), liveIn(projectId)))
		)
	);
}

// ─── Tags & categories ──────────────────────────────────────────────────────
/** True when a MySQL error is a unique-index violation (e.g. a duplicate tag/category name). */
function isDuplicateKeyError(e: unknown): boolean {
	return !!e && typeof e === 'object' && (e as { code?: string }).code === 'ER_DUP_ENTRY';
}

export async function listTags(projectId: string) {
	return db
		.select({
			id: tags.id,
			projectId: tags.projectId,
			name: tags.name,
			color: tags.color,
			createdAt: tags.createdAt,
			usageCount: sql<number>`count(${todoTags.todoId})`.mapWith(Number)
		})
		.from(tags)
		.leftJoin(todoTags, eq(todoTags.tagId, tags.id))
		.where(eq(tags.projectId, projectId))
		.groupBy(tags.id)
		.orderBy(asc(tags.name));
}

export async function createTag(projectId: string, name: string, color: string) {
	const id = newId();
	await db
		.insert(tags)
		.values({ id, projectId, name: name.trim().slice(0, 60), color })
		.onDuplicateKeyUpdate({ set: { color } });
	const [row] = await db
		.select()
		.from(tags)
		.where(and(eq(tags.projectId, projectId), eq(tags.name, name.trim().slice(0, 60))))
		.limit(1);
	return row;
}

/** Returns `null` if the tag doesn't exist, or `'duplicate'` if the new name collides. */
export async function updateTag(
	projectId: string,
	tagId: string,
	patch: { name?: string; color?: string }
): Promise<ReturnType<typeof createTag> | null | 'duplicate'> {
	const set: { name?: string; color?: string } = {};
	if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 60);
	if (patch.color !== undefined) set.color = patch.color;
	if (!Object.keys(set).length) return null;
	try {
		await db.update(tags).set(set).where(and(eq(tags.id, tagId), eq(tags.projectId, projectId)));
	} catch (e) {
		if (isDuplicateKeyError(e)) return 'duplicate';
		throw e;
	}
	const [row] = await db.select().from(tags).where(eq(tags.id, tagId)).limit(1);
	return row ?? null;
}

export async function deleteTag(projectId: string, tagId: string) {
	await db.delete(tags).where(and(eq(tags.id, tagId), eq(tags.projectId, projectId)));
}

export async function listCategories(projectId: string) {
	return db
		.select({
			id: categories.id,
			projectId: categories.projectId,
			name: categories.name,
			color: categories.color,
			createdAt: categories.createdAt,
			usageCount: sql<number>`count(${todos.id})`.mapWith(Number)
		})
		.from(categories)
		.leftJoin(todos, and(eq(todos.categoryId, categories.id), isNull(todos.deletedAt)))
		.where(eq(categories.projectId, projectId))
		.groupBy(categories.id)
		.orderBy(asc(categories.name));
}

export async function createCategory(projectId: string, name: string, color: string) {
	const id = newId();
	await db
		.insert(categories)
		.values({ id, projectId, name: name.trim().slice(0, 80), color })
		.onDuplicateKeyUpdate({ set: { color } });
	const [row] = await db
		.select()
		.from(categories)
		.where(and(eq(categories.projectId, projectId), eq(categories.name, name.trim().slice(0, 80))))
		.limit(1);
	return row;
}

/** Returns `null` if the category doesn't exist, or `'duplicate'` if the new name collides. */
export async function updateCategory(
	projectId: string,
	categoryId: string,
	patch: { name?: string; color?: string }
): Promise<ReturnType<typeof createCategory> | null | 'duplicate'> {
	const set: { name?: string; color?: string } = {};
	if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 80);
	if (patch.color !== undefined) set.color = patch.color;
	if (!Object.keys(set).length) return null;
	try {
		await db
			.update(categories)
			.set(set)
			.where(and(eq(categories.id, categoryId), eq(categories.projectId, projectId)));
	} catch (e) {
		if (isDuplicateKeyError(e)) return 'duplicate';
		throw e;
	}
	const [row] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
	return row ?? null;
}

export async function deleteCategory(projectId: string, categoryId: string) {
	await db.delete(categories).where(and(eq(categories.id, categoryId), eq(categories.projectId, projectId)));
}

// ─── Attachments ────────────────────────────────────────────────────────────
export async function addAttachment(
	todoId: string,
	data: { id: string; key: string; name: string | null; mime: string | null; size: number | null },
	actorId: string
): Promise<AttachmentRef & { todoId: string }> {
	await db.insert(attachments).values({
		id: data.id,
		todoId,
		key: data.key,
		name: data.name,
		mime: data.mime,
		size: data.size
	});
	await recordEvents(db, actorId, [{ todoId, field: 'image', to: data.name ?? 'image' }]);
	return { id: data.id, todoId, name: data.name, mime: data.mime, size: data.size, url: '' };
}

/** Fetch an attachment, verifying it belongs to the given project. */
export async function getAttachment(projectId: string, attachmentId: string) {
	const [row] = await db
		.select({
			id: attachments.id,
			todoId: attachments.todoId,
			key: attachments.key,
			mime: attachments.mime,
			name: attachments.name
		})
		.from(attachments)
		.innerJoin(todos, eq(todos.id, attachments.todoId))
		.where(and(eq(attachments.id, attachmentId), liveIn(projectId)))
		.limit(1);
	return row ?? null;
}

export async function deleteAttachmentRow(
	att: { id: string; todoId: string; name: string | null },
	actorId: string
) {
	await db.delete(attachments).where(eq(attachments.id, att.id));
	await recordEvents(db, actorId, [{ todoId: att.todoId, field: 'image', from: att.name ?? 'image' }]);
}

// ─── Links ──────────────────────────────────────────────────────────────────
/** A lightweight, cross-project todo reference, for the "link a task" picker. */
export interface TodoRef {
	id: string;
	title: string;
	completed: boolean;
	projectId: string;
	projectSlug: string;
	projectName: string;
}

/** Every live task in the given projects, for picking a cross-project link target. */
export async function searchTodosInProjects(projectIds: string[]): Promise<TodoRef[]> {
	if (!projectIds.length) return [];
	const rows = await db
		.select({
			id: todos.id,
			title: todos.title,
			completed: todos.completed,
			projectId: projects.id,
			projectSlug: projects.slug,
			projectName: projects.name
		})
		.from(todos)
		.innerJoin(projects, eq(projects.id, todos.projectId))
		.where(and(inArray(todos.projectId, projectIds), isNull(todos.deletedAt)))
		.orderBy(desc(todos.createdAt));
	return rows;
}

export async function addUrlLink(
	todoId: string,
	data: { url: string; title: string | null },
	actorId: string
): Promise<TodoLink> {
	const id = newId();
	await db.insert(todoLinks).values({ id, todoId, kind: 'url', url: data.url, title: data.title });
	await recordEvents(db, actorId, [{ todoId, field: 'link', to: data.title || data.url }]);
	return { id, kind: 'url', url: data.url, title: data.title, linkedTodo: null };
}

/** `linkedTodoId` must already be checked to belong to `linkedProjectId` (a project the actor can view). */
export async function addTaskLink(
	todoId: string,
	linkedTodoId: string,
	actorId: string
): Promise<TodoLink | null> {
	const [target] = await db
		.select({
			id: todos.id,
			title: todos.title,
			completed: todos.completed,
			deletedAt: todos.deletedAt,
			projectId: projects.id,
			projectSlug: projects.slug,
			projectName: projects.name
		})
		.from(todos)
		.innerJoin(projects, eq(projects.id, todos.projectId))
		.where(eq(todos.id, linkedTodoId))
		.limit(1);
	if (!target) return null;

	const id = newId();
	await db.insert(todoLinks).values({ id, todoId, kind: 'task', linkedTodoId });
	await recordEvents(db, actorId, [{ todoId, field: 'link', to: target.title }]);
	return { id, kind: 'task', url: null, title: null, linkedTodo: target };
}

/** Fetch a link, verifying it belongs to the given project. */
export async function getLink(projectId: string, linkId: string) {
	const linkedTodo = alias(todos, 'linked_todo');
	const [row] = await db
		.select({
			id: todoLinks.id,
			todoId: todoLinks.todoId,
			kind: todoLinks.kind,
			url: todoLinks.url,
			title: todoLinks.title,
			linkedTitle: linkedTodo.title
		})
		.from(todoLinks)
		.innerJoin(todos, eq(todos.id, todoLinks.todoId))
		.leftJoin(linkedTodo, eq(linkedTodo.id, todoLinks.linkedTodoId))
		.where(and(eq(todoLinks.id, linkId), liveIn(projectId)))
		.limit(1);
	return row ?? null;
}

export async function deleteLink(
	link: {
		id: string;
		todoId: string;
		kind: LinkKind;
		url: string | null;
		title: string | null;
		linkedTitle: string | null;
	},
	actorId: string
) {
	await db.delete(todoLinks).where(eq(todoLinks.id, link.id));
	await recordEvents(db, actorId, [
		{ todoId: link.todoId, field: 'link', from: link.title || link.linkedTitle || link.url || 'link' }
	]);
}
