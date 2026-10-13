import type { Role } from './db/app.schema';

/** Editors and owners can create/edit/complete todos. Viewers are read-only. */
export function canEdit(role: Role | null | undefined): boolean {
	return role === 'owner' || role === 'editor';
}

/** Only owners can manage members, settings and deletion. */
export function canManage(role: Role | null | undefined): boolean {
	return role === 'owner';
}

// Human-readable role copy lives in the client-safe types module.
export { ROLE_LABELS, ROLE_DESCRIPTIONS } from '#lib/types';
