// Curated accent palette for projects, tags and categories.
export const PROJECT_COLORS = [
	'#6366f1', // indigo
	'#8b5cf6', // violet
	'#ec4899', // pink
	'#f43f5e', // rose
	'#ef4444', // red
	'#f59e0b', // amber
	'#eab308', // yellow
	'#84cc16', // lime
	'#10b981', // emerald
	'#14b8a6', // teal
	'#06b6d4', // cyan
	'#0ea5e9', // sky
	'#3b82f6', // blue
	'#64748b' // slate
];

export const TAG_COLORS = PROJECT_COLORS;

export const PROJECT_EMOJI = [
	'📋','🚀','💡','🛠️','🎯','🔥','📦','🧪','🎨','🧠','📝','⚙️','🌱','📊','💻','📱','🔭','🏗️','🗂️','✨','🧩','🔬','🎬','🏷️','📚','🐛','🧭','🌟'
];

export const PROJECT_STYLES: { value: 'soft' | 'solid' | 'outline' | 'glass'; label: string }[] = [
	{ value: 'soft', label: 'Soft' },
	{ value: 'solid', label: 'Solid' },
	{ value: 'outline', label: 'Outline' },
	{ value: 'glass', label: 'Glass' }
];

/** Bounds for a project's task list max width, in px. A stored 0 fills the window. */
export const LIST_WIDTH = { min: 600, max: 2400, step: 20, default: 820 };

/** Snap a requested list width into range; 0 (fill the window) passes through. */
export function clampListWidth(px: number): number {
	if (px === 0) return 0;
	return Math.min(LIST_WIDTH.max, Math.max(LIST_WIDTH.min, Math.round(px)));
}
