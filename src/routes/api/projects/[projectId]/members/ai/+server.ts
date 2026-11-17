import { json } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { enableAiMember } from '#lib/server/projects';
import { publish } from '#lib/server/realtime';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId, { manage: true });
	const member = await enableAiMember(params.projectId);
	publish(params.projectId, { type: 'member.changed', payload: { status: 'added', member } });
	return json({ status: 'added', member }, { status: 201 });
};
