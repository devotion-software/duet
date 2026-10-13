import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import {
	todos,
	todoTags,
	tags,
	categories,
	attachments,
	projectMembers,
	type Urgency,
	type Size
} from './db/app.schema';
import { user } from './db/auth.schema';
import { newId } from './ids';
import type { ImportItem, ImportRef } from '#lib/parseImport';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
export interface TodoItem {
	id: string;
	projectId: string;
	title: string;
	description: string | null;
	completed: boolean;
	completedAt: Date | null;
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
		.where(eq(todos.projectId, projectId))
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
		.where(eq(todos.projectId, projectId));

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
		.where(eq(todos.projectId, projectId))
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

	return rows.map((r) => ({
		id: r.todo.id,
		projectId: r.todo.projectId,
		title: r.todo.title,
		description: r.todo.description,
		completed: r.todo.completed,
		completedAt: r.todo.completedAt,
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
		attachments: attByTodo.get(r.todo.id) ?? []
	}));
}

async function nextSortOrder(projectId: string): Promise<number> {
	const [row] = await db
		.select({ max: sql<number>`coalesce(max(${todos.sortOrder}), 0)` })
		.from(todos)
		.where(eq(todos.projectId, projectId));
	return Number(row?.max ?? 0) + 1;
}

export interface TodoInput {
	title: string;
	description?: string | null;
	categoryId?: string | null;
	assigneeId?: string | null;
	deadline?: Date | null;
	urgency?: Urgency | null;
	size?: Size | null;
	tagIds?: string[];
	completed?: boolean;
}

export async function createTodo(projectId: string, userId: string, input: TodoInput) {
	const id = newId();
	const sortOrder = await nextSortOrder(projectId);
	await db.insert(todos).values({
		id,
		projectId,
		title: input.title.trim().slice(0, 500),
		description: input.description?.trim() || null,
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
	return id;
}

export async function updateTodo(todoId: string, input: Partial<TodoInput>) {
	const values: Record<string, unknown> = {};
	if (input.title !== undefined) values.title = input.title.trim().slice(0, 500);
	if (input.description !== undefined) values.description = input.description?.trim() || null;
	if (input.categoryId !== undefined) values.categoryId = input.categoryId || null;
	if (input.assigneeId !== undefined) values.assigneeId = input.assigneeId || null;
	if (input.deadline !== undefined) values.deadline = input.deadline;
	if (input.urgency !== undefined) values.urgency = input.urgency;
	if (input.size !== undefined) values.size = input.size;
	if (Object.keys(values).length) {
		await db.update(todos).set(values).where(eq(todos.id, todoId));
	}
	if (input.tagIds !== undefined) await setTodoTags(todoId, input.tagIds);
}

export async function toggleTodo(todoId: string, completed: boolean) {
	await db
		.update(todos)
		.set({ completed, completedAt: completed ? new Date() : null })
		.where(eq(todos.id, todoId));
}

export async function deleteTodo(todoId: string) {
	await db.delete(todos).where(eq(todos.id, todoId));
}

/** Verify a todo belongs to a project (authorization guard for mutations). */
export async function todoBelongsToProject(todoId: string, projectId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: todos.id })
		.from(todos)
		.where(and(eq(todos.id, todoId), eq(todos.projectId, projectId)))
		.limit(1);
	return !!row;
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
	items = items.filter((i) => i.title.trim());
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

		const [row] = await tx
			.select({ max: sql<number>`coalesce(max(${todos.sortOrder}), 0)` })
			.from(todos)
			.where(eq(todos.projectId, projectId));
		const base = Number(row?.max ?? 0) + 1;
		const now = new Date();

		const links: { todoId: string; tagId: string }[] = [];
		const rows = items.map((i, idx) => {
			const id = newId();
			const itemTagIds = new Set((i.tags ?? []).map((t) => tagIds.get(t.name.toLowerCase())));
			for (const tagId of itemTagIds) if (tagId) links.push({ todoId: id, tagId });
			return {
				id,
				projectId,
				title: i.title.trim().slice(0, 500),
				description: i.description?.trim() || null,
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
		await tx.insert(todos).values(rows);
		if (links.length) await tx.insert(todoTags).values(links);
		return rows.length;
	});
}

export async function reorderTodos(projectId: string, orderedIds: string[]) {
	// Highest sortOrder = top of list.
	const n = orderedIds.length;
	await Promise.all(
		orderedIds.map((todoId, i) =>
			db
				.update(todos)
				.set({ sortOrder: n - i })
				.where(and(eq(todos.id, todoId), eq(todos.projectId, projectId)))
		)
	);
}

// ─── Tags & categories ──────────────────────────────────────────────────────
export async function listTags(projectId: string) {
	return db.select().from(tags).where(eq(tags.projectId, projectId)).orderBy(asc(tags.name));
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

export async function deleteTag(projectId: string, tagId: string) {
	await db.delete(tags).where(and(eq(tags.id, tagId), eq(tags.projectId, projectId)));
}

export async function listCategories(projectId: string) {
	return db
		.select()
		.from(categories)
		.where(eq(categories.projectId, projectId))
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

export async function deleteCategory(projectId: string, categoryId: string) {
	await db.delete(categories).where(and(eq(categories.id, categoryId), eq(categories.projectId, projectId)));
}

// ─── Attachments ────────────────────────────────────────────────────────────
export async function addAttachment(
	todoId: string,
	data: { id: string; key: string; name: string | null; mime: string | null; size: number | null }
): Promise<AttachmentRef & { todoId: string }> {
	await db.insert(attachments).values({
		id: data.id,
		todoId,
		key: data.key,
		name: data.name,
		mime: data.mime,
		size: data.size
	});
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
		.where(and(eq(attachments.id, attachmentId), eq(todos.projectId, projectId)))
		.limit(1);
	return row ?? null;
}

export async function deleteAttachmentRow(attachmentId: string) {
	await db.delete(attachments).where(eq(attachments.id, attachmentId));
}
