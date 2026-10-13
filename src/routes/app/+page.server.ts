import { redirect, fail } from '@sveltejs/kit';
import {
	createProject,
	updateProject,
	deleteProject,
	getMembership,
	parseHiddenFields,
	setProjectIcon,
	validateIconFile
} from '#lib/server/projects';
import { publish } from '#lib/server/realtime';
import { canManage } from '#lib/server/authz';
import type { ProjectStyle } from '#lib/server/db/app.schema';
import { clampListWidth } from '#lib/palette';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { projects } = await parent();
	if (projects.length) {
		redirect(307, `/app/${projects[0].slug}`);
	}
	return {};
};

const STYLES: ProjectStyle[] = ['soft', 'solid', 'outline', 'glass'];

/** An uploaded image icon from the project form, if one was chosen. */
function iconFileFrom(form: FormData): File | null {
	const file = form.get('iconFile');
	return file instanceof File && file.size > 0 ? file : null;
}

export const actions: Actions = {
	createProject: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: 'A project name is required' });
		const iconFile = iconFileFrom(form);
		const iconError = iconFile && validateIconFile(iconFile);
		if (iconError) return fail(400, { message: iconError });

		const style = String(form.get('style') ?? 'soft') as ProjectStyle;
		const { id, slug } = await createProject(locals.user.id, {
			name,
			description: String(form.get('description') ?? ''),
			color: String(form.get('color') ?? '#6366f1'),
			icon: String(form.get('icon') ?? '📋'),
			style: STYLES.includes(style) ? style : 'soft'
		});
		if (iconFile) await setProjectIcon(id, iconFile);
		redirect(303, `/app/${slug}`);
	},

	updateProject: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'Missing project' });

		const role = await getMembership(locals.user.id, id);
		if (!canManage(role)) return fail(403, { message: 'Only owners can edit the project' });
		const iconFile = iconFileFrom(form);
		const iconError = iconFile && validateIconFile(iconFile);
		if (iconError) return fail(400, { message: iconError });

		const style = String(form.get('style') ?? 'soft') as ProjectStyle;
		const listWidth = Number(form.get('listWidth') ?? NaN);
		await updateProject(id, {
			name: String(form.get('name') ?? '').trim(),
			description: String(form.get('description') ?? ''),
			color: String(form.get('color') ?? '#6366f1'),
			icon: String(form.get('icon') ?? '📋'),
			style: STYLES.includes(style) ? style : 'soft',
			hiddenFields: parseHiddenFields(form.getAll('hidden').join(',')),
			listWidth: Number.isFinite(listWidth) ? clampListWidth(listWidth) : undefined,
			countSubtasks: form.has('countSubtasks') ? form.get('countSubtasks') === 'true' : undefined
		});
		if (iconFile) await setProjectIcon(id, iconFile);
		else if (form.get('iconClear') === 'true') await setProjectIcon(id, null);
		publish(id, { type: 'project.updated', payload: { id } });
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
