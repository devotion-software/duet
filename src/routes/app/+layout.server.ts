import { redirect } from '@sveltejs/kit';
import { listUserProjects, listUserFolders, projectDefaultsFor } from '#lib/server/projects';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const next = encodeURIComponent(url.pathname + url.search);
		redirect(302, `/signin?next=${next}`);
	}

	const projectDefaults = projectDefaultsFor(locals.user);
	const [projects, folders] = await Promise.all([
		listUserProjects(locals.user.id, projectDefaults),
		listUserFolders(locals.user.id)
	]);

	return {
		user: locals.user,
		projectDefaults,
		projects,
		folders
	};
};
