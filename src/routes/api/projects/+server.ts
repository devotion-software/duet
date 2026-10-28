import { json, error } from '@sveltejs/kit';
import { listUserProjects, projectDefaultsFor } from '#lib/server/projects';
import type { RequestHandler } from './$types';

/** Projects the current user is a member of; used for project discovery (e.g. by MCP tools). */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const projects = await listUserProjects(locals.user.id, projectDefaultsFor(locals.user));
	return json({ projects });
};
