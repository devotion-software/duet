/**
 * Email delivery for Duet.
 *
 * Delivery is chosen at runtime, in order:
 *   1. Resend API   — when RESEND_API_KEY is set (production).
 *   2. SMTP          — when SMTP_HOST is set (dev uses Mailpit on :1026).
 *   3. Console       — last-resort fallback so the flow still works unconfigured.
 */

type OtpType = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

interface OtpEmail {
	email: string;
	otp: string;
	type: OtpType;
}

const SUBJECTS: Record<OtpType, string> = {
	'sign-in': 'Your Duet sign-in code',
	'email-verification': 'Verify your email for Duet',
	'forget-password': 'Reset your Duet password',
	'change-email': 'Confirm your new Duet email'
};

const INTRO: Record<OtpType, string> = {
	'sign-in': 'Use this code to sign in to Duet.',
	'email-verification': 'Use this code to verify your email address.',
	'forget-password': 'Use this code to reset your password.',
	'change-email': 'Use this code to confirm your new email address.'
};

export async function sendOtpEmail({ email, otp, type }: OtpEmail): Promise<void> {
	const subject = SUBJECTS[type] ?? 'Your Duet code';
	const html = renderOtpHtml(otp, INTRO[type] ?? INTRO['sign-in']);
	const text = `${INTRO[type] ?? ''}\n\nYour code is ${otp}\nIt expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`;

	await deliver({ to: email, subject, html, text }, `code: ${otp}  (valid 10 min)`);
}

interface ProjectInvite {
	email: string;
	inviterName: string;
	projectName: string;
	/** Absolute URL to the invite-acceptance page. */
	url: string;
}

export async function sendProjectInviteEmail({
	email,
	inviterName,
	projectName,
	url
}: ProjectInvite): Promise<void> {
	const subject = `${inviterName} invited you to “${projectName}” on Duet`;
	const html = renderInviteHtml({ inviterName, projectName, url });
	const text = `${inviterName} invited you to join "${projectName}" on Duet.\n\nAccept the invite: ${url}\n\nThis invite expires in 14 days.`;

	await deliver({ to: email, subject, html, text }, `invite link: ${url}`);
}

async function deliver(msg: Omit<Message, 'from'>, consoleBody: string): Promise<void> {
	const from = process.env.EMAIL_FROM || 'Duet <no-reply@duet.local>';
	const full: Message = { from, ...msg };
	if (process.env.RESEND_API_KEY) {
		await sendViaResend(full);
	} else if (process.env.SMTP_HOST) {
		await sendViaSmtp(full);
	} else {
		logToConsole(full.to, full.subject, consoleBody);
	}
}

interface Message {
	from: string;
	to: string;
	subject: string;
	html: string;
	text: string;
}

async function sendViaResend(msg: Message): Promise<void> {
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${process.env.RESEND_API_KEY}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			from: msg.from,
			to: [msg.to],
			subject: msg.subject,
			html: msg.html,
			text: msg.text
		})
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`Resend failed (${res.status}): ${body}`);
	}
}

// nodemailer is only loaded on the SMTP path, so the Resend path stays dependency-free.
let transportPromise: Promise<import('nodemailer').Transporter> | null = null;

function getTransport() {
	if (!transportPromise) {
		transportPromise = import('nodemailer').then((nodemailer) => {
			const user = process.env.SMTP_USER;
			const pass = process.env.SMTP_PASSWORD;
			return nodemailer.createTransport({
				host: process.env.SMTP_HOST,
				port: Number(process.env.SMTP_PORT ?? 587),
				secure: process.env.SMTP_SECURE === 'true',
				auth: user ? { user, pass } : undefined
			});
		});
	}
	return transportPromise;
}

async function sendViaSmtp(msg: Message): Promise<void> {
	const transport = await getTransport();
	await transport.sendMail(msg);
}

function logToConsole(email: string, subject: string, body: string): void {
	const line = '─'.repeat(44);
	console.log(
		`\n┌${line}┐\n` +
			`│  📨  ${subject.padEnd(36)}│\n` +
			`│  to: ${email.padEnd(37)}│\n` +
			`│  ${body}`.padEnd(45) +
			`│\n` +
			`└${line}┘\n`
	);
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function renderInviteHtml({
	inviterName,
	projectName,
	url
}: {
	inviterName: string;
	projectName: string;
	url: string;
}): string {
	const inviter = escapeHtml(inviterName);
	const project = escapeHtml(projectName);
	return `<!doctype html>
<html>
	<body style="margin:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16181d;">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
			<tr><td align="center">
				<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e6e8ec;border-radius:16px;overflow:hidden;">
					<tr><td style="padding:32px 32px 8px;">
						<div style="display:inline-flex;align-items:center;gap:10px;">
							<span style="display:inline-block;width:28px;height:28px;background:#6366f1;border-radius:8px;"></span>
							<span style="font-size:20px;font-weight:700;letter-spacing:-0.02em;">Duet</span>
						</div>
					</td></tr>
					<tr><td style="padding:16px 32px 4px;font-size:15px;color:#5b6270;line-height:1.5;">
						<strong>${inviter}</strong> invited you to join <strong>${project}</strong> on Duet.
					</td></tr>
					<tr><td style="padding:20px 32px;">
						<a href="${url}" style="display:inline-block;width:100%;box-sizing:border-box;text-align:center;background:#6366f1;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 20px;border-radius:10px;">Accept invite</a>
					</td></tr>
					<tr><td style="padding:4px 32px 32px;font-size:13px;color:#878e9c;line-height:1.5;">
						This invite expires in 14 days. If you weren't expecting this, you can safely ignore this email.
					</td></tr>
				</table>
				<p style="max-width:440px;margin:16px auto 0;font-size:12px;color:#aab0bc;text-align:center;">Sent by Duet</p>
			</td></tr>
		</table>
	</body>
</html>`;
}

function renderOtpHtml(otp: string, intro: string): string {
	return `<!doctype html>
<html>
	<body style="margin:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16181d;">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
			<tr><td align="center">
				<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e6e8ec;border-radius:16px;overflow:hidden;">
					<tr><td style="padding:32px 32px 8px;">
						<div style="display:inline-flex;align-items:center;gap:10px;">
							<span style="display:inline-block;width:28px;height:28px;background:#6366f1;border-radius:8px;"></span>
							<span style="font-size:20px;font-weight:700;letter-spacing:-0.02em;">Duet</span>
						</div>
					</td></tr>
					<tr><td style="padding:16px 32px 4px;font-size:15px;color:#5b6270;line-height:1.5;">
						${intro}
					</td></tr>
					<tr><td style="padding:16px 32px;">
						<div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:0.22em;text-align:center;white-space:nowrap;background:#f3f4f7;border:1px solid #e6e8ec;border-radius:12px;padding:20px 12px;color:#16181d;">
							${otp}
						</div>
					</td></tr>
					<tr><td style="padding:4px 32px 32px;font-size:13px;color:#878e9c;line-height:1.5;">
						This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.
					</td></tr>
				</table>
				<p style="max-width:440px;margin:16px auto 0;font-size:12px;color:#aab0bc;text-align:center;">Sent by Duet</p>
			</td></tr>
		</table>
	</body>
</html>`;
}
