import { error } from '@sveltejs/kit';
import { listUrgencyTasks } from '#lib/server/home';
import { URGENCIES, type Urgency } from '#lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, params }) => {
	const level = params.level as Urgency;
	if (!URGENCIES.includes(level)) error(404, 'Not found');

	const { projects } = await parent();
	const ids = projects.filter((p) => p.status !== 'archived').map((p) => p.id);
	const tasks = await listUrgencyTasks(ids, level);

	return { level, tasks };
};
