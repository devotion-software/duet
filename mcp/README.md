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
| `create_task` | Create a task or subtask, optionally with urgency, size, deadline, category and tags |
| `update_task_status` | Move a task between open/in_progress/to_test/done/not_doing |
| `update_task` | Edit title/description/urgency/size/deadline/category, and replace (`tags`), add (`addTags`) or remove (`removeTags`) tags |
| `bulk_create_tasks` | Create up to 100 tasks atomically in one request, with subtasks nested via `parentIndex` |
| `bulk_update_tasks` | Apply the same status/urgency/size/deadline/category/tag changes to many tasks at once (atomic) |
| `list_tags` / `list_categories` | Tags or categories defined in a project, with usage counts |
| `create_tag` / `create_category` | Create one (returns the existing one if the name is taken) |
| `update_tag` / `update_category` | Rename and/or recolour |
| `delete_tag` / `delete_category` | Delete from the project, removing it from every task |

Tags and categories can be referred to by id or by name (case-insensitive).
When assigning them to a task, unknown names are created automatically.
