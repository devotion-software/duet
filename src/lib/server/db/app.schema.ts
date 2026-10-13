import { relations } from 'drizzle-orm';
import {
	mysqlTable,
	varchar,
	text,
	timestamp,
	boolean,
	int,
	mysqlEnum,
	index,
	uniqueIndex,
	primaryKey,
	type AnyMySqlColumn
} from 'drizzle-orm/mysql-core';
import { user } from './auth.schema';

export const ROLES = ['owner', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const URGENCIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Urgency = (typeof URGENCIES)[number];

export const SIZES = ['xs', 's', 'm', 'l', 'xl'] as const;
export type Size = (typeof SIZES)[number];

// Card presentation styles a project owner can pick.
export const PROJECT_STYLES = ['soft', 'solid', 'outline', 'glass'] as const;
export type ProjectStyle = (typeof PROJECT_STYLES)[number];

// Lifecycle of a project; archived ones are tucked away in the sidebar.
export const PROJECT_STATUSES = ['not_started', 'in_progress', 'live', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// Task details that can be shown in a row on the main list.
export const ROW_FIELDS = [
	'urgency',
	'subtasks',
	'category',
	'tags',
	'deadline',
	'size',
	'notes',
	'attachments',
	'excerpt',
	'assignee'
] as const;
export type RowField = (typeof ROW_FIELDS)[number];

const id = () => varchar('id', { length: 36 }).primaryKey();
const createdAt = () => timestamp('created_at', { fsp: 3 }).defaultNow().notNull();
const updatedAt = () =>
	timestamp('updated_at', { fsp: 3 })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull();

// ─── Projects ─────────────────────────────────────────────────────────────
export const projects = mysqlTable(
	'projects',
	{
		id: id(),
		slug: varchar('slug', { length: 160 }).notNull(),
		name: varchar('name', { length: 160 }).notNull(),
		description: text('description'),
		// Accent colour as a hex string, drives the project's CSS theme.
		color: varchar('color', { length: 32 }).notNull().default('#6366f1'),
		icon: varchar('icon', { length: 16 }).notNull().default('📋'),
		// Storage key of an uploaded image/SVG icon; when set it's shown instead of `icon`.
		iconKey: varchar('icon_key', { length: 255 }),
		style: mysqlEnum('style', PROJECT_STYLES).notNull().default('soft'),
		// Comma-separated RowFields hidden from task rows; stored as hidden so new fields show by default.
		hiddenFields: varchar('hidden_fields', { length: 255 }).notNull().default(''),
		// Max width of the task list in px; 0 lets it fill the window.
		listWidth: int('list_width').notNull().default(820),
		// Whether the sidebar's open-task count includes subtasks, or only top-level tasks.
		countSubtasks: boolean('count_subtasks').notNull().default(true),
		ownerId: varchar('owner_id', { length: 36 })
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		status: mysqlEnum('status', PROJECT_STATUSES).notNull().default('not_started'),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [uniqueIndex('projects_slug_idx').on(t.slug), index('projects_owner_idx').on(t.ownerId)]
);

// Per-user folders for grouping projects in the sidebar.
export const projectFolders = mysqlTable(
	'project_folders',
	{
		id: id(),
		userId: varchar('user_id', { length: 36 })
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 80 }).notNull(),
		// Shares an ordering with the user's unfoldered projects (projectMembers.sortOrder).
		sortOrder: int('sort_order').notNull().default(0),
		collapsed: boolean('collapsed').notNull().default(false),
		createdAt: createdAt()
	},
	(t) => [index('project_folders_user_idx').on(t.userId)]
);

export const projectMembers = mysqlTable(
	'project_members',
	{
		id: id(),
		projectId: varchar('project_id', { length: 36 })
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		userId: varchar('user_id', { length: 36 })
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: mysqlEnum('role', ROLES).notNull().default('editor'),
		// Per-user ordering of their project list: within the folder if there is one,
		// otherwise among the user's top-level folders and projects.
		sortOrder: int('sort_order').notNull().default(0),
		// The member's own sidebar folder for this project, if any.
		folderId: varchar('folder_id', { length: 36 }).references(() => projectFolders.id, {
			onDelete: 'set null'
		}),
		createdAt: createdAt()
	},
	(t) => [
		uniqueIndex('project_members_unique').on(t.projectId, t.userId),
		index('project_members_user_idx').on(t.userId)
	]
);

export const projectInvites = mysqlTable(
	'project_invites',
	{
		id: id(),
		projectId: varchar('project_id', { length: 36 })
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		email: varchar('email', { length: 255 }).notNull(),
		role: mysqlEnum('role', ROLES).notNull().default('editor'),
		token: varchar('token', { length: 64 }).notNull(),
		invitedById: varchar('invited_by_id', { length: 36 })
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: createdAt(),
		expiresAt: timestamp('expires_at', { fsp: 3 }).notNull()
	},
	(t) => [
		uniqueIndex('project_invites_token_idx').on(t.token),
		uniqueIndex('project_invites_unique').on(t.projectId, t.email)
	]
);

// ─── Taxonomy (per-project) ────────────────────────────────────────────────
export const categories = mysqlTable(
	'categories',
	{
		id: id(),
		projectId: varchar('project_id', { length: 36 })
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 80 }).notNull(),
		color: varchar('color', { length: 32 }).notNull().default('#64748b'),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('categories_unique').on(t.projectId, t.name)]
);

export const tags = mysqlTable(
	'tags',
	{
		id: id(),
		projectId: varchar('project_id', { length: 36 })
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 60 }).notNull(),
		color: varchar('color', { length: 32 }).notNull().default('#64748b'),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('tags_unique').on(t.projectId, t.name)]
);

// ─── Todos ─────────────────────────────────────────────────────────────────
export const todos = mysqlTable(
	'todos',
	{
		id: id(),
		projectId: varchar('project_id', { length: 36 })
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		// Parent task for subtasks; nesting depth is unbounded. Deletes remove
		// descendants explicitly (deepest first) since InnoDB caps cascade depth.
		parentId: varchar('parent_id', { length: 36 }).references((): AnyMySqlColumn => todos.id, {
			onDelete: 'cascade'
		}),
		title: varchar('title', { length: 500 }).notNull(),
		description: text('description'),
		completed: boolean('completed').notNull().default(false),
		completedAt: timestamp('completed_at', { fsp: 3 }),
		// Set while a task is being worked on; cleared when it's completed.
		startedAt: timestamp('started_at', { fsp: 3 }),
		categoryId: varchar('category_id', { length: 36 }).references(() => categories.id, {
			onDelete: 'set null'
		}),
		assigneeId: varchar('assignee_id', { length: 36 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		deadline: timestamp('deadline', { fsp: 3 }),
		urgency: mysqlEnum('urgency', URGENCIES),
		size: mysqlEnum('size', SIZES),
		// Larger sortOrder floats to the top; we insert new items above existing ones.
		sortOrder: int('sort_order').notNull().default(0),
		createdById: varchar('created_by_id', { length: 36 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('todos_project_idx').on(t.projectId),
		index('todos_project_completed_idx').on(t.projectId, t.completed),
		index('todos_assignee_idx').on(t.assigneeId),
		index('todos_parent_idx').on(t.parentId)
	]
);

export const todoTags = mysqlTable(
	'todo_tags',
	{
		todoId: varchar('todo_id', { length: 36 })
			.notNull()
			.references(() => todos.id, { onDelete: 'cascade' }),
		tagId: varchar('tag_id', { length: 36 })
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.todoId, t.tagId] }), index('todo_tags_tag_idx').on(t.tagId)]
);

export const attachments = mysqlTable(
	'attachments',
	{
		id: id(),
		todoId: varchar('todo_id', { length: 36 })
			.notNull()
			.references(() => todos.id, { onDelete: 'cascade' }),
		// Object storage key (R2 or local dev fallback). Column kept as 'url' for
		// migration-compatibility; it holds a storage key, not a public URL.
		key: varchar('url', { length: 1024 }).notNull(),
		name: varchar('name', { length: 255 }),
		mime: varchar('mime', { length: 120 }),
		size: int('size'),
		createdAt: createdAt()
	},
	(t) => [index('attachments_todo_idx').on(t.todoId)]
);

// ─── Secrets (per-project) ─────────────────────────────────────────────────
// API keys, passwords and the like. Values are AES-256-GCM encrypted at rest
// (see server/secrets.ts) and only decrypted when a member explicitly reveals one.
export const projectSecrets = mysqlTable(
	'project_secrets',
	{
		id: id(),
		projectId: varchar('project_id', { length: 36 })
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 120 }).notNull(),
		note: varchar('note', { length: 500 }),
		// "iv.tag.ciphertext", each base64url.
		value: text('value').notNull(),
		createdById: varchar('created_by_id', { length: 36 }).references(() => user.id, {
			onDelete: 'set null'
		}),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [index('project_secrets_project_idx').on(t.projectId)]
);

// ─── Relations ─────────────────────────────────────────────────────────────
export const projectsRelations = relations(projects, ({ one, many }) => ({
	owner: one(user, { fields: [projects.ownerId], references: [user.id] }),
	members: many(projectMembers),
	todos: many(todos),
	categories: many(categories),
	tags: many(tags),
	invites: many(projectInvites)
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
	project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
	user: one(user, { fields: [projectMembers.userId], references: [user.id] }),
	folder: one(projectFolders, { fields: [projectMembers.folderId], references: [projectFolders.id] })
}));

export const projectFoldersRelations = relations(projectFolders, ({ one, many }) => ({
	user: one(user, { fields: [projectFolders.userId], references: [user.id] }),
	members: many(projectMembers)
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
	project: one(projects, { fields: [categories.projectId], references: [projects.id] }),
	todos: many(todos)
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
	project: one(projects, { fields: [tags.projectId], references: [projects.id] }),
	todoTags: many(todoTags)
}));

export const todosRelations = relations(todos, ({ one, many }) => ({
	project: one(projects, { fields: [todos.projectId], references: [projects.id] }),
	category: one(categories, { fields: [todos.categoryId], references: [categories.id] }),
	assignee: one(user, { fields: [todos.assigneeId], references: [user.id] }),
	parent: one(todos, { fields: [todos.parentId], references: [todos.id], relationName: 'subtasks' }),
	subtasks: many(todos, { relationName: 'subtasks' }),
	todoTags: many(todoTags),
	attachments: many(attachments)
}));

export const todoTagsRelations = relations(todoTags, ({ one }) => ({
	todo: one(todos, { fields: [todoTags.todoId], references: [todos.id] }),
	tag: one(tags, { fields: [todoTags.tagId], references: [tags.id] })
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
	todo: one(todos, { fields: [attachments.todoId], references: [todos.id] })
}));
