# JobPilot — Resource & Dev Arsenal

## Run Requirements

| What | Needed? | Why |
|---|---|---|
| Node.js ≥20 | **Yes** | Core runtime (Next.js 15 requires it) |
| `npm install` | **Yes** | All JS deps |
| Supabase project (hosted) | **Yes** | Auth, Postgres, Storage — remote via `npx supabase db push` |
| Supabase CLI | **Yes** | Migrations (`db push`) and seed queries |
| .env.local file | **Required** | Supabase creds, LLM API keys, cron secret (see below) |
| OpenAI-compatible LLM API | **Required** | Resume parsing, scoring, tailoring (DeepSeek, OpenAI, etc.) |
| Docker | **No** | Not used — Supabase is remote, not local |
| PostgreSQL (local) | **No** | Uses hosted Supabase Postgres |
| Redis / Kafka / queue | **No** | Not used |

## Dependencies

### Production (`npm install`)

```
next              — React framework (App Router, Server Components, Server Actions)
@supabase/ssr     — Supabase server/client auth for Next.js App Router
@supabase/supabase-js — Supabase JS client (database, storage, auth)
react / react-dom — UI rendering (v19)
openai            — OpenAI-compatible LLM client (resume parsing, scoring, tailoring)
zod               — Schema validation for LLM structured output
pdf-parse         — PDF resume text extraction
mammoth           — DOCX resume text extraction
server-only       — Enforce server-only module boundaries
clsx              — Conditional className utility (shadcn/ui)
tailwind-merge    — Tailwind class merging (shadcn/ui)
lucide-react      — Icon library (shadcn/ui)
```

### Dev (`npm install --dev`)

```
typescript        — Type checking (strict mode)
@types/node       — Node.js type definitions
@types/react      — React type definitions
@vitejs/plugin-react — Vite React plugin (for Vitest)
vitest            — Unit test runner
jsdom             — DOM environment for Vitest
eslint / eslint-config-next — Linting
tailwindcss       — Utility CSS framework (v3)
tailwindcss-animate — Animation plugin for shadcn/ui
postcss / autoprefixer — CSS processing
playwright        — Browser automation (screenshot pipeline)
shadcn            — shadcn/ui CLI for component scaffolding
```

## Database & Storage

| What | Where | Type |
|---|---|---|
| User data | Supabase Postgres (remote) | Managed via `npx supabase db push` — tables: `jp_users`, `jp_profiles`, `jp_resumes`, `jp_companies`, `jp_postings`, `jp_scores`, `jp_applications`, `jp_interview_sessions`, `jp_usage_counters` |
| File uploads | Supabase Storage bucket `jp_resumes` | Private, per-user folders |
| Auth sessions | Supabase Auth | Magic-link only, PKCE flow, 1h token expiry |

## Environment Quick Ref

```bash
cp .env.example .env.local
```

| Key | Needed For |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin operations (cron, account delete) |
| `OPENAI_COMPATIBLE_BASE_URL` | LLM provider endpoint (e.g. DeepSeek) |
| `OPENAI_COMPATIBLE_API_KEY` | LLM provider API key |
| `OPENAI_COMPATIBLE_MODEL` | LLM model name (e.g. `deepseek-chat`) |
| `CRON_SECRET` | Bearer token for cron route auth |
| `BILLING_MODE` | `mock` (default) or `live` — controls Stripe integration |
| `EMAIL_MODE` | `mock` (default) or `live` — controls Resend email |
| `STRIPE_SECRET_KEY` | Only needed when `BILLING_MODE=live` |
| `STRIPE_WEBHOOK_SECRET` | Only needed when `BILLING_MODE=live` |
| `RESEND_API_KEY` | Only needed when `EMAIL_MODE=live` |
| `EMAIL_FROM` | Sender address for digests |

## Runtime Setup

```bash
npm install
cp .env.example .env.local   # then fill in values
npx supabase db push          # apply migrations to linked project
npx supabase db query --linked --file supabase/seed_companies.sql  # seed ATS companies
npm run dev                   # → http://localhost:3000
```

## CLI Commands

```bash
npm run dev        # Next.js with Turbopack (port 3000)
npm test           # Vitest — all files in tests/unit/
npm run build      # production build
npm run lint       # ESLint

# Migrations
npx supabase db push
npx supabase db query --linked --file supabase/seed_companies.sql

# Screenshot automation (requires dev server on port 3000)
node --env-file=.env.local scripts/screenshot-with-auth.mjs
```

## OpenCode Dev Arsenal

### CodeGraph

Pre-computed symbol graph is already indexed (`.codegraph/` directory exists). Returns verbatim source + callers + call paths in one call instead of grep-read loops.

### Skills — Most Relevant

| Skill | When to Use |
|---|---|
| `brainstorming` | Before adding features — clarifies intent, scope, design |
| `writing-plans` | Before multi-step implementation — work breakdown |
| `dispatching-parallel-agents` | 2+ independent changes that can run concurrently |
| `systematic-debugging` | Broken build or wrong output |
| `verification-before-completion` | Before claiming work is done |
| `/review-work` | Post-implementation QA |
| `/frontend` | UI/UX work, styling, layout, React components |
| `/visual-qa` | Visual review after UI changes |
| `/vercel:nextjs` | Next.js App Router guidance — routing, Server Components, caching |
| `/programming` | TypeScript/TSX discipline (strict types, no `any`) |
| `docs-naming-convention` | Creating/editing files in `docs/` |

### MCP Servers

| Server | Purpose | Status |
|---|---|---|
| **CodeGraph** | Symbol-level code intelligence | ✅ Indexed, needs MCP config |
| **Supabase** | Database queries, migrations, project mgmt, docs | ✅ Configured — enable manually (disabled by default) |
| **Context7** | Current docs for libraries and frameworks | ✅ Global config |

### Plugins

| Plugin | Purpose |
|---|---|
| `/programming` | Language discipline (strict TypeScript, Zod, no `any`) |
| `/ast-grep` | Structural code search + rewrite |

### Recommended Workflows

**Adding a feature:**
1. `skill("brainstorming")` — clarify intent and design
2. `skill("writing-plans")` — ordered work breakdown
3. Delegate parallel tasks to `deep` / `unspecified-high` subagents
4. `skill("/review-work")` — QA

**Debugging a broken build:**
1. `skill("systematic-debugging")` — hypotheses in parallel
2. If 2 rounds fail → `oracle` with full context

**Refactoring:**
1. `skill("/programming")` — language discipline
2. Check `codegraph` for blast radius before touching a symbol
3. `skill("test-driven-development")` — test-first

**Quick edits** (typo, config, single change):
- Direct edit + `skill("verification-before-completion")`

### Supabase MCP — Manual Activation

The Supabase MCP server is **disabled by default** (both in OpenCode and VS Code).

**To activate:**

- **OpenCode:** Open the MCP server management UI → find `supabase` → enable it. OAuth browser flow authenticates with your Supabase account.
- **VS Code:** Open the MCP configuration panel → activate the `supabase` server. OAuth flow opens automatically.

The server is scoped to project `yggdfseoswfblvjewaov`. Tools available: `execute_sql`, `list_tables`, `list_migrations`, `get_project`, `search_docs`, and more.

**Security:** Read-only mode is recommended for production projects. Add `&read_only=true` to the URL in `opencode.jsonc`/`.vscode/mcp.json` if you want read-only access.

### Config Files

| File | Purpose |
|---|---|
| `opencode.jsonc` | OpenCode project config — CodeGraph + Supabase MCP |
| `.vscode/mcp.json` | VS Code MCP server definitions (Supabase) |
| `AGENTS.md` | Project context for AI agents (comprehensive) |
| `.codegraph/` | Auto-generated symbol index (do not edit) |
