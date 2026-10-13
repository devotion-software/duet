import { json, error } from '@sveltejs/kit';
import { updateFolder, deleteFolder } from '#lib/server/projects';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const body = await request.json().catch(() => null);
	const patch: { name?: string; collapsed?: boolean } = {};
	if (typeof body?.name === 'string') {
		if (!body.name.trim()) throw error(400, 'A folder name is required');
		patch.name = body.name;
	}
	if (typeof body?.collapsed === 'boolean') patch.collapsed = body.collapsed;
	if (!Object.keys(patch).length) throw error(400, 'Nothing to update');
	if (!(await updateFolder(locals.user.id, params.folderId, patch))) throw error(404, 'Folder not found');
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	if (!(await deleteFolder(locals.user.id, params.folderId))) throw error(404, 'Folder not found');
	return json({ ok: true });
};
