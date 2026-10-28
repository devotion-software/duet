# Duet MCP server

Lets Claude Code list and update tasks in your Duet projects at
`https://duet.devotion.software` (or any Duet instance) by calling its REST API
with an API key — no cookie session needed.

## Setup

1. In Duet, go to **Settings → API keys** and create a key. Copy it now; it's
   only shown once.
2. Register the server with Claude Code, using `--scope user` so it's available
   in every repo, not just whichever one you happen to be in when you run this
   (replace the path with wherever you cloned this repo):

   ```sh
   claude mcp add duet --scope user \
     --env DUET_API_KEY=<your key> \
     -- bun run /absolute/path/to/duet/mcp/src/index.ts
   ```

   (`DUET_BASE_URL` defaults to `https://duet.devotion.software`; only pass
   `--env DUET_BASE_URL=...` if you're pointing at a different instance.)

3. Start (or restart) Claude Code anywhere and check it picked up the server:

   ```sh
   claude mcp list
   ```

   You should see `duet` listed as connected. Then just ask, e.g. "work
   through the open tasks in project X".

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
