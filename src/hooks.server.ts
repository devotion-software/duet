import { auth } from '#lib/auth';
import { APP_STYLES, type AppStyle } from '#lib/types';
import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
	// Populate locals for every request so load functions & actions can gate access.
	// Better Auth's own endpoints are served by src/routes/api/auth/[...all].
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	// Apply the user's app-wide style on <html> during SSR so it's right before first
	// paint (no flash) and consistent across devices. Validated so an unexpected stored
	// value can't be injected into the markup.
	const raw = event.locals.user?.appStyle;
	const style: AppStyle = APP_STYLES.includes(raw as AppStyle) ? (raw as AppStyle) : 'soft';
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('data-style="soft"', `data-style="${style}"`)
	});
};
