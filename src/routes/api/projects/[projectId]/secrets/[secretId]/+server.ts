import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { revealSecret, updateSecret, deleteSecret } from '#lib/server/secrets';
import type { RequestHandler } from './$types';

/** Returns the decrypted value. */
export const GET: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	const value = await revealSecret(params.projectId, params.secretId);
	if (value === null) throw error(404, 'Secret not found');
	return json({ value }, { headers: { 'cache-control': 'no-store' } });
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	const body = await request.json().catch(() => null);
	const patch: { name?: string; value?: string; note?: string } = {};
	if (body?.name !== undefined) {
		patch.name = String(body.name).trim().slice(0, 120);
		if (!patch.name) throw error(400, 'Name required');
	}
	if (body?.value !== undefined) {
		patch.value = String(body.value);
		if (!patch.value) throw error(400, 'Value required');
		if (patch.value.length > 10_000) throw error(400, 'Value is too long');
	}
	if (body?.note !== undefined) patch.note = String(body.note).trim().slice(0, 500);

	const secret = await updateSecret(params.projectId, params.secretId, patch);
	if (!secret) throw error(404, 'Secret not found');
	return json({ secret });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	await deleteSecret(params.projectId, params.secretId);
	return json({ ok: true });
};
