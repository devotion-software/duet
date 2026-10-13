import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getMembership } from './projects';
import { canEdit, canManage } from './authz';
import type { Role } from './db/app.schema';

interface GuardOptions {
	/** Require owner-level access (member management, settings, deletion). */
	manage?: boolean;
	/** Require editor-or-owner access (mutating todos). */
	edit?: boolean;
}

/**
 * Ensures the current user is a member of `projectId` with sufficient rights.
 * Throws the right HTTP error otherwise. Returns the user + their role.
 */
export async function requireMember(
	locals: RequestEvent['locals'],
	projectId: string,
	opts: GuardOptions = {}
): Promise<{ userId: string; role: Role }> {
	if (!locals.user) throw error(401, 'Not signed in');
	const role = await getMembership(locals.user.id, projectId);
	// 404 (not 403) when not a member, so project existence isn't leaked.
	if (!role) throw error(404, 'Project not found');
	if (opts.manage && !canManage(role)) throw error(403, 'Owners only');
	if (opts.edit && !canEdit(role)) throw error(403, 'You have view-only access');
	return { userId: locals.user.id, role };
}
