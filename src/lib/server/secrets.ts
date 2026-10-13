import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { db } from './db';
import { projectSecrets } from './db/app.schema';
import { newId } from './ids';

export interface SecretSummary {
	id: string;
	name: string;
	note: string | null;
	createdAt: Date;
	updatedAt: Date;
}

// ─── Encryption ─────────────────────────────────────────────────────────────
// AES-256-GCM with a key derived from SECRETS_KEY (falling back to the auth secret).
// Changing whichever is in use makes existing secrets unreadable, so set SECRETS_KEY
// in production and keep it stable.
let cachedKey: Buffer | null = null;
function encryptionKey(): Buffer {
	if (cachedKey) return cachedKey;
	const material = process.env.SECRETS_KEY || process.env.BETTER_AUTH_SECRET;
	if (!material) throw new Error('SECRETS_KEY (or BETTER_AUTH_SECRET) must be set to store secrets');
	cachedKey = Buffer.from(hkdfSync('sha256', material, 'duet', 'project-secrets:v1', 32));
	return cachedKey;
}

// The project + secret ids are bound in as associated data, so a ciphertext copied
// into another row (or project) fails to decrypt rather than leaking.
function aad(projectId: string, secretId: string) {
	return Buffer.from(`${projectId}:${secretId}`);
}

function encrypt(plain: string, projectId: string, secretId: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
	cipher.setAAD(aad(projectId, secretId));
	const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

function decrypt(stored: string, projectId: string, secretId: string): string {
	const [iv, tag, data] = stored.split('.').map((p) => Buffer.from(p, 'base64url'));
	const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
	decipher.setAAD(aad(projectId, secretId));
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// ─── Queries ────────────────────────────────────────────────────────────────
const summaryColumns = {
	id: projectSecrets.id,
	name: projectSecrets.name,
	note: projectSecrets.note,
	createdAt: projectSecrets.createdAt,
	updatedAt: projectSecrets.updatedAt
};

/** Names and notes only; values are never included in listings. */
export async function listSecrets(projectId: string): Promise<SecretSummary[]> {
	return db
		.select(summaryColumns)
		.from(projectSecrets)
		.where(eq(projectSecrets.projectId, projectId))
		.orderBy(asc(projectSecrets.name));
}

/** Decrypted value of one secret, or null if it doesn't exist in this project. */
export async function revealSecret(projectId: string, secretId: string): Promise<string | null> {
	const [row] = await db
		.select({ value: projectSecrets.value })
		.from(projectSecrets)
		.where(and(eq(projectSecrets.projectId, projectId), eq(projectSecrets.id, secretId)));
	return row ? decrypt(row.value, projectId, secretId) : null;
}

export interface SecretInput {
	name: string;
	value: string;
	note?: string | null;
}

export async function createSecret(
	projectId: string,
	userId: string,
	input: SecretInput
): Promise<SecretSummary> {
	const id = newId();
	await db.insert(projectSecrets).values({
		id,
		projectId,
		name: input.name,
		note: input.note || null,
		value: encrypt(input.value, projectId, id),
		createdById: userId
	});
	const [row] = await db.select(summaryColumns).from(projectSecrets).where(eq(projectSecrets.id, id));
	return row;
}

/** Updates the given fields; omit `value` to keep the stored secret unchanged. */
export async function updateSecret(
	projectId: string,
	secretId: string,
	patch: Partial<SecretInput>
): Promise<SecretSummary | null> {
	const values: Record<string, unknown> = {};
	if (patch.name !== undefined) values.name = patch.name;
	if (patch.note !== undefined) values.note = patch.note || null;
	if (patch.value !== undefined) values.value = encrypt(patch.value, projectId, secretId);
	const where = and(eq(projectSecrets.projectId, projectId), eq(projectSecrets.id, secretId));
	if (Object.keys(values).length) await db.update(projectSecrets).set(values).where(where);
	const [row] = await db.select(summaryColumns).from(projectSecrets).where(where);
	return row ?? null;
}

export async function deleteSecret(projectId: string, secretId: string) {
	await db
		.delete(projectSecrets)
		.where(and(eq(projectSecrets.projectId, projectId), eq(projectSecrets.id, secretId)));
}
