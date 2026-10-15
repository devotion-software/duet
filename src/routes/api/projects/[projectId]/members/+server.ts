import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { addMemberByEmail, listMembers, listInvites } from '#lib/server/projects';
import { publish } from '#lib/server/realtime';
import { ROLES, type Role } from '#lib/server/db/app.schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId);
	const [members, invites] = await Promise.all([
		listMembers(params.projectId),
		listInvites(params.projectId)
	]);
	return json({ members, invites });
};

export const POST: RequestHandler = async ({ params, request, locals, url }) => {
	const { userId } = await requireMember(locals, params.projectId, { manage: true });
	const body = await request.json().catch(() => null);
	const email = String(body?.email ?? '').trim().toLowerCase();
	const role = (ROLES as readonly string[]).includes(body?.role) ? (body.role as Role) : 'editor';
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw error(400, 'Enter a valid email address');

	const result = await addMemberByEmail(params.projectId, userId, email, role, url.origin);
	if (result.status === 'self') throw error(400, "That's you — you're already an owner");
	if (result.status === 'exists') throw error(409, 'They are already a member');

	publish(params.projectId, { type: 'member.changed', payload: result });
	return json(result, { status: 201 });
};
