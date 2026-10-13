import { parseChecklist } from './parseChecklist';
import { URGENCIES, SIZES, type Urgency, type Size } from './types';

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
}

export interface ParsedImport {
	kind: 'json' | 'checklist';
	items: ImportItem[];
}

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
	for (const raw of list) {
		if (!raw || typeof raw !== 'object') continue;
		const t = raw as Record<string, unknown>;
		const title = str(t.title, 500);
		if (!title) continue;
		const completed = t.completed === true;
		items.push({
			title,
			completed,
			completedAt: completed ? date(t.completedAt) : null,
			description: str(t.description, 65_535),
			deadline: date(t.deadline),
			urgency: oneOf(t.urgency, URGENCIES),
			size: oneOf(t.size, SIZES),
			category: ref(t.category, 80),
			tags: Array.isArray(t.tags)
				? t.tags.map((x) => ref(x, 60)).filter((x): x is ImportRef => !!x)
				: [],
			assigneeId: str(t.assigneeId, 36)
		});
	}
	return items;
}

/** Parse pasted/uploaded text as a Duet JSON export, falling back to a checklist. */
export function parseImport(text: string): ParsedImport {
	const json = parseExportJson(text);
	if (json) return { kind: 'json', items: json };
	return { kind: 'checklist', items: parseChecklist(text) };
}
