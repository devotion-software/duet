export type Role = 'owner' | 'editor' | 'viewer';
export type Urgency = 'low' | 'medium' | 'high' | 'urgent';
export type Size = 'xs' | 's' | 'm' | 'l' | 'xl';
export type ProjectStyle = 'soft' | 'solid' | 'outline' | 'glass';
export type ProjectStatus = 'not_started' | 'in_progress' | 'live' | 'archived';
export type RowField =
	| 'urgency'
	| 'subtasks'
	| 'category'
	| 'tags'
	| 'deadline'
	| 'size'
	| 'notes'
	| 'attachments'
	| 'excerpt'
	| 'assignee';

export const URGENCIES: Urgency[] = ['low', 'medium', 'high', 'urgent'];
export const SIZES: Size[] = ['xs', 's', 'm', 'l', 'xl'];

/** Project lifecycle statuses, in picker order. */
export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
	{ value: 'not_started', label: 'Not started' },
	{ value: 'in_progress', label: 'In progress' },
	{ value: 'live', label: 'Live' },
	{ value: 'archived', label: 'Archived' }
];

/** Task details a project can show or hide on list rows, in settings order. */
export const ROW_FIELD_LABELS: Record<RowField, string> = {
	urgency: 'Urgency',
	subtasks: 'Subtask progress',
	category: 'Category',
	tags: 'Tags',
	deadline: 'Deadline',
	size: 'Size',
	notes: 'Notes icon',
	attachments: 'Image count',
	excerpt: 'Notes preview',
	assignee: 'Assignee'
};
export const ROW_FIELDS = Object.keys(ROW_FIELD_LABELS) as RowField[];

export const ROLE_LABELS: Record<Role, string> = {
	owner: 'Owner',
	editor: 'Editor',
	viewer: 'Viewer'
};
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
	owner: 'Full control — manage members, settings and delete the project.',
	editor: 'Add, edit and complete tasks.',
	viewer: 'View tasks only.'
};

export interface Tag {
	id: string;
	name: string;
	color: string;
}
export interface Category {
	id: string;
	name: string;
	color: string;
}
export interface Member {
	userId: string;
	name: string;
	email: string;
	image: string | null;
	role: Role;
}
export interface Attachment {
	id: string;
	name: string | null;
	mime: string | null;
	size: number | null;
	url: string;
}

export interface Todo {
	id: string;
	projectId: string;
	/** Parent task when this is a subtask; nesting can go arbitrarily deep. */
	parentId: string | null;
	title: string;
	description: string | null;
	completed: boolean;
	completedAt: Date | null;
	/** Closed without being done; always paired with `completed`. */
	notDoing: boolean;
	/** Set while the task is being worked on; cleared on completion. */
	startedAt: Date | null;
	deadline: Date | null;
	urgency: Urgency | null;
	size: Size | null;
	sortOrder: number;
	categoryId: string | null;
	category: Category | null;
	assigneeId: string | null;
	assignee: { id: string; name: string; image: string | null } | null;
	createdAt: Date;
	updatedAt: Date;
	tags: Tag[];
	attachments: Attachment[];
}

/** Where a task stands, as recorded in its history. */
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'not_doing';

/** What a history entry changed; `tag`/`image` entries are one add or removal each. */
export type TodoField =
	| 'created'
	| 'title'
	| 'description'
	| 'status'
	| 'parent'
	| 'category'
	| 'assignee'
	| 'deadline'
	| 'urgency'
	| 'size'
	| 'tag'
	| 'image';

/** One recorded change. Values are display text; null means unset (or, for tag/image, absent). */
export interface TodoEvent {
	id: string;
	field: TodoField;
	from: string | null;
	to: string | null;
	actor: { id: string; name: string; email: string; image: string | null } | null;
	createdAt: Date;
}

/** Normalise a todo coming from JSON (string dates) into Date objects. */
export function hydrateTodo(raw: Record<string, unknown>): Todo {
	const d = (v: unknown): Date | null => (v ? new Date(v as string) : null);
	return {
		...(raw as unknown as Todo),
		parentId: (raw.parentId as string | null) ?? null,
		completedAt: d(raw.completedAt),
		notDoing: !!raw.notDoing,
		startedAt: d(raw.startedAt),
		deadline: d(raw.deadline),
		createdAt: d(raw.createdAt) ?? new Date(),
		updatedAt: d(raw.updatedAt) ?? new Date()
	};
}

export function isInProgress(t: Todo): boolean {
	return !!t.startedAt && !t.completed;
}

export const URGENCY_META: Record<Urgency, { label: string; color: string; rank: number }> = {
	low: { label: 'Low', color: '#64748b', rank: 1 },
	medium: { label: 'Medium', color: '#0ea5e9', rank: 2 },
	high: { label: 'High', color: '#f59e0b', rank: 3 },
	urgent: { label: 'Urgent', color: '#ef4444', rank: 4 }
};

export const SIZE_META: Record<Size, { label: string; full: string }> = {
	xs: { label: 'XS', full: 'Extra small' },
	s: { label: 'S', full: 'Small' },
	m: { label: 'M', full: 'Medium' },
	l: { label: 'L', full: 'Large' },
	xl: { label: 'XL', full: 'Extra large' }
};
