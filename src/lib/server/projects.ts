import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import {
	projects,
	projectMembers,
	projectFolders,
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
import { buildSidebar, type ProjectFolder, type SidebarItem } from '../sidebar';
import { LIST_WIDTH } from '../palette';

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
	/** The user's sidebar folder for the project, if any. */
	folderId: string | null;
	sortOrder: number;
	/** The project's setting, or the user's default when the project leaves it unset. */
	countSubtasks: boolean;
	/** Open tasks, counting subtasks only if `countSubtasks` is set. */
	openCount: number;
	totalCount: number;
}

/** A user's account-wide settings for projects that leave their own unset. */
export interface ProjectDefaults {
	listWidth: number;
	countSubtasks: boolean;
}

export function projectDefaultsFor(u: {
	defaultListWidth?: number | null;
	defaultCountSubtasks?: boolean | null;
}): ProjectDefaults {
	return {
		listWidth: u.defaultListWidth ?? LIST_WIDTH.default,
		countSubtasks: u.defaultCountSubtasks ?? true
	};
}

/** Parse the stored comma-separated list, dropping fields that no longer exist. */
export function parseHiddenFields(raw: string | null | undefined): RowField[] {
	return (raw ?? '').split(',').filter((f): f is RowField => ROW_FIELDS.includes(f as RowField));
}

/** All projects the user belongs to, with their role and task counts. */
export async function listUserProjects(
	userId: string,
	defaults: ProjectDefaults
): Promise<ProjectSummary[]> {
	const rows = await db
		.select({
			project: projects,
			role: projectMembers.role,
			folderId: projectMembers.folderId,
			sortOrder: projectMembers.sortOrder
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
		const countSubtasks = r.project.countSubtasks ?? defaults.countSubtasks;
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
			folderId: r.folderId,
			sortOrder: r.sortOrder,
			countSubtasks,
			openCount: Number((countSubtasks ? c?.open : c?.openRoots) ?? 0),
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

/**
 * The project as the user sees it: `listWidth` and `countSubtasks` fall back to their
 * defaults, while `*Setting` hold the project's own values (null = use the default).
 */
export async function getProjectBySlugForUser(
	userId: string,
	slug: string,
	defaults: ProjectDefaults
) {
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
				listWidth: row.project.listWidth ?? defaults.listWidth,
				listWidthSetting: row.project.listWidth,
				countSubtasks: row.project.countSubtasks ?? defaults.countSubtasks,
				countSubtasksSetting: row.project.countSubtasks,
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
	const sortOrder = await nextSidebarOrder(userId);

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
		sortOrder
	});

	return { id, slug };
}

export async function updateProject(
	projectId: string,
	patch: Partial<Pick<CreateProjectInput, 'name' | 'description' | 'color' | 'icon' | 'style' | 'status'>> & {
		hiddenFields?: RowField[];
		/** null resets these to the account default. */
		listWidth?: number | null;
		countSubtasks?: boolean | null;
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

// ─── Sidebar folders ────────────────────────────────────────────────────────
export async function listUserFolders(userId: string): Promise<ProjectFolder[]> {
	return db
		.select({
			id: projectFolders.id,
			name: projectFolders.name,
			sortOrder: projectFolders.sortOrder,
			collapsed: projectFolders.collapsed
		})
		.from(projectFolders)
		.where(eq(projectFolders.userId, userId))
		.orderBy(asc(projectFolders.sortOrder), asc(projectFolders.createdAt));
}

/** The user's whole sidebar arrangement, archived projects included. */
async function getSidebar(userId: string): Promise<SidebarItem[]> {
	const [folders, members] = await Promise.all([
		listUserFolders(userId),
		db
			.select({
				id: projectMembers.projectId,
				folderId: projectMembers.folderId,
				sortOrder: projectMembers.sortOrder
			})
			.from(projectMembers)
			.innerJoin(projects, eq(projects.id, projectMembers.projectId))
			.where(eq(projectMembers.userId, userId))
			.orderBy(asc(projectMembers.sortOrder), asc(projects.createdAt))
	]);
	return buildSidebar(folders, members);
}

/** A sortOrder that puts a new top-level item at the bottom of the user's sidebar. */
async function nextSidebarOrder(userId: string): Promise<number> {
	const [[folderMax], [projectMax]] = await Promise.all([
		db
			.select({ max: sql<number>`coalesce(max(${projectFolders.sortOrder}), 0)` })
			.from(projectFolders)
			.where(eq(projectFolders.userId, userId)),
		db
			.select({ max: sql<number>`coalesce(max(${projectMembers.sortOrder}), 0)` })
			.from(projectMembers)
			.where(and(eq(projectMembers.userId, userId), isNull(projectMembers.folderId)))
	]);
	return Math.max(Number(folderMax?.max ?? 0), Number(projectMax?.max ?? 0)) + 1;
}

/** Create a folder at the bottom of the user's sidebar. */
export async function createFolder(userId: string, name: string): Promise<ProjectFolder> {
	const folder = {
		id: newId(),
		name: name.trim().slice(0, 80),
		sortOrder: await nextSidebarOrder(userId),
		collapsed: false
	};
	await db.insert(projectFolders).values({ ...folder, userId });
	return folder;
}

/** Rename or collapse/expand one of the user's folders. Returns false if it isn't theirs. */
export async function updateFolder(
	userId: string,
	folderId: string,
	patch: { name?: string; collapsed?: boolean }
): Promise<boolean> {
	const values: Record<string, unknown> = {};
	if (patch.name !== undefined) values.name = patch.name.trim().slice(0, 80);
	if (patch.collapsed !== undefined) values.collapsed = patch.collapsed;
	const [res] = await db
		.update(projectFolders)
		.set(values)
		.where(and(eq(projectFolders.id, folderId), eq(projectFolders.userId, userId)));
	return res.affectedRows > 0;
}

/** Delete a folder, leaving its projects at the top level where the folder was. */
export async function deleteFolder(userId: string, folderId: string): Promise<boolean> {
	const sidebar = await getSidebar(userId);
	const index = sidebar.findIndex((i) => i.type === 'folder' && i.id === folderId);
	if (index < 0) return false;
	const folder = sidebar[index] as Extract<SidebarItem, { type: 'folder' }>;
	sidebar.splice(index, 1, ...folder.projectIds.map((id) => ({ type: 'project' as const, id })));
	await saveSidebar(userId, sidebar);
	await db
		.delete(projectFolders)
		.where(and(eq(projectFolders.id, folderId), eq(projectFolders.userId, userId)));
	return true;
}

/**
 * Persist the user's sidebar arrangement. Folders and projects that aren't the user's
 * are ignored, as are any of theirs left out (e.g. archived projects keep their place).
 */
export async function saveSidebar(userId: string, items: SidebarItem[]) {
	const [folders, members] = await Promise.all([
		db.select({ id: projectFolders.id }).from(projectFolders).where(eq(projectFolders.userId, userId)),
		db
			.select({ id: projectMembers.projectId })
			.from(projectMembers)
			.where(eq(projectMembers.userId, userId))
	]);
	const folderIds = new Set(folders.map((f) => f.id));
	const projectIds = new Set(members.map((m) => m.id));

	const placements: { projectId: string; folderId: string | null; sortOrder: number }[] = [];
	const folderOrders: { id: string; sortOrder: number }[] = [];
	items.forEach((item, i) => {
		if (item.type === 'project') {
			if (projectIds.has(item.id)) placements.push({ projectId: item.id, folderId: null, sortOrder: i });
		} else if (folderIds.has(item.id)) {
			folderOrders.push({ id: item.id, sortOrder: i });
			item.projectIds.forEach((pid, j) => {
				if (projectIds.has(pid)) placements.push({ projectId: pid, folderId: item.id, sortOrder: j });
			});
		}
	});

	await db.transaction(async (tx) => {
		for (const f of folderOrders) {
			await tx
				.update(projectFolders)
				.set({ sortOrder: f.sortOrder })
				.where(and(eq(projectFolders.id, f.id), eq(projectFolders.userId, userId)));
		}
		for (const p of placements) {
			await tx
				.update(projectMembers)
				.set({ folderId: p.folderId, sortOrder: p.sortOrder })
				.where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, p.projectId)));
		}
	});
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
