# Duet MCP server

Lets Claude Code list and update tasks in your Duet projects at
`https://duet.devotion.software` (or any Duet instance) by calling its REST API
with an API key — no cookie session needed.

## Setup

1. In Duet, go to **Settings → API keys** and create a key. Copy it now; it's
   only shown once.
2. Register the server with Claude Code (run from anywhere, not just this repo):

   ```sh
   claude mcp add duet \
     --env DUET_API_KEY=<your key> \
     --env DUET_BASE_URL=https://duet.devotion.software \
     -- bun run /absolute/path/to/duet/mcp/src/index.ts
   ```

   (`DUET_BASE_URL` defaults to the production URL above, so it can be omitted
   unless you're pointing at a different instance.)

3. In a new Claude Code session: "work through the open tasks in project X".

## Tracking AI changes

Every change made through a key shows up in that task's history with an "AI"
source, and the task gets a small sparkle badge in the list view
(`todos.aiTouchedAt`) — so it's always clear which tasks a human touched versus
an agent.

## Tools

| Tool | Does |
| --- | --- |
| `list_projects` | Projects the key's owner is a member of |
| `list_tasks` | Tasks in a project, optionally filtered by status |
| `get_task` | One task's full details |
| `create_task` | Create a task or subtask |
| `update_task_status` | Move a task between open/in_progress/to_test/done/not_doing |
| `update_task` | Edit title/description/urgency/size/deadline |
