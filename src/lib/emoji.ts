// Project icon emoji validation, shared by the server (validating a submitted icon) and
// the client (live feedback on the free-text emoji box).

/** True when `value` is exactly one emoji grapheme — a single pictograph, a flag (two
 *  regional indicators), or a ZWJ/skin-tone sequence like 👨‍👩‍👧‍👦 or 👍🏽 — and nothing else. */
export function isValidEmoji(value: string | null | undefined): boolean {
	const v = (value ?? '').trim();
	if (!v) return false;
	const graphemes =
		typeof Intl !== 'undefined' && 'Segmenter' in Intl
			? [...new Intl.Segmenter().segment(v)].map((s) => s.segment)
			: [v];
	if (graphemes.length !== 1) return false;
	const part = '\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?';
	const EMOJI_RE = new RegExp(`^(?:\\p{Regional_Indicator}{2}|${part}(?:\\u200D${part})*)$`, 'u');
	return EMOJI_RE.test(graphemes[0]);
}
