import { error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { getProjectIconKey } from '#lib/server/projects';
import { usingR2, presignGet, readLocal } from '#lib/server/storage';
import type { RequestHandler } from './$types';

const MIME: Record<string, string> = {
	svg: 'image/svg+xml',
	png: 'image/png',
	jpg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif'
};

export const GET: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId);
	const key = await getProjectIconKey(params.projectId);
	if (!key) throw error(404, 'Project has no image icon');

	if (usingR2) {
		// Let the browser reuse the redirect for most of the signed URL's lifetime, so the
		// sidebar doesn't re-fetch every icon on each navigation.
		return new Response(null, {
			status: 302,
			headers: { location: await presignGet(key), 'cache-control': 'private, max-age=3000' }
		});
	}

	try {
		const bytes = await readLocal(key);
		return new Response(bytes as BodyInit, {
			headers: {
				'content-type': MIME[key.split('.').pop()!] ?? 'application/octet-stream',
				// The URL carries a ?v= cache-buster that changes with the image.
				'cache-control': 'private, max-age=31536000, immutable',
				// Uploaded SVGs are same-origin here, so stop any embedded script from running
				// if someone opens the icon URL directly.
				'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
			}
		});
	} catch {
		throw error(404, 'File not found');
	}
};
