import { json, error } from '@sveltejs/kit';
import { saveSidebar } from '#lib/server/projects';
import type { SidebarItem } from '#lib/sidebar';
import type { RequestHandler } from './$types';

/** Parse a submitted sidebar arrangement, or null if it's malformed. */
function parseItems(raw: unknown): SidebarItem[] | null {
	if (!Array.isArray(raw)) return null;
	const items: SidebarItem[] = [];
	for (const r of raw) {
		if (r?.type === 'project' && typeof r.id === 'string') items.push({ type: 'project', id: r.id });
		else if (r?.type === 'folder' && typeof r.id === 'string' && Array.isArray(r.projectIds))
			items.push({ type: 'folder', id: r.id, projectIds: r.projectIds.map(String) });
		else return null;
	}
	return items;
}

/** Save the user's arrangement of projects and folders in the sidebar. */
export const PUT: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const body = await request.json().catch(() => null);
	const items = parseItems(body?.items);
	if (!items) throw error(400, 'items array required');
	await saveSidebar(locals.user.id, items);
	return json({ ok: true });
};
