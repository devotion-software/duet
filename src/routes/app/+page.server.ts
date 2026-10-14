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
import { getHomeOverview } from '#lib/server/home';
import { publish } from '#lib/server/realtime';
import { canManage } from '#lib/server/authz';
import {
	PROJECT_STATUSES,
	PROJECT_FONTS,
	type ProjectStatus,
	type ProjectFont
} from '#lib/server/db/app.schema';
import { clampListWidth } from '#lib/palette';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, cookies }) => {
	const { projects } = await parent();
	// Archived projects stay out of the overview, like they do in the sidebar.
	const overview = await getHomeOverview(projects.filter((p) => p.status !== 'archived'));
	// Folder groups folded away on the home page, independent of the sidebar's.
	const collapsedFolders = (cookies.get('duet-home-collapsed') ?? '').split(',').filter(Boolean);
	return { ...overview, collapsedFolders };
};

/** The submitted font, or undefined if missing/invalid. */
function fontFrom(form: FormData): ProjectFont | undefined {
	const font = String(form.get('font') ?? '') as ProjectFont;
	return PROJECT_FONTS.includes(font) ? font : undefined;
}

/** The submitted status, or undefined if missing/invalid. */
function statusFrom(form: FormData): ProjectStatus | undefined {
	const status = String(form.get('status') ?? '') as ProjectStatus;
	return PROJECT_STATUSES.includes(status) ? status : undefined;
}

/** The submitted list width: px, 0 for full width, '' for the account default; undefined if absent/invalid. */
function listWidthFrom(form: FormData): number | null | undefined {
	const raw = form.get('listWidth');
	if (raw === null) return undefined;
	if (raw === '') return null;
	const px = Number(raw);
	return Number.isFinite(px) ? clampListWidth(px) : undefined;
}

/** The submitted sidebar count setting: 'true'/'false', or 'default' for the account default. */
function countSubtasksFrom(form: FormData): boolean | null | undefined {
	const raw = form.get('countSubtasks');
	if (raw === null) return undefined;
	return raw === 'default' ? null : raw === 'true';
}

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

		const { id, slug } = await createProject(locals.user.id, {
			name,
			description: String(form.get('description') ?? ''),
			color: String(form.get('color') ?? '#6366f1'),
			icon: String(form.get('icon') ?? '📋'),
			font: fontFrom(form) ?? 'sans',
			status: statusFrom(form)
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

		await updateProject(id, {
			name: String(form.get('name') ?? '').trim(),
			description: String(form.get('description') ?? ''),
			color: String(form.get('color') ?? '#6366f1'),
			icon: String(form.get('icon') ?? '📋'),
			font: fontFrom(form) ?? 'sans',
			status: statusFrom(form),
			hiddenFields: parseHiddenFields(form.getAll('hidden').join(',')),
			listWidth: listWidthFrom(form),
			countSubtasks: countSubtasksFrom(form)
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
