import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { getProjectById, updateProject, deleteProject, projectDefaultsFor } from '#lib/server/projects';
import { publish } from '#lib/server/realtime';
import { PROJECT_STATUSES, type ProjectStatus } from '#lib/server/db/app.schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId);
	const project = await getProjectById(params.projectId, projectDefaultsFor(locals.user!));
	if (!project) throw error(404, 'Project not found');
	return json(project);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { manage: true });
	const body = await request.json().catch(() => null);
	const patch: { name?: string; status?: ProjectStatus } = {};
	if (typeof body?.name === 'string') {
		if (!body.name.trim()) throw error(400, 'A project name is required');
		patch.name = body.name;
	}
	if ((PROJECT_STATUSES as readonly string[]).includes(body?.status)) {
		patch.status = body.status as ProjectStatus;
	}
	if (!Object.keys(patch).length) throw error(400, 'Nothing to update');
	await updateProject(params.projectId, patch);
	publish(params.projectId, { type: 'project.updated', payload: { id: params.projectId } });
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId, { manage: true });
	await deleteProject(params.projectId);
	return json({ ok: true });
};
