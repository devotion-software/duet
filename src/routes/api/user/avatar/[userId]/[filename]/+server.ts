import { error } from '@sveltejs/kit';
import { getUserAvatarKey } from '#lib/server/avatar';
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
	if (!locals.user) throw error(401, 'Not signed in');
	const key = await getUserAvatarKey(params.userId, params.filename);
	if (!key) throw error(404, 'No profile picture');

	if (usingR2) {
		// The filename is itself a cache-buster, so the signed URL can be reused for a while.
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
				'cache-control': 'private, max-age=31536000, immutable',
				// Uploaded SVGs are same-origin here, so stop any embedded script from running
				// if someone opens the image URL directly.
				'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
			}
		});
	} catch {
		throw error(404, 'File not found');
	}
};
