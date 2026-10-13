import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { listSecrets, createSecret } from '#lib/server/secrets';
import type { RequestHandler } from './$types';

// Secrets are hidden from viewers entirely, so every route requires edit access.
export const GET: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	return json({ secrets: await listSecrets(params.projectId) });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { userId } = await requireMember(locals, params.projectId, { edit: true });
	const body = await request.json().catch(() => null);
	const name = String(body?.name ?? '').trim().slice(0, 120);
	const value = String(body?.value ?? '');
	const note = String(body?.note ?? '').trim().slice(0, 500);
	if (!name) throw error(400, 'Name required');
	if (!value) throw error(400, 'Value required');
	if (value.length > 10_000) throw error(400, 'Value is too long');

	const secret = await createSecret(params.projectId, userId, { name, value, note });
	return json({ secret }, { status: 201 });
};
