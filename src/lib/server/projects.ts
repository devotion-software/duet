import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import {
	projects,
	projectMembers,
	projectInvites,
	todos,
	ROW_FIELDS,
	type Role,
	type ProjectStyle,
	type ProjectStatus,
	type RowField
} from './db/app.schema';
import { user } from './db/auth.schema';
import { newId, newToken, slugify } from './ids';
import { putObject, deleteObject } from './storage';

export interface ProjectSummary {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	color: string;
	icon: string;
	/** Uploaded image icon, shown in place of the emoji `icon` when set. */
	iconUrl: string | null;
	style: ProjectStyle;
	status: ProjectStatus;
	role: Role;
	countSubtasks: boolean;
	/** Open tasks, counting subtasks only if the project's `countSubtasks` is set. */
	openCount: number;
	totalCount: number;
}

/** Parse the stored comma-separated list, dropping fields that no longer exist. */
export function parseHiddenFields(raw: string | null | undefined): RowField[] {
	return (raw ?? '').split(',').filter((f): f is RowField => ROW_FIELDS.includes(f as RowField));
}

/** All projects the user belongs to, with their role and task counts. */
export async function listUserProjects(userId: string): Promise<ProjectSummary[]> {
	const rows = await db
		.select({
			project: projects,
			role: projectMembers.role
		})
		.from(projectMembers)
		.innerJoin(projects, eq(projects.id, projectMembers.projectId))
		.where(eq(projectMembers.userId, userId))
		.orderBy(asc(projectMembers.sortOrder), asc(projects.createdAt));

	const ids = rows.map((r) => r.project.id);
	const counts = ids.length
		? await db
				.select({
					projectId: todos.projectId,
					open: sql<number>`sum(case when ${todos.completed} = false then 1 else 0 end)`,
					openRoots: sql<number>`sum(case when ${todos.completed} = false and ${todos.parentId} is null then 1 else 0 end)`,
					total: sql<number>`count(*)`
				})
				.from(todos)
				.where(inArray(todos.projectId, ids))
				.groupBy(todos.projectId)
		: [];

	const countMap = new Map(counts.map((c) => [c.projectId, c]));

	return rows.map((r) => {
		const c = countMap.get(r.project.id);
		return {
			id: r.project.id,
			slug: r.project.slug,
			name: r.project.name,
			description: r.project.description,
			color: r.project.color,
			icon: r.project.icon,
			iconUrl: projectIconUrl(r.project),
			style: r.project.style,
			status: r.project.status,
			role: r.role,
			countSubtasks: r.project.countSubtasks,
			openCount: Number((r.project.countSubtasks ? c?.open : c?.openRoots) ?? 0),
			totalCount: Number(c?.total ?? 0)
		};
	});
}

/** Returns the user's role on a project, or null if they're not a member. */
export async function getMembership(userId: string, projectId: string): Promise<Role | null> {
	const [row] = await db
		.select({ role: projectMembers.role })
		.from(projectMembers)
		.where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, projectId)))
		.limit(1);
	return row?.role ?? null;
}

export async function getProjectBySlugForUser(userId: string, slug: string) {
	const [row] = await db
		.select({ project: projects, role: projectMembers.role })
		.from(projects)
		.innerJoin(
			projectMembers,
			and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId))
		)
		.where(eq(projects.slug, slug))
		.limit(1);
	return row
		? {
				...row.project,
				iconUrl: projectIconUrl(row.project),
				hiddenFields: parseHiddenFields(row.project.hiddenFields),
				role: row.role
			}
		: null;
}

interface CreateProjectInput {
	name: string;
	description?: string | null;
	color?: string;
	icon?: string;
	style?: ProjectStyle;
	status?: ProjectStatus;
}

export async function createProject(userId: string, input: CreateProjectInput) {
	const id = newId();
	const slug = slugify(input.name);
	const [maxOrder] = await db
		.select({ max: sql<number>`coalesce(max(${projectMembers.sortOrder}), 0)` })
		.from(projectMembers)
		.where(eq(projectMembers.userId, userId));

	await db.insert(projects).values({
		id,
		slug,
		name: input.name.trim().slice(0, 160),
		description: input.description?.trim() || null,
		color: input.color || '#6366f1',
		icon: input.icon || '📋',
		style: input.style || 'soft',
		status: input.status || 'not_started',
		ownerId: userId
	});

	await db.insert(projectMembers).values({
		id: newId(),
		projectId: id,
		userId,
		role: 'owner',
		sortOrder: Number(maxOrder?.max ?? 0) + 1
	});

	return { id, slug };
}

export async function updateProject(
	projectId: string,
	patch: Partial<Pick<CreateProjectInput, 'name' | 'description' | 'color' | 'icon' | 'style' | 'status'>> & {
		hiddenFields?: RowField[];
		listWidth?: number;
		countSubtasks?: boolean;
	}
) {
	const values: Record<string, unknown> = {};
	if (patch.name !== undefined) values.name = patch.name.trim().slice(0, 160);
	if (patch.description !== undefined) values.description = patch.description?.trim() || null;
	if (patch.color !== undefined) values.color = patch.color;
	if (patch.icon !== undefined) values.icon = patch.icon;
	if (patch.style !== undefined) values.style = patch.style;
	if (patch.status !== undefined) values.status = patch.status;
	if (patch.hiddenFields !== undefined)
		values.hiddenFields = patch.hiddenFields.filter((f) => ROW_FIELDS.includes(f)).join(',');
	if (patch.listWidth !== undefined) values.listWidth = patch.listWidth;
	if (patch.countSubtasks !== undefined) values.countSubtasks = patch.countSubtasks;
	if (Object.keys(values).length === 0) return;
	await db.update(projects).set(values).where(eq(projects.id, projectId));
}

export async function deleteProject(projectId: string) {
	const iconKey = await getProjectIconKey(projectId);
	await db.delete(projects).where(eq(projects.id, projectId));
	if (iconKey) await deleteObject(iconKey);
}

// ─── Image icons ────────────────────────────────────────────────────────────
const ICON_EXT: Record<string, string> = {
	'image/svg+xml': 'svg',
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/avif': 'avif'
};
const ICON_MAX_MB = 2;

/** The key's unique filename doubles as a cache-buster, so the URL changes with the image. */
export function projectIconUrl(p: { id: string; iconKey: string | null }): string | null {
	if (!p.iconKey) return null;
	return `/api/projects/${p.id}/icon?v=${encodeURIComponent(p.iconKey.split('/').pop()!)}`;
}

/** Returns an error message if `file` can't be used as a project icon. */
export function validateIconFile(file: File): string | null {
	if (!ICON_EXT[file.type]) return 'Icons must be an SVG, PNG, JPEG, GIF, WebP or AVIF image';
	if (file.size > ICON_MAX_MB * 1024 * 1024) return `Icons must be under ${ICON_MAX_MB}MB`;
	return null;
}

/** Replace (or with `null`, remove) a project's image icon, cleaning up the old object. */
export async function setProjectIcon(projectId: string, file: File | null) {
	const oldKey = await getProjectIconKey(projectId);
	let key: string | null = null;
	if (file) {
		key = `project-icons/${projectId}/${newId()}.${ICON_EXT[file.type]}`;
		await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type);
	}
	await db.update(projects).set({ iconKey: key }).where(eq(projects.id, projectId));
	if (oldKey) await deleteObject(oldKey);
}

export async function getProjectIconKey(projectId: string): Promise<string | null> {
	const [row] = await db
		.select({ iconKey: projects.iconKey })
		.from(projects)
		.where(eq(projects.id, projectId));
	return row?.iconKey ?? null;
}

/** Persist a user's custom ordering of their project list. */
export async function reorderProjects(userId: string, orderedIds: string[]) {
	await Promise.all(
		orderedIds.map((pid, i) =>
			db
				.update(projectMembers)
				.set({ sortOrder: i })
				.where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, pid)))
		)
	);
}

// ─── Members & invites ──────────────────────────────────────────────────────
export interface MemberRow {
	userId: string;
	name: string;
	email: string;
	image: string | null;
	role: Role;
}

export async function listMembers(projectId: string): Promise<MemberRow[]> {
	return db
		.select({
			userId: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
			role: projectMembers.role
		})
		.from(projectMembers)
		.innerJoin(user, eq(user.id, projectMembers.userId))
		.where(eq(projectMembers.projectId, projectId))
		.orderBy(asc(projectMembers.createdAt));
}

export async function listInvites(projectId: string) {
	return db
		.select()
		.from(projectInvites)
		.where(eq(projectInvites.projectId, projectId))
		.orderBy(asc(projectInvites.createdAt));
}

export type AddMemberResult =
	| { status: 'added'; member: MemberRow }
	| { status: 'invited'; email: string }
	| { status: 'exists' }
	| { status: 'self' };

export async function addMemberByEmail(
	projectId: string,
	inviterId: string,
	email: string,
	role: Role
): Promise<AddMemberResult> {
	const normalized = email.trim().toLowerCase();

	const [existingUser] = await db
		.select()
		.from(user)
		.where(eq(user.email, normalized))
		.limit(1);

	if (existingUser) {
		if (existingUser.id === inviterId) return { status: 'self' };
		const already = await getMembership(existingUser.id, projectId);
		if (already) return { status: 'exists' };
		await db.insert(projectMembers).values({
			id: newId(),
			projectId,
			userId: existingUser.id,
			role
		});
		return {
			status: 'added',
			member: {
				userId: existingUser.id,
				name: existingUser.name,
				email: existingUser.email,
				image: existingUser.image,
				role
			}
		};
	}

	// No account yet — record a pending invite (upsert by project+email).
	const token = newToken();
	const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
	await db
		.insert(projectInvites)
		.values({ id: newId(), projectId, email: normalized, role, token, invitedById: inviterId, expiresAt })
		.onDuplicateKeyUpdate({ set: { role, token, expiresAt } });
	return { status: 'invited', email: normalized };
}

export async function updateMemberRole(projectId: string, userId: string, role: Role) {
	await db
		.update(projectMembers)
		.set({ role })
		.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function removeMember(projectId: string, userId: string) {
	await db
		.delete(projectMembers)
		.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function countOwners(projectId: string): Promise<number> {
	const [row] = await db
		.select({ n: sql<number>`count(*)` })
		.from(projectMembers)
		.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'owner')));
	return Number(row?.n ?? 0);
}
