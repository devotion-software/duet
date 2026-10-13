# Duet

A fast, beautiful multi-project todo tracker. Spin up projects, capture tasks
instantly, and keep every collaborator in sync.

Built with **SvelteKit 3** (Svelte 5 runes), **MariaDB** + **Drizzle ORM**,
**Better Auth** (passwordless), and **Bun**.

## Features

- **Passwordless auth** — GitHub OAuth, email one-time codes, and passkeys.
- **Projects** with their own colour, icon and style; the whole UI re-themes to
  match the active project.
- **Instant capture** — one keystroke to add a task, one click to complete it
  (optimistic UI).
- **Rich tasks** — category, assignee, deadline, urgency, size, custom tags, a
  full **markdown + code** description, and **image attachments** (drag, drop or
  paste) stored in Cloudflare R2.
- **Subtasks, nested to any depth** — collapse/expand, progress counts, move
  tasks anywhere in the tree. Completing a task completes its subtasks;
  reopening a subtask reopens its parents.
- **Paste to import** — drop in an existing checklist (incl. `- [x]` checked
  items, indented items become subtasks) and it's parsed into tasks.
- **Copy for AI** — copy a whole task as markdown to hand to an assistant.
- **Live collaboration** — changes stream to other open sessions over SSE.
- **Roles** — Owner / Editor / Viewer per project.
- **Themeable** — light / dark / system, everything driven by CSS variables.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.4
- [Docker](https://www.docker.com/) (for the MariaDB container)

## Getting started

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env         # then edit if needed (defaults work out of the box)

# 3. Start the database (MariaDB :3311) + Mailpit dev mail (UI :8026)
bun run db:up

# 4. Apply the schema
bun run db:migrate

# 5. Run the dev server (http://localhost:5180)
bun run dev
```

Open http://localhost:5180 and sign in. **In development, email is captured by
[Mailpit](https://mailpit.axllent.org/)** (started by `db:up`) — open the one-time
code at **http://localhost:8026**.

### Email

Delivery is chosen at runtime, in this order:

1. **Resend** (production) — set `RESEND_API_KEY` and a verified sender in
   `EMAIL_FROM` (e.g. `Duet <login@yourdomain.com>`).
2. **SMTP** (development) — Mailpit on `localhost:1026`, viewer at :8026.
3. **Console** — last-resort fallback if neither is configured.

Only the email one-time-code sign-in depends on this; passkeys and GitHub don't.

### Image storage

Task image attachments go to **Cloudflare R2** when `R2_*` is configured, and to
local disk (`./.uploads`) otherwise — so dev works with no cloud setup. Images
are **never public**: every access goes through `/api/projects/:id/attachments/:id/raw`,
which checks project membership and then redirects to a short-lived R2 signed URL
(or streams the local file). Create an R2 bucket + an API token with Object
Read & Write, then set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
and `R2_BUCKET`.

### GitHub sign-in (optional)

Create an OAuth app at <https://github.com/settings/developers> with callback
`http://localhost:5180/api/auth/callback/github`, then set `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` in `.env`.

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Dev server on :5180 |
| `bun run build` / `bun run preview` | Production build (adapter-node) / preview |
| `bun run check` | Type-check (svelte-check) |
| `bun run db:up` / `db:down` | Start / stop MariaDB (Docker Compose) |
| `bun run db:generate` | Generate a migration from schema changes |
| `bun run db:migrate` / `db:push` | Apply migrations / push schema |
| `bun run db:studio` | Drizzle Studio |
| `bun run auth:generate` | Regenerate Better Auth tables into `auth.schema.ts` |

## Architecture

```
src/
├─ lib/
│  ├─ auth.ts                 Better Auth server (GitHub + email-OTP + passkey)
│  ├─ auth-client.ts          Better Auth browser client
│  ├─ markdown.ts             marked + highlight.js, DOMPurify-sanitised
│  ├─ parseChecklist.ts       Paste-import parser
│  ├─ types.ts                Client-facing types + enums
│  ├─ stores/todos.svelte.ts  Optimistic todo controller + SSE reconciliation
│  ├─ components/             UI kit, todo views, dialogs
│  └─ server/
│     ├─ db/                  Drizzle client + schema (auth + app tables)
│     ├─ projects.ts          Project & membership data access
│     ├─ todos.ts             Todo / tag / category data access
│     ├─ realtime.ts          In-process pub/sub for SSE
│     ├─ guard.ts             Per-request membership authorization
│     └─ email.ts             OTP delivery (console in dev)
└─ routes/
   ├─ (marketing)            /  landing, /signin
   ├─ app/                    Authenticated shell, projects, settings
   └─ api/projects/[id]/…     JSON API for todos/tags/categories/members + SSE
```

### Notes

- **SvelteKit 3** drops `$lib` (use the `#lib` package-imports alias), moves the
  `Handle` type to `@sveltejs/kit/hooks`, replaces `$app/environment` with
  `$app/env` and `$app/stores` with `$app/state`, and keeps all config inline in
  `vite.config.ts` (no `svelte.config.js`).
- Task images can be embedded via markdown image URLs in a task's notes. Native
  file uploads are scaffolded (an `attachments` table exists) but not yet wired
  to a storage backend.
