import { redirect } from '@sveltejs/kit';
import { safeRedirectPath } from '#lib/safePath';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) {
		redirect(302, safeRedirectPath(url.searchParams.get('next')) ?? '/app');
	}
	return {};
};
