import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { updateMemberRole, removeMember, getMembership, countOwners } from '#lib/server/projects';
import { publish } from '#lib/server/realtime';
import { ROLES, type Role } from '#lib/server/db/app.schema';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { manage: true });
	const body = await request.json().catch(() => null);
	if (!(ROLES as readonly string[]).includes(body?.role)) throw error(400, 'Invalid role');
	const role = body.role as Role;

	// Don't allow demoting the only owner.
	const current = await getMembership(params.userId, params.projectId);
	if (current === 'owner' && role !== 'owner' && (await countOwners(params.projectId)) <= 1) {
		throw error(400, 'A project needs at least one owner');
	}

	await updateMemberRole(params.projectId, params.userId, role);
	publish(params.projectId, {
		type: 'member.changed',
		payload: { action: 'role', userId: params.userId, role }
	});
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId, { manage: true });

	const current = await getMembership(params.userId, params.projectId);
	if (current === 'owner' && (await countOwners(params.projectId)) <= 1) {
		throw error(400, 'A project needs at least one owner');
	}

	await removeMember(params.projectId, params.userId);
	publish(params.projectId, {
		type: 'member.changed',
		payload: { action: 'removed', userId: params.userId }
	});
	return json({ ok: true });
};
