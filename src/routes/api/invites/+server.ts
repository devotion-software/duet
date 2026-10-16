import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { addMemberByEmail } from '#lib/server/projects';
import { publish } from '#lib/server/realtime';
import { ROLES, type Role } from '#lib/server/db/app.schema';
import type { RequestHandler } from './$types';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface InviteResult {
	projectId: string;
	email: string;
	status: 'added' | 'invited' | 'exists' | 'self' | 'error';
	message?: string;
}

/** Invite one or more emails to one or more projects at once, each combination independent. */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const body = await request.json().catch(() => null);

	const projectIds: string[] = Array.isArray(body?.projectIds) ? body.projectIds.map(String) : [];
	const rawEmails: string[] = Array.isArray(body?.emails)
		? body.emails.map((e: unknown) => String(e).trim().toLowerCase())
		: [];
	const emails = [...new Set(rawEmails)].filter((e) => EMAIL_RE.test(e));
	const role = (ROLES as readonly string[]).includes(body?.role) ? (body.role as Role) : 'editor';

	if (!projectIds.length) throw error(400, 'Choose at least one project');
	if (!emails.length) throw error(400, 'Enter at least one valid email address');

	const results: InviteResult[] = [];
	for (const projectId of projectIds) {
		const member = await requireMember(locals, projectId, { manage: true }).catch(() => null);
		if (!member) {
			for (const email of emails) results.push({ projectId, email, status: 'error', message: 'Owners only' });
			continue;
		}
		for (const email of emails) {
			const result = await addMemberByEmail(projectId, member.userId, email, role, url.origin);
			results.push({ projectId, email, ...result });
			if (result.status === 'added' || result.status === 'invited') {
				publish(projectId, { type: 'member.changed', payload: result });
			}
		}
	}

	return json({ results }, { status: 201 });
};
