import { json, error } from '@sveltejs/kit';
import { setUserAvatar, validateIconFile } from '#lib/server/avatar';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const formData = await request.formData().catch(() => null);
	const file = formData?.get('avatar');
	if (!(file instanceof File) || !file.size) throw error(400, 'No image provided');
	const issue = validateIconFile(file);
	if (issue) throw error(400, issue);
	await setUserAvatar(locals.user.id, file);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	await setUserAvatar(locals.user.id, null);
	return json({ ok: true });
};
