import { error, redirect } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { getAttachment } from '#lib/server/todos';
import { usingR2, presignGet, readLocal } from '#lib/server/storage';
import type { RequestHandler } from './$types';

// Only these are ever rendered inline in the browser. Anything else — notably
// HTML/SVG/XML, which could carry a <script> and run as stored XSS on our
// origin if the browser rendered it — is always forced to download instead,
// regardless of the `download` query param.
function canRenderInline(mime: string | null | undefined) {
	if (!mime) return false;
	return (
		mime.startsWith('image/') ||
		mime.startsWith('video/') ||
		mime === 'application/pdf' ||
		mime === 'text/plain' ||
		mime === 'text/csv'
	);
}

export const GET: RequestHandler = async ({ params, locals, url, request }) => {
	// Only project members can view an image.
	await requireMember(locals, params.projectId);
	const att = await getAttachment(params.projectId, params.attachmentId);
	if (!att) throw error(404, 'Attachment not found');

	const download = url.searchParams.has('download');
	const dispositionType = download || !canRenderInline(att.mime) ? 'attachment' : 'inline';
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
		const headers: Record<string, string> = {
			'content-type': att.mime ?? 'application/octet-stream',
			'cache-control': 'private, max-age=300',
			'content-disposition': `${dispositionType}; filename="${filename}"`,
			'accept-ranges': 'bytes',
			'x-content-type-options': 'nosniff'
		};

		// Video playback relies on range requests for seeking.
		const range = request.headers.get('range');
		if (range) {
			const match = /^bytes=(\d*)-(\d*)$/.exec(range);
			if (match) {
				const total = bytes.length;
				const start = match[1] ? Number(match[1]) : 0;
				const end = match[2] ? Number(match[2]) : total - 1;
				if (start >= 0 && end < total && start <= end) {
					const chunk = bytes.subarray(start, end + 1);
					headers['content-range'] = `bytes ${start}-${end}/${total}`;
					headers['content-length'] = String(chunk.length);
					return new Response(chunk as BodyInit, { status: 206, headers });
				}
			}
		}

		return new Response(bytes as BodyInit, { headers });
	} catch {
		throw error(404, 'File not found');
	}
};
