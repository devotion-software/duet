import { redirect } from '@sveltejs/kit';
import { listUserProjects, listUserFolders } from '#lib/server/projects';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const next = encodeURIComponent(url.pathname + url.search);
		redirect(302, `/signin?next=${next}`);
	}

	const [projects, folders] = await Promise.all([
		listUserProjects(locals.user.id),
		listUserFolders(locals.user.id)
	]);

	return {
		user: locals.user,
		projects,
		folders
	};
};
