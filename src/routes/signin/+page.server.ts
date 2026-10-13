import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) {
		const next = url.searchParams.get('next');
		redirect(302, next && next.startsWith('/') ? next : '/app');
	}
	return {};
};
