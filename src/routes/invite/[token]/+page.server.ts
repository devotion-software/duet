import { error, redirect } from '@sveltejs/kit';
import { redeemInvite } from '#lib/server/projects';
import { safeRedirectPath } from '#lib/safePath';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		const next = `/invite/${encodeURIComponent(params.token)}`;
		redirect(302, `/signin?next=${encodeURIComponent(safeRedirectPath(next) ?? '/app')}`);
	}

	const result = await redeemInvite(params.token, locals.user.id, locals.user.email);
	if (result.status === 'invalid') error(404, 'This invite link is invalid or has expired.');
	if (result.status === 'wrong-email')
		error(
			403,
			`This invite was sent to ${result.email}. Sign in with that email address to accept it.`
		);

	redirect(302, `/app/${result.slug}`);
};
