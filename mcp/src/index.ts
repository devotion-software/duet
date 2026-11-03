import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { duet, statusOf, DuetApiError, type Todo, type Label } from './client.js';

const server = new McpServer({ name: 'duet', version: '0.2.0' });

function summarize(t: Todo) {
	return {
		id: t.id,
		title: t.title,
		status: statusOf(t),
		description: t.description,
		urgency: t.urgency,
		size: t.size,
		deadline: t.deadline,
		assignee: t.assignee?.name ?? null,
		category: t.category?.name ?? null,
		tags: t.tags.map((tag) => tag.name),
		parentId: t.parentId
	};
}

function label(l: Label) {
	return { id: l.id, name: l.name, color: l.color, ...(l.usageCount !== undefined ? { usageCount: l.usageCount } : {}) };
}

const colorSchema = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/)
	.describe('Hex colour, e.g. #3b82f6');

const categoryRef = z
	.string()
	.nullable()
	.optional()
	.describe('Category id or name (created if it does not exist), or null to clear');

const tagRefs = (what: string) =>
	z.array(z.string()).optional().describe(`${what} Tag ids or names; unknown names are created.`);

/** Works out the new tagIds for a task from replace/add/remove inputs, or undefined if unchanged. */
async function nextTagIds(
	projectId: string,
	current: string[],
	input: { tags?: string[]; addTags?: string[]; removeTags?: string[] }
) {
	if (!input.tags && !input.addTags?.length && !input.removeTags?.length) return undefined;
	let ids = input.tags ? await duet.resolveTagIds(projectId, input.tags, true) : [...current];
	if (input.addTags?.length) ids.push(...(await duet.resolveTagIds(projectId, input.addTags, true)));
	if (input.removeTags?.length) {
		const all = await duet.listTags(projectId);
		const names = new Set(input.removeTags.map((r) => r.trim().toLowerCase()));
		const drop = new Set(
			all.filter((t) => input.removeTags!.includes(t.id) || names.has(t.name.toLowerCase())).map((t) => t.id)
		);
		ids = ids.filter((id) => !drop.has(id));
	}
	return [...new Set(ids)];
}

function text(data: unknown) {
	return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(e: unknown) {
	const message = e instanceof DuetApiError ? e.message : e instanceof Error ? e.message : String(e);
	return { content: [{ type: 'text' as const, text: message }], isError: true };
}

server.registerTool(
	'list_projects',
	{
		title: 'List Duet projects',
		description: "List the Duet projects the authenticated user is a member of, with open/total task counts."
	},
	async () => {
		try {
			const projects = await duet.listProjects();
			return text(
				projects.map((p) => ({
					id: p.id,
					slug: p.slug,
					name: p.name,
					status: p.status,
					role: p.role,
					openCount: p.openCount,
					totalCount: p.totalCount
				}))
			);
		} catch (e) {
			return toolError(e);
		}
	}
);

server.registerTool(
	'list_tasks',
	{
		title: 'List tasks in a Duet project',
		description: 'List tasks (todos) in a Duet project, optionally filtered by status.',
		inputSchema: {
			projectId: z.string().describe('Project id, from list_projects'),
			status: z
				.enum(['open', 'in_progress', 'to_test', 'done', 'not_doing'])
				.optional()
				.describe('Only return tasks in this status')
		}
	},
	async ({ projectId, status }) => {
		try {
			const todos = await duet.listTasks(projectId);
			const filtered = status ? todos.filter((t) => statusOf(t) === status) : todos;
			return text(filtered.map(summarize));
		} catch (e) {
			return toolError(e);
		}
	}
);

server.registerTool(
	'get_task',
	{
		title: 'Get a single task',
		description: 'Get full details for one task.',
		inputSchema: {
			projectId: z.string(),
			taskId: z.string()
		}
	},
	async ({ projectId, taskId }) => {
		try {
			return text(summarize(await duet.getTask(projectId, taskId)));
		} catch (e) {
			return toolError(e);
		}
	}
);

server.registerTool(
	'create_task',
	{
		title: 'Create a task',
		description: 'Create a new task (or subtask) in a Duet project.',
		inputSchema: {
			projectId: z.string(),
			title: z.string(),
			description: z.string().optional(),
			parentId: z.string().optional().describe('Set to create this as a subtask'),
			urgency: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
			size: z.enum(['xs', 's', 'm', 'l', 'xl']).optional(),
			deadline: z.string().optional().describe('ISO date'),
			category: categoryRef,
			tags: tagRefs('Tags to apply.')
		}
	},
	async ({ projectId, category, tags, ...fields }) => {
		try {
			const categoryId = category ? await duet.resolveCategoryId(projectId, category, true) : null;
			const tagIds = tags?.length ? await duet.resolveTagIds(projectId, tags, true) : [];
			return text(
				summarize(await duet.createTask(projectId, { ...fields, categoryId, tagIds }))
			);
		} catch (e) {
			return toolError(e);
		}
	}
);

server.registerTool(
	'update_task_status',
	{
		title: 'Update a task status',
		description:
			'Move a task through its workflow: open, in_progress, to_test, done, or not_doing. ' +
			'Every change made through this tool is recorded against the task as an AI-agent edit.',
		inputSchema: {
			projectId: z.string(),
			taskId: z.string(),
			status: z.enum(['open', 'in_progress', 'to_test', 'done', 'not_doing'])
		}
	},
	async ({ projectId, taskId, status }) => {
		try {
			return text(summarize(await duet.setTaskStatus(projectId, taskId, status)));
		} catch (e) {
			return toolError(e);
		}
	}
);

server.registerTool(
	'update_task',
	{
		title: 'Edit a task',
		description:
			"Update a task's title, description, urgency, size, deadline, category or tags. " +
			'Use `tags` to replace the whole tag set, or `addTags`/`removeTags` to change it incrementally.',
		inputSchema: {
			projectId: z.string(),
			taskId: z.string(),
			title: z.string().optional(),
			description: z.string().optional(),
			urgency: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
			size: z.enum(['xs', 's', 'm', 'l', 'xl']).optional(),
			deadline: z.string().nullable().optional().describe('ISO date, or null to clear'),
			category: categoryRef,
			tags: tagRefs('Replace all tags on the task with these. Pass [] to clear.'),
			addTags: tagRefs('Add these tags to the task.'),
			removeTags: z
				.array(z.string())
				.optional()
				.describe('Remove these tags (ids or names) from the task. The tags themselves are kept.')
		}
	},
	async ({ projectId, taskId, category, tags, addTags, removeTags, ...fields }) => {
		try {
			const patch: Parameters<typeof duet.updateTask>[2] = { ...fields };
			if (category !== undefined) {
				patch.categoryId = category === null ? null : await duet.resolveCategoryId(projectId, category, true);
			}
			if (tags || addTags?.length || removeTags?.length) {
				const current = tags ? [] : (await duet.getTask(projectId, taskId)).tags.map((t) => t.id);
				const tagIds = await nextTagIds(projectId, current, { tags, addTags, removeTags });
				if (tagIds) patch.tagIds = tagIds;
			}
			if (!Object.keys(patch).length) throw new Error('Nothing to update');
			return text(summarize(await duet.updateTask(projectId, taskId, patch)));
		} catch (e) {
			return toolError(e);
		}
	}
);

// ─── Tags & categories ──────────────────────────────────────────────────────
for (const kind of ['tag', 'category'] as const) {
	const plural = kind === 'tag' ? 'tags' : 'categories';
	const api =
		kind === 'tag'
			? { list: duet.listTags, create: duet.createTag, update: duet.updateTag, remove: duet.deleteTag }
			: {
					list: duet.listCategories,
					create: duet.createCategory,
					update: duet.updateCategory,
					remove: duet.deleteCategory
				};
	const idKey = `${kind}Id` as const;
	const resolve = async (projectId: string, ref: string) =>
		kind === 'tag'
			? (await duet.resolveTagIds(projectId, [ref]))[0]
			: await duet.resolveCategoryId(projectId, ref);
	const note =
		kind === 'tag'
			? 'A task can have many tags.'
			: 'A task has at most one category.';

	server.registerTool(
		`list_${plural}`,
		{
			title: `List ${plural}`,
			description: `List the ${plural} defined in a project, with how many tasks use each. ${note}`,
			inputSchema: { projectId: z.string() }
		},
		async ({ projectId }) => {
			try {
				return text((await api.list(projectId)).map(label));
			} catch (e) {
				return toolError(e);
			}
		}
	);

	server.registerTool(
		`create_${kind}`,
		{
			title: `Create a ${kind}`,
			description: `Create a ${kind} in a project. If one with this name already exists it is returned (and recoloured if a colour is given).`,
			inputSchema: { projectId: z.string(), name: z.string(), color: colorSchema.optional() }
		},
		async ({ projectId, name, color }) => {
			try {
				return text(label(await api.create(projectId, { name, color })));
			} catch (e) {
				return toolError(e);
			}
		}
	);

	server.registerTool(
		`update_${kind}`,
		{
			title: `Rename or recolour a ${kind}`,
			description: `Rename and/or recolour a ${kind}. Accepts the ${kind}'s id or current name.`,
			inputSchema: {
				projectId: z.string(),
				id: z.string().describe(`The ${kind}'s id or current name`),
				name: z.string().optional().describe('New name'),
				color: colorSchema.optional()
			}
		},
		async ({ projectId, id: ref, name, color }) => {
			try {
				if (name === undefined && color === undefined) throw new Error('Nothing to update');
				const id = await resolve(projectId, ref);
				return text(label(await api.update(projectId, id, { name, color })));
			} catch (e) {
				return toolError(e);
			}
		}
	);

	server.registerTool(
		`delete_${kind}`,
		{
			title: `Delete a ${kind}`,
			description:
				`Permanently delete a ${kind} from the project. It is removed from every task that uses it. ` +
				(kind === 'tag' ? 'To take a tag off a single task instead, use update_task with removeTags.' : 'To clear one task\'s category instead, use update_task with category: null.'),
			inputSchema: { projectId: z.string(), id: z.string().describe(`The ${kind}'s id or name`) }
		},
		async ({ projectId, id: ref }) => {
			try {
				const id = await resolve(projectId, ref);
				await api.remove(projectId, id);
				return text({ deleted: { [idKey]: id } });
			} catch (e) {
				return toolError(e);
			}
		}
	);
}

const transport = new StdioServerTransport();
await server.connect(transport);
