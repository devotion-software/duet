import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { apiKey } from '@better-auth/api-key';
import { db } from './server/db';
import * as schema from './server/db/schema';
import { sendOtpEmail } from './server/email';

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:5173';
const rpID = new URL(baseURL).hostname;

export const auth = betterAuth({
	baseURL,
	secret: process.env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: 'mysql',
		schema
	}),
	// Passwordless: email + password sign-in is intentionally disabled.
	emailAndPassword: {
		enabled: false
	},
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID ?? '',
			clientSecret: process.env.GITHUB_CLIENT_SECRET ?? ''
		}
	},
	account: {
		accountLinking: {
			enabled: true,
			// Allow linking GitHub + email-OTP identities that share a verified email.
			trustedProviders: ['github', 'email-otp']
		}
	},
	user: {
		additionalFields: {
			// Preferred theme, persisted per user.
			theme: {
				type: 'string',
				required: false,
				defaultValue: 'system',
				input: true
			},
			// App-wide surface style (soft/solid/outline/glass), set in Appearance settings.
			appStyle: {
				type: 'string',
				required: false,
				defaultValue: 'soft',
				input: true
			},
			// Account-wide fallbacks for projects whose own setting is left on "Default".
			// Saved through the settings page action, which validates them.
			defaultListWidth: {
				type: 'number',
				required: false,
				defaultValue: 820,
				input: false
			},
			defaultCountSubtasks: {
				type: 'boolean',
				required: false,
				defaultValue: true,
				input: false
			}
		}
	},
	plugins: [
		emailOTP({
			otpLength: 6,
			expiresIn: 10 * 60, // 10 minutes
			sendVerificationOnSignUp: true,
			async sendVerificationOTP({ email, otp, type }) {
				await sendOtpEmail({ email, otp, type });
			}
		}),
		passkey({
			rpID,
			rpName: 'Duet',
			origin: baseURL
		}),
		// Lets a user mint a long-lived key (Settings → API keys) for scripts/MCP
		// tools to call the REST API with an `x-api-key` header instead of a cookie
		// session. Scoped to whatever that user can already do; requireMember still
		// enforces per-project role on every request.
		apiKey({
			enableSessionForAPIKeys: true
		})
	]
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
