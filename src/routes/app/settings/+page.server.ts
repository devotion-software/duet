import { error } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { passkey, account } from '#lib/server/db/schema';
import type { PageServerLoad } from './$types';

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
