import { createAuthClient } from 'better-auth/svelte';
import { emailOTPClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import type { auth } from '#lib/auth';

export const authClient = createAuthClient({
	// baseURL inferred from window.location in the browser.
	plugins: [emailOTPClient(), passkeyClient(), inferAdditionalFields<typeof auth>()]
});

export const { signIn, signUp, signOut, useSession } = authClient;
