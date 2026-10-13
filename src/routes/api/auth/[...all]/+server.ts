import { auth } from '#lib/auth';
import type { RequestHandler } from './$types';

// Mount Better Auth directly as a catch-all route. This is robust across dev and
// adapter-node production (unlike origin-matching in svelteKitHandler, which is
// sensitive to the request protocol the adapter infers).
export const GET: RequestHandler = ({ request }) => auth.handler(request);
export const POST: RequestHandler = ({ request }) => auth.handler(request);
