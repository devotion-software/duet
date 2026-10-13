import { customAlphabet } from 'nanoid';

// URL-friendly, collision-resistant ids. 22 chars ≈ 128 bits of entropy.
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const newId = customAlphabet(alphabet, 22);

// Shorter token for invites.
export const newToken = customAlphabet(alphabet, 40);

/** Turn a project name into a URL slug, with a short random suffix for uniqueness. */
export function slugify(name: string): string {
	const base = name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
	const suffix = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 5)();
	return `${base || 'project'}-${suffix}`;
}
