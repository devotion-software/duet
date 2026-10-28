import { APIError } from 'better-auth';
import { error } from '@sveltejs/kit';
import { auth } from '#lib/auth';
import { APP_STYLES, type AppStyle } from '#lib/types';
import { runWithRequestContext } from '#lib/server/request-context';
import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
	// Populate locals for every request so load functions & actions can gate access.
	// Better Auth's own endpoints are served by src/routes/api/auth/[...all].
	// When an `x-api-key` header is present, the api-key plugin verifies it here
	// (enableSessionForAPIKeys) and can throw — e.g. once the key's rate limit is
	// exceeded. Left uncaught, that crashes every single request through this hook
	// with an opaque 500, hiding the real 429/rate-limit response the caller needs
	// to see (and back off on).
	let session;
	try {
		session = await auth.api.getSession({ headers: event.request.headers });
	} catch (err) {
		if (err instanceof APIError) error(err.statusCode ?? 500, err.message);
		throw err;
	}
	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;
	// The api-key plugin mocks a session when it finds a valid `x-api-key` header
	// (enableSessionForAPIKeys); that header only ever comes from a scripted/MCP
	// client, never the browser, so its presence plus a resolved session is how we
	// tell an AI-agent request apart from a real signed-in user.
	event.locals.isAiAgent = Boolean(event.request.headers.get('x-api-key') && session);

	// Apply the user's app-wide style on <html> during SSR so it's right before first
	// paint (no flash) and consistent across devices. Validated so an unexpected stored
	// value can't be injected into the markup.
	const raw = event.locals.user?.appStyle;
	const style: AppStyle = APP_STYLES.includes(raw as AppStyle) ? (raw as AppStyle) : 'soft';
	return runWithRequestContext({ isAiAgent: event.locals.isAiAgent }, () =>
		resolve(event, {
			transformPageChunk: ({ html }) => html.replace('data-style="soft"', `data-style="${style}"`)
		})
	);
};
