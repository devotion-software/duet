import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { updateSavedView, deleteSavedView } from '#lib/server/todos';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const member = await requireMember(locals, params.projectId);
	const body = await request.json().catch(() => null);
	const patch: { name?: string; config?: string; global?: boolean } = {};
	if (body?.name !== undefined) {
		const name = String(body.name).trim();
		if (!name) throw error(400, 'View name required');
		patch.name = name;
	}
	if (body?.config !== undefined) {
		if (typeof body.config !== 'object') throw error(400, 'Invalid view config');
		patch.config = JSON.stringify(body.config);
	}
	if (body?.global !== undefined) patch.global = !!body.global;
	if (!Object.keys(patch).length) throw error(400, 'Nothing to update');

	const view = await updateSavedView(member.userId, params.viewId, patch);
	if (view === 'duplicate') throw error(409, 'A view with that name already exists');
	if (!view) throw error(404, 'View not found');
	return json({ view });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const member = await requireMember(locals, params.projectId);
	await deleteSavedView(member.userId, params.viewId);
	return json({ ok: true });
};
