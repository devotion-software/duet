import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { db } from './db';
import { todos } from './db/app.schema';
import type { ProjectSummary } from './projects';
import type { Urgency } from '#lib/types';

export interface ProjectStats {
	/** Open and done tasks, counting subtasks only if the project summary's `countSubtasks` is set. */
	open: number;
	done: number;
	/** Open urgent tasks at any depth, matching the urgent list. */
	urgent: number;
}

export interface UrgentTask {
	id: string;
	projectId: string;
	title: string;
	/** Title of the parent task when this is a subtask. */
	parentTitle: string | null;
	deadline: Date | null;
	startedAt: Date | null;
}

/** Every open task at a given urgency, across the given projects. */
export async function listUrgencyTasks(projectIds: string[], urgency: Urgency): Promise<UrgentTask[]> {
	if (!projectIds.length) return [];
	const parent = alias(todos, 'parent');
	return db
		.select({
			id: todos.id,
			projectId: todos.projectId,
			title: todos.title,
			parentTitle: parent.title,
			deadline: todos.deadline,
			startedAt: todos.startedAt
		})
		.from(todos)
		.leftJoin(parent, eq(parent.id, todos.parentId))
		.where(
			and(
				inArray(todos.projectId, projectIds),
				isNull(todos.deletedAt),
				eq(todos.completed, false),
				eq(todos.urgency, urgency)
			)
		)
		// Soonest deadline first, undated ones last.
		.orderBy(sql`${todos.deadline} is null`, asc(todos.deadline), asc(todos.createdAt));
}

/** Per-project task counts and every open urgent task across the given projects. */
export async function getHomeOverview(projects: ProjectSummary[]) {
	const ids = projects.map((p) => p.id);
	if (!ids.length) return { stats: {} as Record<string, ProjectStats>, urgent: [] as UrgentTask[] };

	const [counts, urgent] = await Promise.all([
		db
			.select({
				projectId: todos.projectId,
				open: sql<number>`sum(case when ${todos.completed} = false then 1 else 0 end)`,
				openRoots: sql<number>`sum(case when ${todos.completed} = false and ${todos.parentId} is null then 1 else 0 end)`,
				done: sql<number>`sum(case when ${todos.completed} = true then 1 else 0 end)`,
				doneRoots: sql<number>`sum(case when ${todos.completed} = true and ${todos.parentId} is null then 1 else 0 end)`,
				urgent: sql<number>`sum(case when ${todos.completed} = false and ${todos.urgency} = 'urgent' then 1 else 0 end)`
			})
			.from(todos)
			.where(and(inArray(todos.projectId, ids), isNull(todos.deletedAt)))
			.groupBy(todos.projectId),
		listUrgencyTasks(ids, 'urgent')
	]);

	const countMap = new Map(counts.map((c) => [c.projectId, c]));
	const stats: Record<string, ProjectStats> = {};
	for (const p of projects) {
		const c = countMap.get(p.id);
		stats[p.id] = {
			open: Number((p.countSubtasks ? c?.open : c?.openRoots) ?? 0),
			done: Number((p.countSubtasks ? c?.done : c?.doneRoots) ?? 0),
			urgent: Number(c?.urgent ?? 0)
		};
	}
	return { stats, urgent };
}
