// Keyboard shortcut helpers and the reference list shown in the shortcuts dialog.

/** True while the user is typing somewhere, so single-key shortcuts must stay out of the way. */
export function isTyping(e: KeyboardEvent): boolean {
	const el = e.target as HTMLElement | null;
	if (!el) return false;
	if (el.isContentEditable) return true;
	if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
	if (el instanceof HTMLInputElement) {
		return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(el.type);
	}
	return false;
}

/** True when focus is on a control that already reacts to Space/Enter itself. */
export function onControl(): boolean {
	const el = document.activeElement;
	return !!el && el !== document.body && !!el.closest('button, a[href], summary, [role="button"], [role="menuitem"]');
}

/** A modal dialog owns the keyboard while it's open. */
export function dialogOpen(): boolean {
	return !!document.querySelector('[aria-modal="true"]');
}

/** Whether a keydown should be considered for single-key app shortcuts at all. */
export function shortcutAllowed(e: KeyboardEvent, allowAlt = false): boolean {
	return (
		!e.defaultPrevented &&
		!e.metaKey &&
		!e.ctrlKey &&
		(allowAlt || !e.altKey) &&
		!e.isComposing &&
		!isTyping(e) &&
		!dialogOpen()
	);
}

export const SHORTCUTS: { title: string; items: { keys: string[]; label: string }[] }[] = [
	{
		title: 'General',
		items: [
			{ keys: ['?'], label: 'Show keyboard shortcuts' },
			{ keys: ['['], label: 'Previous project' },
			{ keys: [']'], label: 'Next project' },
			{ keys: ['1–9'], label: 'Jump to project by position' },
			{ keys: ['\\'], label: 'Collapse / expand sidebar' },
			{ keys: ['n'], label: 'Add a task' },
			{ keys: ['/'], label: 'Search tasks' },
			{ keys: ['Esc'], label: 'Leave input, close panel or clear selection' }
		]
	},
	{
		title: 'Task list',
		items: [
			{ keys: ['↑', '↓'], label: 'Move between tasks (also k / j)' },
			{ keys: ['Home', 'End'], label: 'First / last task' },
			{ keys: ['←', '→'], label: 'Collapse / expand subtasks' },
			{ keys: ['Alt', '↑ ↓'], label: 'Move task up / down (manual sort)' },
			{ keys: ['Space'], label: 'Tick / untick task' },
			{ keys: ['Enter'], label: 'Open task details (also o)' },
			{ keys: ['p'], label: 'Toggle in progress' },
			{ keys: ['w'], label: "Mark as not doing (won't do)" },
			{ keys: ['a'], label: 'Add a subtask' },
			{ keys: ['c'], label: 'Copy task for AI' },
			{ keys: ['x'], label: 'Select task for bulk edit' },
			{ keys: ['Shift', '↑ ↓'], label: 'Extend selection' },
			{ keys: ['Del'], label: 'Delete task' },
			{ keys: ['h'], label: 'Show / hide completed' }
		]
	},
	{
		title: 'Task details',
		items: [
			{ keys: ['↑', '↓'], label: 'Previous / next task (also k / j)' },
			{ keys: ['Esc'], label: 'Close details' }
		]
	}
];
