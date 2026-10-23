import { error, redirect } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { getAttachment } from '#lib/server/todos';
import { usingR2, presignGet, readLocal } from '#lib/server/storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	// Only project members can view an image.
	await requireMember(locals, params.projectId);
	const att = await getAttachment(params.projectId, params.attachmentId);
	if (!att) throw error(404, 'Attachment not found');

	const download = url.searchParams.has('download');
	const dispositionType = download ? 'attachment' : 'inline';
	const filename = encodeURIComponent(att.name ?? 'image');

	if (usingR2) {
		// Hand off to R2 with a short-lived signed URL (no server bandwidth).
		// SvelteKit 3 rejects external redirects unless explicitly allowed.
		// The disposition is passed to R2 so it survives the cross-origin redirect
		// (the <a download> attribute is ignored once the URL isn't same-origin).
		redirect(
			302,
			await presignGet(att.key, 3600, `${dispositionType}; filename="${filename}"`),
			{ external: true }
		);
	}

	// Local dev fallback: stream the file from disk.
	try {
		const bytes = await readLocal(att.key);
		return new Response(bytes as BodyInit, {
			headers: {
				'content-type': att.mime ?? 'application/octet-stream',
				'cache-control': 'private, max-age=300',
				'content-disposition': `${dispositionType}; filename="${filename}"`
			}
		});
	} catch {
		throw error(404, 'File not found');
	}
};
