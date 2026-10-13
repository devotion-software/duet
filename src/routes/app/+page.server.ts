import { redirect, fail } from '@sveltejs/kit';
import {
	createProject,
	updateProject,
	deleteProject,
	getMembership
} from '#lib/server/projects';
import { canManage } from '#lib/server/authz';
import type { ProjectStyle } from '#lib/server/db/app.schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { projects } = await parent();
	if (projects.length) {
		redirect(307, `/app/${projects[0].slug}`);
	}
	return {};
};

const STYLES: ProjectStyle[] = ['soft', 'solid', 'outline', 'glass'];

export const actions: Actions = {
	createProject: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: 'A project name is required' });

		const style = String(form.get('style') ?? 'soft') as ProjectStyle;
		const { slug } = await createProject(locals.user.id, {
			name,
			description: String(form.get('description') ?? ''),
			color: String(form.get('color') ?? '#6366f1'),
			icon: String(form.get('icon') ?? '📋'),
			style: STYLES.includes(style) ? style : 'soft'
		});
		redirect(303, `/app/${slug}`);
	},

	updateProject: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'Missing project' });

		const role = await getMembership(locals.user.id, id);
		if (!canManage(role)) return fail(403, { message: 'Only owners can edit the project' });

		const style = String(form.get('style') ?? 'soft') as ProjectStyle;
		await updateProject(id, {
			name: String(form.get('name') ?? '').trim(),
			description: String(form.get('description') ?? ''),
			color: String(form.get('color') ?? '#6366f1'),
			icon: String(form.get('icon') ?? '📋'),
			style: STYLES.includes(style) ? style : 'soft'
		});
		return { success: true };
	},

	deleteProject: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const role = await getMembership(locals.user.id, id);
		if (!canManage(role)) return fail(403, { message: 'Only owners can delete the project' });
		await deleteProject(id);
		redirect(303, '/app');
	}
};
