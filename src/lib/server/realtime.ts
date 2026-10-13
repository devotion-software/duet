/**
 * In-process pub/sub for live updates. Each project is a channel; SSE
 * connections subscribe and mutation endpoints publish. Single-node only
 * (swap for Redis pub/sub to scale horizontally).
 */

export interface RealtimeEvent {
	type:
		| 'todo.created'
		| 'todo.updated'
		| 'todo.deleted'
		| 'todos.imported'
		| 'todos.reordered'
		| 'tag.changed'
		| 'category.changed'
		| 'member.changed'
		| 'project.updated';
	/** Client id of the actor, so the originating tab can ignore its own echo. */
	origin?: string;
	payload?: unknown;
}

type Listener = (event: RealtimeEvent) => void;

const channels = new Map<string, Set<Listener>>();

export function subscribe(projectId: string, listener: Listener): () => void {
	let set = channels.get(projectId);
	if (!set) {
		set = new Set();
		channels.set(projectId, set);
	}
	set.add(listener);
	return () => {
		set!.delete(listener);
		if (set!.size === 0) channels.delete(projectId);
	};
}

export function publish(projectId: string, event: RealtimeEvent): void {
	const set = channels.get(projectId);
	if (!set) return;
	for (const listener of set) {
		try {
			listener(event);
		} catch {
			// A broken listener shouldn't break the others.
		}
	}
}
