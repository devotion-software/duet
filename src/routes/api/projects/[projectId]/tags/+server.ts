import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { createTag } from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	const body = await request.json().catch(() => null);
	const name = String(body?.name ?? '').trim();
	if (!name) throw error(400, 'Tag name required');
	const color = String(body?.color ?? '#64748b');

	const tag = await createTag(params.projectId, name, color);
	publish(params.projectId, { type: 'tag.changed', payload: { action: 'created', tag } });
	return json({ tag }, { status: 201 });
};
