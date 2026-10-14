// Per-project typeface parsing and sanitisation, shared by the server (validating a
// submitted font) and the client (the layout injects a project's font-family into style
// attributes, and loads custom fonts from Google Fonts). Anything that reaches a <style>
// tag or a URL must be impossible to break out of, so the charset is deliberately tight.

/** The four built-in presets; each maps to a `--font-*` token in tokens.css. */
export const FONT_PRESETS = ['sans', 'serif', 'mono', 'rounded'] as const;
export type FontPreset = (typeof FONT_PRESETS)[number];

/** Preset buttons for the picker, in order. */
export const FONT_PRESET_OPTIONS: { value: FontPreset; label: string }[] = [
	{ value: 'sans', label: 'Sans' },
	{ value: 'serif', label: 'Serif' },
	{ value: 'mono', label: 'Mono' },
	{ value: 'rounded', label: 'Rounded' }
];

/** A generous, curated set of popular Google Fonts offered in the picker. Any other
 *  family can still be typed free-hand — the loader requests whatever name is given. */
export const GOOGLE_FONTS = [
	'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway', 'Nunito',
	'Nunito Sans', 'Work Sans', 'Rubik', 'Mulish', 'Manrope', 'DM Sans', 'Karla', 'Quicksand',
	'Josefin Sans', 'Figtree', 'Outfit', 'Sora', 'Space Grotesk', 'Plus Jakarta Sans',
	'Albert Sans', 'Lexend', 'Public Sans', 'Hanken Grotesk', 'Onest', 'Geist',
	'IBM Plex Sans', 'IBM Plex Serif', 'IBM Plex Mono', 'Source Sans 3', 'Source Serif 4',
	'Source Code Pro', 'Fira Sans', 'Fira Code', 'JetBrains Mono', 'Roboto Mono', 'Space Mono',
	'Ubuntu', 'Ubuntu Mono', 'PT Sans', 'PT Serif', 'Merriweather', 'Playfair Display',
	'Lora', 'Cormorant Garamond', 'EB Garamond', 'Libre Baskerville', 'Crimson Text',
	'Bitter', 'Zilla Slab', 'Roboto Slab', 'Arvo', 'Domine', 'Noto Sans', 'Noto Serif',
	'Cabin', 'Oxygen', 'Barlow', 'Titillium Web', 'Heebo', 'Assistant', 'Varela Round',
	'Comfortaa', 'Baloo 2', 'Fredoka', 'Pacifico', 'Caveat', 'Dancing Script', 'Lobster',
	'Bricolage Grotesque', 'Instrument Sans', 'Schibsted Grotesk', 'Archivo', 'Chivo',
	'Red Hat Display', 'Spline Sans', 'Urbanist', 'Epilogue'
] as const;

/** Font-family names only: letters, digits, spaces and hyphens — no quotes, commas,
 *  semicolons, braces or other CSS/URL-breaking characters. */
const SAFE_FONT = /^[A-Za-z0-9][A-Za-z0-9 -]*$/;

/** A reasonable cap; the DB column is varchar(120). */
const MAX_LEN = 120;

export function isPreset(value: string | null | undefined): value is FontPreset {
	return !!value && FONT_PRESETS.includes(value as FontPreset);
}

/**
 * Return a safe font value — a preset keyword, or a single custom family name — or null.
 * Collapses internal whitespace so " Open   Sans " becomes "Open Sans".
 */
export function sanitizeFont(value: string | null | undefined): string | null {
	const v = (value ?? '').trim().replace(/\s+/g, ' ');
	if (!v || v.length > MAX_LEN) return null;
	if (isPreset(v)) return v;
	if (!SAFE_FONT.test(v)) return null;
	return v;
}

/** Browser-leaning validity check for live form feedback; falls back to the sanitiser. */
export function isValidFont(value: string): boolean {
	return sanitizeFont(value) !== null;
}

/**
 * Resolve a stored font to a CSS `font-family` value. Presets use their token; a custom
 * family is quoted and backed by the sans stack so unavailable fonts fall back cleanly.
 * Returns null for an unusable value so callers can omit the declaration.
 */
export function fontFamily(value: string | null | undefined): string | null {
	const v = sanitizeFont(value);
	if (!v) return null;
	if (isPreset(v)) return `var(--font-${v})`;
	// Safe to single-quote: the charset excludes quotes and backslashes.
	return `'${v}', var(--font-sans)`;
}

/** The `font-family: …;` declaration for a project, or '' when it's a preset-sans/invalid
 *  value that needs no inline override. Safe to drop into a style attribute or <style>. */
export function fontStyle(value: string | null | undefined): string {
	const family = fontFamily(value);
	return family ? `font-family: ${family};` : '';
}

/** The custom (non-preset) family a value names, for loading from Google Fonts; null for
 *  presets or invalid values. */
export function customFamily(value: string | null | undefined): string | null {
	const v = sanitizeFont(value);
	return v && !isPreset(v) ? v : null;
}

/**
 * A Google Fonts stylesheet URL requesting the given custom families (presets/invalids
 * ignored, duplicates collapsed), or null when there's nothing custom to load. Weights
 * cover the app's normal/medium/semibold/bold usage. A family Google doesn't have simply
 * returns no CSS, so the family falls back to any locally-installed font of that name.
 */
export function googleFontsHref(values: Iterable<string | null | undefined>): string | null {
	const families = new Set<string>();
	for (const v of values) {
		const fam = customFamily(v);
		if (fam) families.add(fam);
	}
	if (families.size === 0) return null;
	const params = [...families]
		.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700`)
		.join('&');
	return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
