import { redirect } from '@sveltejs/kit';
import { listUserProjects, listUserFolders, projectDefaultsFor } from '#lib/server/projects';
import { APP_STYLES, type AppStyle } from '#lib/types';
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

	// The account-wide surface style; one setting for the whole app.
	const appStyle: AppStyle = APP_STYLES.includes(locals.user.appStyle as AppStyle)
		? (locals.user.appStyle as AppStyle)
		: 'soft';

	return {
		user: locals.user,
		projectDefaults,
		appStyle,
		projects,
		folders
	};
};
