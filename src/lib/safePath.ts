// Guards against open redirects via a `next`-style query param. A leading `/` alone
// isn't enough — `//evil.com` and `/\evil.com` are both treated by browsers as
// protocol-relative absolute URLs, so they must be rejected too.

export function safeRedirectPath(value: string | null | undefined): string | null {
	if (!value) return null;
	if (!value.startsWith('/')) return null;
	if (value.startsWith('//') || value.startsWith('/\\')) return null;
	return value;
}
