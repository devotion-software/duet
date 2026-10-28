import { error, fail } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { passkey, account, user, apikey } from '#lib/server/db/schema';
import { clampListWidth } from '#lib/palette';
import { auth } from '#lib/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Not signed in');

	const passkeys = await db
		.select({
			id: passkey.id,
			name: passkey.name,
			deviceType: passkey.deviceType,
			createdAt: passkey.createdAt
		})
		.from(passkey)
		.where(eq(passkey.userId, locals.user.id))
		.orderBy(desc(passkey.createdAt));

	const providers = await db
		.select({ providerId: account.providerId })
		.from(account)
		.where(eq(account.userId, locals.user.id));

	// Never select `key` here: it's hashed at rest, but the row still shouldn't
	// round-trip through a page load. `start` is the few characters shown in the UI.
	const apiKeys = await db
		.select({
			id: apikey.id,
			name: apikey.name,
			start: apikey.start,
			enabled: apikey.enabled,
			lastRequest: apikey.lastRequest,
			createdAt: apikey.createdAt
		})
		.from(apikey)
		.where(eq(apikey.referenceId, locals.user.id))
		.orderBy(desc(apikey.createdAt));

	return {
		passkeys,
		providers: providers.map((p) => p.providerId),
		apiKeys
	};
};

export const actions: Actions = {
	/** Account-wide defaults for projects that leave these settings on "Default". */
	saveProjectDefaults: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in' });
		const form = await request.formData();
		const listWidth = Number(form.get('listWidth') ?? NaN);
		if (!Number.isFinite(listWidth)) return fail(400, { message: 'Invalid list width' });
		await db
			.update(user)
			.set({
				defaultListWidth: clampListWidth(listWidth),
				defaultCountSubtasks: form.get('countSubtasks') === 'true'
			})
			.where(eq(user.id, locals.user.id));
		return { success: true };
	},

	/** Mints a key for scripts/MCP tools to call the API with an `x-api-key` header. */
	createApiKey: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim().slice(0, 80) || 'Untitled key';
		const result = await auth.api.createApiKey({
			body: { name },
			headers: request.headers
		});
		return { success: true, newKey: result.key, newKeyName: result.name };
	},

	revokeApiKey: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in' });
		const form = await request.formData();
		const keyId = String(form.get('keyId') ?? '');
		if (!keyId) return fail(400, { message: 'Missing key id' });
		await auth.api.deleteApiKey({ body: { keyId }, headers: request.headers });
		return { success: true };
	}
};
