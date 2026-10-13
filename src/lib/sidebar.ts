// Arrangement of a user's projects into folders for the sidebar. Shared by the
// server (which persists it) and the client (which drags it around).

export interface ProjectFolder {
	id: string;
	name: string;
	sortOrder: number;
	collapsed: boolean;
}

/** One top-level sidebar entry; folders list their projects in order. */
export type SidebarItem =
	| { type: 'project'; id: string }
	| { type: 'folder'; id: string; projectIds: string[] };

interface PlacedProject {
	id: string;
	folderId: string | null;
	sortOrder: number;
}

/**
 * Arrange projects (already in sortOrder) and folders into sidebar order. Folders and
 * unfoldered projects share one ordering; on a tie the folder comes first.
 */
export function buildSidebar(folders: ProjectFolder[], projects: PlacedProject[]): SidebarItem[] {
	const inFolder = new Map(folders.map((f) => [f.id, [] as string[]]));
	const top: { item: SidebarItem; sortOrder: number; folder: boolean }[] = folders.map((f) => ({
		item: { type: 'folder', id: f.id, projectIds: inFolder.get(f.id)! },
		sortOrder: f.sortOrder,
		folder: true
	}));
	for (const p of projects) {
		const list = p.folderId ? inFolder.get(p.folderId) : undefined;
		if (list) list.push(p.id);
		else top.push({ item: { type: 'project', id: p.id }, sortOrder: p.sortOrder, folder: false });
	}
	// Array sort is stable, so equal entries keep their incoming order.
	top.sort((a, b) => a.sortOrder - b.sortOrder || Number(b.folder) - Number(a.folder));
	return top.map((t) => t.item);
}

export type SidebarDrag = { type: 'project' | 'folder'; id: string };

/** Where a dragged item lands: next to an item, inside a folder, or at the very end. */
export type SidebarDrop = { id: string; pos: 'before' | 'after' | 'inside' } | { pos: 'end' };

/** The sidebar with `drag` moved to `drop`. Folders can't be nested, so they only move at the top level. */
export function moveSidebarItem(
	items: SidebarItem[],
	drag: SidebarDrag,
	drop: SidebarDrop
): SidebarItem[] {
	const next = items.map((i) => (i.type === 'folder' ? { ...i, projectIds: [...i.projectIds] } : i));
	let moving: SidebarItem;
	if (drag.type === 'folder') {
		const index = next.findIndex((i) => i.type === 'folder' && i.id === drag.id);
		if (index < 0) return items;
		[moving] = next.splice(index, 1);
	} else {
		moving = { type: 'project', id: drag.id };
		const index = next.findIndex((i) => i.type === 'project' && i.id === drag.id);
		if (index >= 0) next.splice(index, 1);
		for (const i of next) if (i.type === 'folder') i.projectIds = i.projectIds.filter((id) => id !== drag.id);
	}

	if (drop.pos === 'end') {
		next.push(moving);
		return next;
	}
	if (drop.pos === 'inside') {
		const folder = next.find((i) => i.type === 'folder' && i.id === drop.id);
		if (folder?.type !== 'folder' || moving.type !== 'project') return items;
		folder.projectIds.push(moving.id);
		return next;
	}
	const offset = drop.pos === 'after' ? 1 : 0;
	const index = next.findIndex((i) => i.id === drop.id);
	if (index >= 0) {
		next.splice(index + offset, 0, moving);
		return next;
	}
	// The target is a project inside a folder.
	const folder = next.find((i) => i.type === 'folder' && i.projectIds.includes(drop.id));
	if (folder?.type !== 'folder' || moving.type !== 'project') return items;
	folder.projectIds.splice(folder.projectIds.indexOf(drop.id) + offset, 0, moving.id);
	return next;
}
