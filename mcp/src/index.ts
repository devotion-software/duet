import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { duet, statusOf, DuetApiError, type Todo } from './client.js';

const server = new McpServer({ name: 'duet', version: '0.1.0' });

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
			parentId: z.string().optional().describe('Set to create this as a subtask')
		}
	},
	async ({ projectId, title, description, parentId }) => {
		try {
			return text(summarize(await duet.createTask(projectId, { title, description, parentId })));
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
		description: "Update a task's title, description, urgency, size or deadline.",
		inputSchema: {
			projectId: z.string(),
			taskId: z.string(),
			title: z.string().optional(),
			description: z.string().optional(),
			urgency: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
			size: z.enum(['xs', 's', 'm', 'l', 'xl']).optional(),
			deadline: z.string().nullable().optional().describe('ISO date, or null to clear')
		}
	},
	async ({ projectId, taskId, ...patch }) => {
		try {
			return text(summarize(await duet.updateTask(projectId, taskId, patch)));
		} catch (e) {
			return toolError(e);
		}
	}
);

const transport = new StdioServerTransport();
await server.connect(transport);
