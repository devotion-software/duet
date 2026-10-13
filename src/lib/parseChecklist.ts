export interface ParsedItem {
	title: string;
	completed: boolean;
}

/**
 * Parse pasted text into todo items. Understands markdown checklists
 * (`- [ ]` / `- [x]`), bullets (`-`, `*`, `+`), numbered lists (`1.`, `1)`),
 * ~~strikethrough~~ as done, and plain one-per-line text.
 */
export function parseChecklist(text: string): ParsedItem[] {
	const items: ParsedItem[] = [];

	for (const raw of text.split(/\r?\n/)) {
		let line = raw.trim();
		if (!line) continue;

		let completed = false;

		// Strip leading bullet / number markers.
		line = line.replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, '');

		// Strip leading markdown heading hashes.
		line = line.replace(/^#{1,6}\s+/, '');

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

		items.push({ title: line.slice(0, 500), completed });
	}

	return items;
}
