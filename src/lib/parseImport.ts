import { parseChecklist } from './parseChecklist';
import { URGENCIES, SIZES, type Urgency, type Size } from './types';
import { TAG_COLORS } from './palette';

export interface ImportRef {
	name: string;
	color: string;
}

/** A task to import. Checklist imports only fill `title` and `completed`. */
export interface ImportItem {
	title: string;
	completed: boolean;
	completedAt?: Date | null;
	description?: string | null;
	deadline?: Date | null;
	urgency?: Urgency | null;
	size?: Size | null;
	category?: ImportRef | null;
	tags?: ImportRef[];
	assigneeId?: string | null;
	/** Index (in the same list) of this item's parent task. */
	parentIndex?: number | null;
}

export interface ParsedImport {
	kind: 'json' | 'checklist';
	items: ImportItem[];
	/** Checklist group headers, in order of appearance. */
	groups: string[];
}

/** How checklist group headers are applied to the items beneath them. */
export type GroupAs = 'category' | 'tag' | 'none';
export const GROUP_AS: readonly GroupAs[] = ['category', 'tag', 'none'];

const DEFAULT_COLOR = '#64748b';

function str(v: unknown, max: number): string | null {
	return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}
function date(v: unknown): Date | null {
	if (typeof v !== 'string' && typeof v !== 'number') return null;
	const d = new Date(v);
	return isNaN(d.getTime()) ? null : d;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
	return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}
function ref(v: unknown, max: number): ImportRef | null {
	if (!v || typeof v !== 'object') return null;
	const r = v as Record<string, unknown>;
	const name = str(r.name, max);
	if (!name) return null;
	const color = typeof r.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(r.color) ? r.color : DEFAULT_COLOR;
	return { name, color };
}

/** Parse a JSON file produced by `formatTodosAsJson`; null if `text` isn't one. */
export function parseExportJson(text: string): ImportItem[] | null {
	if (!text.trimStart().startsWith('{')) return null;
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return null;
	}
	const list = (data as { todos?: unknown })?.todos;
	if (!Array.isArray(list)) return null;

	const items: ImportItem[] = [];
	// Exported ids are only used to rebuild the hierarchy; new ids are minted.
	const exportIds: (string | null)[] = [];
	const parentIds: (string | null)[] = [];
	for (const raw of list) {
		if (!raw || typeof raw !== 'object') continue;
		const t = raw as Record<string, unknown>;
		const fullTitle = typeof t.title === 'string' ? t.title.trim() : '';
		if (!fullTitle) continue;
		const title = fullTitle.slice(0, 500);
		const overflow = fullTitle.slice(500).trim();
		const completed = t.completed === true;
		const description = str(t.description, 65_535);
		items.push({
			title,
			completed,
			completedAt: completed ? date(t.completedAt) : null,
			description: overflow
				? [overflow, description].filter(Boolean).join('\n\n').slice(0, 65_535)
				: description,
			deadline: date(t.deadline),
			urgency: oneOf(t.urgency, URGENCIES),
			size: oneOf(t.size, SIZES),
			category: ref(t.category, 80),
			tags: Array.isArray(t.tags)
				? t.tags.map((x) => ref(x, 60)).filter((x): x is ImportRef => !!x)
				: [],
			assigneeId: str(t.assigneeId, 36)
		});
		exportIds.push(str(t.id, 64));
		parentIds.push(str(t.parentId, 64));
	}
	const indexById = new Map(exportIds.flatMap((id, i) => (id ? [[id, i] as const] : [])));
	parentIds.forEach((pid, i) => {
		const p = pid ? indexById.get(pid) : undefined;
		if (p !== undefined && p !== i) items[i].parentIndex = p;
	});
	return items;
}

/**
 * Parse pasted/uploaded text as a Duet JSON export, falling back to a checklist.
 * Checklist group headers become each item's category or tag per `groupAs`.
 */
export function parseImport(text: string, groupAs: GroupAs = 'category'): ParsedImport {
	const json = parseExportJson(text);
	if (json) return { kind: 'json', items: json, groups: [] };

	const parsed = parseChecklist(text);
	const groups = [...new Set(parsed.flatMap((p) => (p.group ? [p.group] : [])))];
	const refs = new Map(
		groups.map((name, i) => [name, { name, color: TAG_COLORS[i % TAG_COLORS.length] }])
	);
	const items = parsed.map(({ title, completed, description, group, parent }): ImportItem => {
		const base = { title, completed, description: description ?? null, parentIndex: parent ?? null };
		const r = group ? refs.get(group) : undefined;
		if (!r || groupAs === 'none') return base;
		return groupAs === 'category' ? { ...base, category: r } : { ...base, tags: [r] };
	});
	return { kind: 'checklist', items, groups };
}
