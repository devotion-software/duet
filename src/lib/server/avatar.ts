import { eq } from 'drizzle-orm';
import { db } from './db';
import { user } from './db/auth.schema';
import { newId } from './ids';
import { putObject, deleteObject } from './storage';
import { ICON_EXT, validateIconFile } from './projects';

export { validateIconFile };

/** The key's unique filename doubles as a cache-buster, so the URL changes with the image. */
function avatarUrl(userId: string, key: string): string {
	return `/api/user/avatar/${userId}/${key.split('/').pop()}`;
}

/** True when `image` is a URL we serve ourselves (as opposed to an external provider's). */
function isOwnAvatarUrl(userId: string, image: string | null): boolean {
	return !!image && image.startsWith(`/api/user/avatar/${userId}/`);
}

export async function getUserAvatarKey(userId: string, filename: string): Promise<string | null> {
	const [row] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId));
	if (!row?.image || !isOwnAvatarUrl(userId, row.image)) return null;
	return row.image.endsWith(`/${filename}`) ? `avatars/${userId}/${filename}` : null;
}

/** Replace (or with `null`, remove) a user's profile picture, cleaning up the old object. */
export async function setUserAvatar(userId: string, file: File | null) {
	const [row] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId));
	const oldImage = row?.image ?? null;
	const oldKey =
		oldImage && isOwnAvatarUrl(userId, oldImage)
			? `avatars/${userId}/${oldImage.split('/').pop()}`
			: null;

	let image: string | null = null;
	if (file) {
		const key = `avatars/${userId}/${newId()}.${ICON_EXT[file.type]}`;
		await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type);
		image = avatarUrl(userId, key);
	}
	await db.update(user).set({ image }).where(eq(user.id, userId));
	if (oldKey) await deleteObject(oldKey);
}
