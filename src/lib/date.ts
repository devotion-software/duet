export type DeadlineState = 'overdue' | 'today' | 'soon' | 'future';

export function deadlineInfo(deadline: Date | null): { label: string; state: DeadlineState } | null {
	if (!deadline) return null;
	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const target = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
	const diffDays = Math.round((target.getTime() - startOfToday.getTime()) / 86400000);

	let state: DeadlineState = 'future';
	if (diffDays < 0) state = 'overdue';
	else if (diffDays === 0) state = 'today';
	else if (diffDays <= 3) state = 'soon';

	let label: string;
	if (diffDays === 0) label = 'Today';
	else if (diffDays === 1) label = 'Tomorrow';
	else if (diffDays === -1) label = 'Yesterday';
	else if (diffDays < 0) label = `${-diffDays}d overdue`;
	else if (diffDays <= 6) label = `In ${diffDays}d`;
	else
		label = deadline.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			...(deadline.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
		});

	return { label, state };
}

/** Short relative time for activity feeds: "just now", "5m ago", "Yesterday", "12 Mar". */
export function timeAgo(d: Date): string {
	const secs = Math.round((Date.now() - d.getTime()) / 1000);
	if (secs < 45) return 'just now';
	const mins = Math.round(secs / 60);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const now = new Date();
	const days = Math.round(
		(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
			new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
			86400000
	);
	if (days === 1) return 'Yesterday';
	if (days < 7) return `${days}d ago`;
	return d.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
	});
}

/** Format a Date as yyyy-mm-dd for <input type="date">. */
export function toDateInput(d: Date | null): string {
	if (!d) return '';
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
