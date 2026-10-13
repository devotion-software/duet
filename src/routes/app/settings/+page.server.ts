import { error, fail } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { passkey, account, user } from '#lib/server/db/schema';
import { clampListWidth } from '#lib/palette';
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

	return {
		passkeys,
		providers: providers.map((p) => p.providerId)
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
	}
};
