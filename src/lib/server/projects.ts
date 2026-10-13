import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import {
	projects,
	projectMembers,
	projectInvites,
	todos,
	type Role,
	type ProjectStyle
} from './db/app.schema';
import { user } from './db/auth.schema';
import { newId, newToken, slugify } from './ids';

export interface ProjectSummary {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	color: string;
	icon: string;
	style: ProjectStyle;
	archived: boolean;
	role: Role;
	openCount: number;
	totalCount: number;
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
			style: r.project.style,
			archived: r.project.archived,
			role: r.role,
			openCount: Number(c?.open ?? 0),
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
	return row ? { ...row.project, role: row.role } : null;
}

interface CreateProjectInput {
	name: string;
	description?: string | null;
	color?: string;
	icon?: string;
	style?: ProjectStyle;
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
	patch: Partial<Pick<CreateProjectInput, 'name' | 'description' | 'color' | 'icon' | 'style'>> & {
		archived?: boolean;
	}
) {
	const values: Record<string, unknown> = {};
	if (patch.name !== undefined) values.name = patch.name.trim().slice(0, 160);
	if (patch.description !== undefined) values.description = patch.description?.trim() || null;
	if (patch.color !== undefined) values.color = patch.color;
	if (patch.icon !== undefined) values.icon = patch.icon;
	if (patch.style !== undefined) values.style = patch.style;
	if (patch.archived !== undefined) values.archived = patch.archived;
	if (Object.keys(values).length === 0) return;
	await db.update(projects).set(values).where(eq(projects.id, projectId));
}

export async function deleteProject(projectId: string) {
	await db.delete(projects).where(eq(projects.id, projectId));
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
