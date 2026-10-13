import { json, error } from '@sveltejs/kit';
import { createFolder } from '#lib/server/projects';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const body = await request.json().catch(() => null);
	const name = String(body?.name ?? '').trim();
	if (!name) throw error(400, 'A folder name is required');
	return json(await createFolder(locals.user.id, name));
};
