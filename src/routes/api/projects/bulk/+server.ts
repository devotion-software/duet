import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { updateProject, deleteProject } from '#lib/server/projects';
import { publish } from '#lib/server/realtime';
import { PROJECT_STATUSES, type ProjectStatus } from '#lib/server/db/app.schema';
import type { RequestHandler } from './$types';

function asIds(v: unknown): string[] {
	return Array.isArray(v) ? [...new Set(v.map(String))] : [];
}

/** Change the status of several projects at once. Ids the user can't manage are skipped. */
export const PATCH: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => null);
	const ids = asIds(body?.ids);
	if (!ids.length) throw error(400, 'ids array required');
	if (!(PROJECT_STATUSES as readonly string[]).includes(body?.status)) throw error(400, 'Invalid status');
	const status = body.status as ProjectStatus;

	const updated: string[] = [];
	for (const id of ids) {
		const ok = await requireMember(locals, id, { manage: true }).catch(() => null);
		if (!ok) continue;
		await updateProject(id, { status });
		publish(id, { type: 'project.updated', payload: { id } });
		updated.push(id);
	}
	return json({ updated });
};

/** Delete several projects at once. Ids the user can't manage are skipped. */
export const DELETE: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => null);
	const ids = asIds(body?.ids);
	if (!ids.length) throw error(400, 'ids array required');

	const deleted: string[] = [];
	for (const id of ids) {
		const ok = await requireMember(locals, id, { manage: true }).catch(() => null);
		if (!ok) continue;
		await deleteProject(id);
		deleted.push(id);
	}
	return json({ deleted });
};
