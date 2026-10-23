import 'dotenv/config';
import { AwsClient } from 'aws4fetch';
import fs from 'node:fs/promises';
import path from 'node:path';

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET || 'duet';

/** True when R2 credentials are present; otherwise we fall back to local disk. */
export const usingR2 = Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY);

const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const LOCAL_DIR = path.resolve('.uploads');

let client: AwsClient | null = null;
function r2(): AwsClient {
	if (!client) {
		client = new AwsClient({
			accessKeyId: ACCESS_KEY_ID!,
			secretAccessKey: SECRET_ACCESS_KEY!,
			service: 's3',
			region: 'auto'
		});
	}
	return client;
}

function objectUrl(key: string): string {
	const encoded = key.split('/').map(encodeURIComponent).join('/');
	return `${ENDPOINT}/${BUCKET}/${encoded}`;
}

function localPath(key: string): string {
	// Prevent path traversal — keys are app-generated, but be defensive.
	const safe = key.replace(/\\/g, '/').replace(/\.\.+/g, '').replace(/^\/+/, '');
	const resolved = path.resolve(LOCAL_DIR, safe);
	if (resolved !== LOCAL_DIR && !resolved.startsWith(LOCAL_DIR + path.sep)) {
		throw new Error('Invalid object key');
	}
	return resolved;
}

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
	if (usingR2) {
		const res = await r2().fetch(objectUrl(key), {
			method: 'PUT',
			body: body as BodyInit,
			headers: { 'content-type': contentType }
		});
		if (!res.ok) {
			throw new Error(`R2 upload failed (${res.status}): ${await res.text().catch(() => '')}`);
		}
	} else {
		const file = localPath(key);
		await fs.mkdir(path.dirname(file), { recursive: true });
		await fs.writeFile(file, body);
	}
}

export async function deleteObject(key: string): Promise<void> {
	if (usingR2) {
		await r2()
			.fetch(objectUrl(key), { method: 'DELETE' })
			.catch(() => {
				/* best-effort */
			});
	} else {
		await fs.rm(localPath(key), { force: true }).catch(() => {});
	}
}

/** A short-lived signed URL to read the object directly from R2. */
export async function presignGet(
	key: string,
	expiresSeconds = 3600,
	responseContentDisposition?: string
): Promise<string> {
	const url = new URL(objectUrl(key));
	url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
	if (responseContentDisposition) {
		url.searchParams.set('response-content-disposition', responseContentDisposition);
	}
	const signed = await r2().sign(url.toString(), {
		method: 'GET',
		aws: { signQuery: true }
	});
	return signed.url;
}

export async function readLocal(key: string): Promise<Uint8Array> {
	return fs.readFile(localPath(key));
}
