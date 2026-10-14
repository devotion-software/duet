// Accent colour parsing and sanitisation, shared by the server (validating submitted
// values) and the client (the layout injects the active project's accent into a <style>
// tag, so anything that reaches it must be impossible to break out of CSS with).

/** Chars allowed in a colour or gradient value: enough for every CSS colour/gradient
 *  syntax, but no `<>;{}"'@:\\` or backtick, so a value can't escape a style tag or
 *  attribute or smuggle in another declaration. */
const SAFE_CHARS = /^[A-Za-z0-9#%.,()\s/+*-]+$/;

const GRADIENT_RE = /^(repeating-)?(linear|radial|conic)-gradient\s*\(/i;

/** A reasonable cap; the DB column is varchar(255). */
const MAX_LEN = 255;

/** True when the value looks like a CSS gradient rather than a solid colour. */
export function isGradient(value: string | null | undefined): boolean {
	return !!value && GRADIENT_RE.test(value.trim());
}

/**
 * Return a safe solid CSS colour, or null if it isn't one we'll accept. Rejects
 * gradients (use sanitizeGradient for those) and anything with CSS-breaking chars.
 * Balanced parens are required so e.g. `rgb(0,0,0)` passes but `rgb(0,0,0` doesn't.
 */
export function sanitizeColor(value: string | null | undefined): string | null {
	const v = (value ?? '').trim();
	if (!v || v.length > MAX_LEN) return null;
	if (!SAFE_CHARS.test(v)) return null;
	if (isGradient(v)) return null;
	if (!parensBalanced(v)) return null;
	return v;
}

/**
 * Return a safe CSS gradient, or null. Must start with a gradient function and use
 * only the safe charset with balanced parens.
 */
export function sanitizeGradient(value: string | null | undefined): string | null {
	const v = (value ?? '').trim();
	if (!v || v.length > MAX_LEN) return null;
	if (!SAFE_CHARS.test(v)) return null;
	if (!GRADIENT_RE.test(v)) return null;
	if (!parensBalanced(v)) return null;
	return v;
}

function parensBalanced(v: string): boolean {
	let depth = 0;
	for (const c of v) {
		if (c === '(') depth++;
		else if (c === ')' && --depth < 0) return false;
	}
	return depth === 0;
}

/**
 * Browser-only: does the engine actually accept this as a CSS colour? Falls back to the
 * sanitiser on the server (where CSS.supports doesn't exist) so callers get a boolean
 * either way. Use for live form validation, not security — sanitize* is the gate.
 */
export function isValidColor(value: string): boolean {
	if (!sanitizeColor(value)) return false;
	if (typeof CSS !== 'undefined' && CSS.supports) return CSS.supports('color', value);
	return true;
}

/** Browser-only companion to isValidColor for gradient values. */
export function isValidGradient(value: string): boolean {
	if (!sanitizeGradient(value)) return false;
	if (typeof CSS !== 'undefined' && CSS.supports) return CSS.supports('background-image', value);
	return true;
}
