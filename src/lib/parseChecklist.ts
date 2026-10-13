export interface ParsedItem {
	title: string;
	completed: boolean;
	/** Heading the item was listed under, if any. */
	group?: string;
	/** Index of the item this one is indented under, if any. */
	parent?: number;
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
 *
 * Indented items become subtasks of the nearest less-indented item above them,
 * to any depth.
 */
export function parseChecklist(text: string): ParsedItem[] {
	const items: ParsedItem[] = [];
	const raw = text.split(/\r?\n/).filter((l) => l.trim());
	const lines = raw.map((l) => l.trim());
	const indents = raw.map((l) => l.match(/^\s*/)![0].replace(/\t/g, '    ').length);
	let group: string | undefined;
	// Open ancestors for the current line: [indent, item index].
	let stack: [number, number][] = [];

	for (let i = 0; i < lines.length; i++) {
		let line = lines[i];
		let completed = false;

		const isHeading = HEADING.test(line);
		if (isHeading || (!LIST_MARKER.test(line) && LIST_MARKER.test(lines[i + 1] ?? ''))) {
			const name = line.replace(HEADING, '').replace(/:$/, '').trim().slice(0, 80);
			if (name && !/^[-=_*]{3,}$/.test(name)) {
				group = name;
				stack = [];
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

		while (stack.length && stack[stack.length - 1][0] >= indents[i]) stack.pop();
		const parent = stack[stack.length - 1]?.[1];
		stack.push([indents[i], items.length]);
		items.push({
			title: line.slice(0, 500),
			completed,
			...(group ? { group } : {}),
			...(parent !== undefined ? { parent } : {})
		});
	}

	return items;
}
