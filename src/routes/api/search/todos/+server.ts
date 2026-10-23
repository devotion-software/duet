import { json, error } from '@sveltejs/kit';
import { listUserProjects, projectDefaultsFor } from '#lib/server/projects';
import { searchTodosInProjects } from '#lib/server/todos';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const projects = await listUserProjects(locals.user.id, projectDefaultsFor(locals.user));
	const todos = await searchTodosInProjects(projects.map((p) => p.id));
	return json({ todos });
};
