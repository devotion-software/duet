export interface ParsedItem {
	title: string;
	completed: boolean;
	/** Heading the item was listed under, if any. */
	group?: string;
}

const LIST_MARKER = /^(?:[-*+]|\d+[.)])\s+|^\[[ xX·•]?\]/;
const HEADING = /^#{1,6}\s+/;

/**
 * Parse pasted text into todo items. Understands markdown checklists
 * (`- [ ]` / `- [x]`), bullets (`-`, `*`, `+`), numbered lists (`1.`, `1)`),
 * ~~strikethrough~~ as done, and plain one-per-line text.
 *
 * Markdown headings, and plain lines directly followed by a list item, are
 * treated as group headers: the items beneath them get that `group`.
 */
export function parseChecklist(text: string): ParsedItem[] {
	const items: ParsedItem[] = [];
	const lines = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	let group: string | undefined;

	for (let i = 0; i < lines.length; i++) {
		let line = lines[i];
		let completed = false;

		const isHeading = HEADING.test(line);
		if (isHeading || (!LIST_MARKER.test(line) && LIST_MARKER.test(lines[i + 1] ?? ''))) {
			const name = line.replace(HEADING, '').replace(/:$/, '').trim().slice(0, 80);
			if (name && !/^[-=_*]{3,}$/.test(name)) {
				group = name;
				continue;
			}
		}

		// Strip leading bullet / number markers.
		line = line.replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, '');

		// Markdown checkbox.
		const checkbox = line.match(/^\[([ xX·•]?)\]\s*(.*)$/);
		if (checkbox) {
			completed = /[xX]/.test(checkbox[1]);
			line = checkbox[2];
		}

		// Strikethrough → treat as completed.
		const strike = line.match(/^~~(.*?)~~$/);
		if (strike) {
			completed = true;
			line = strike[1];
		}

		line = line.trim();
		if (!line) continue;
		// Skip markdown horizontal rules / separators.
		if (/^[-=_*]{3,}$/.test(line)) continue;

		items.push({ title: line.slice(0, 500), completed, ...(group ? { group } : {}) });
	}

	return items;
}
