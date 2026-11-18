import { error } from '@sveltejs/kit';
import {
	getProjectBySlugForUser,
	listMembers,
	listInvites,
	projectDefaultsFor
} from '#lib/server/projects';
import { listTodos, listTags, listCategories, listSavedViews } from '#lib/server/todos';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Not signed in');

	const project = await getProjectBySlugForUser(
		locals.user.id,
		params.slug,
		projectDefaultsFor(locals.user)
	);
	if (!project) error(404, 'Project not found');

	const [todos, tags, categories, members, invites, savedViews] = await Promise.all([
		listTodos(project.id),
		listTags(project.id),
		listCategories(project.id),
		listMembers(project.id),
		listInvites(project.id),
		listSavedViews(project.id, locals.user.id)
	]);

	return { project, todos, tags, categories, members, invites, savedViews };
};
