# JobPilot — Agent Instructions

Next.js 15 App Router · Supabase (auth + Postgres + Storage) · Tailwind CSS v3 · shadcn/ui · Vitest · OpenAI-compatible LLM

---

## Commands

```bash
npm run dev        # Next.js with Turbopack (port 3000)
npm test           # Vitest — 39 tests across 9 files
npm run build      # production build

# Migrations (linked remote project)
npx supabase db push
npx supabase db query --linked --file supabase/seed_companies.sql

# Screenshot automation (requires running dev server)
node --env-file=.env.local scripts/screenshot-with-auth.mjs
```

## Environment

Copy `.env.example` → `.env.local`. All required:

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same |
| `SUPABASE_SERVICE_ROLE_KEY` | same (server-only) |
| `OPENAI_COMPATIBLE_BASE_URL` | e.g. `https://api.deepseek.com` |
| `OPENAI_COMPATIBLE_API_KEY` | provider key |
| `OPENAI_COMPATIBLE_MODEL` | default: `deepseek-chat` |
| `CRON_SECRET` | random string for cron route auth |
| `BILLING_MODE` | `mock` (default) or `live` |
| `EMAIL_MODE` | `mock` (default) or `live` |

Vercel deploy needs Vercel project linked; `.vercel/` is gitignored.

## Auth

**Magic-link only.** No password login. The login page calls `supabase.auth.signInWithOtp()` — rate-limited to 2 emails/hour per address by Supabase free tier.

**Crucial:** `createServerClient` (server + middleware) forces `flowType: "pkce"`. The browser client (`createBrowserClient`) is **not** initialized in the root layout — only in the login page. This means hash-based auth tokens (`/#access_token=...`) are never processed client-side.

### Playwright screenshot auth (the working approach)

Do NOT navigate to the Supabase magic link URL. Instead, inject the session cookie directly:

1. Call `supabase.auth.admin.generateLink({ type: "magiclink", email })` → get `email_otp`
2. POST `{email, token: email_otp, type: "magiclink"}` to `{SUPABASE_URL}/auth/v1/verify` → get `access_token`, `refresh_token`, `user`
3. Set cookie `sb-{project_ref}-auth-token` = `JSON.stringify({access_token, refresh_token, expires_in, expires_at, token_type, user})`
4. The `@supabase/ssr` server client reads raw JSON cookies (no base64 encoding needed)

See `scripts/screenshot-with-auth.mjs` for the full implementation.

### Protected routes

Middleware guards: `/matches`, `/browse`, `/onboarding`, `/applications`, `/applications/*`, `/interview`, `/interview/*`, `/profile`, `/usage`. Unauthenticated requests redirect to `/login?next={path}`.

Root `/` checks session server-side: logged-in users redirect to `/onboarding` (no resume) or `/matches`.

## Routes

```
src/app/
  page.tsx              # Landing page (redirects authed users)
  (auth)/login/page.tsx # Magic link form
  (app)/                # Authenticated layout (+ AppNav)
    matches/page.tsx     # Scored jobs + streaming auto-score + tailor + interview buttons
    browse/page.tsx      # All active postings: search, filter, paginate
    applications/page.tsx  # Kanban board with stale badges
    applications/[id]/page.tsx  # Resume diff, cover letter, follow-up draft
    interview/[id]/page.tsx     # Mock interview: generate → answer → evaluate → report
    profile/page.tsx
    onboarding/page.tsx
    usage/page.tsx
  api/
    cron/poll-ats       # Ingest 6 ATS sources (Greenhouse, Lever, Ashby, Workable, Recruitee, Personio)
    cron/score          # Batch score all
    cron/digest         # Weekly email
    score/run           # Score current user (session auth, SSE streaming supported)
    postings/           # Scored matches list
    postings/browse     # Browse all active postings (not just scored)
    stats               # Pipeline health (postings count, scores, last poll)
    profile/            # GET/PATCH profile, resume upload/reparse
    applications/       # List, tailor, regenerate
    applications/[id]/follow-up  # AI follow-up email draft
    interview/generate  # Generate interview questions from JD
    interview/evaluate  # Evaluate answer with STAR scoring
    billing/portal      # Stripe/mock portal
    account/delete      # Delete account + storage
    usage/              # Quota counters
    webhooks/stripe     # Stripe events
```

## Testing

- **Framework:** Vitest, Node environment
- **Location:** `tests/unit/*.test.ts`
- **Mock:** `tests/mocks/server-only.ts` stubs `server-only` package (needed because Vitest runs outside Next.js)

```bash
npm test                     # all tests (39 across 9 files)
npx vitest run tests/unit/ingestion-normalize.test.ts   # single file
```

`vitest.config.ts` aliases `@/` → `src/` and `server-only` → the mock file.

9 test files covering: LLM schema parsing, resume parsing, scoring prompt, ingestion normalization (6 ATS sources), quota, digest, status machine, ranking, tailor guardrails.

## Architecture

### lib modules

```
src/lib/
  supabase/    client.ts (browser), server.ts (SSR), admin.ts (service_role)
  llm/         OpenAI-compatible client via OPENAI_COMPATIBLE_* env vars
  stream/      sse.ts — lightweight SSE helper using Web Streams API
  ingestion/   greenhouse.ts, lever.ts, ashby.ts, workable.ts, recruitee.ts, personio.ts, poll.ts orchestrator
  scoring/     score.ts — LLM scores profile vs posting
  tailoring/   tailor.ts — LLM generates tailored resume + cover letter
  profile/     upload resume → LLM parses → store in profiles.resume_parsed (jsonb)
  applications/ status.ts — status machine (discovered → reviewing → applied → ...)
  billing/     quota.ts (usage counters), stripe.ts (mock adapter)
  notifications/ digest.ts, email.ts (mock adapter)
```

### UI components

```
src/components/
  AppNav.tsx          # Navigation header with Matches, Browse, Applications, Profile, Usage
  EmptyState.tsx      # Reusable card-based empty state (icon + title + description + actions)
  PipelineStats.tsx   # Live pipeline health bar (postings, scores, applications, last poll)
  brand/              # JobPilotLogo.tsx
  profile/            # PreferencesEditor, ResumeFieldsEditor, CsvListInput, api.ts
  ui/                 # shadcn/ui components (Button, Card, Badge, Progress, Skeleton, Tabs, Dialog, DropdownMenu)
```

### Data model (tables)

`users`, `profiles`, `resumes` (multi-resume support), `companies`, `postings`, `scores`, `applications`, `interview_sessions`, `usage_counters`. RLS on all. Auto-create user+profile+usage on signup via `handle_new_user()` trigger. Storage bucket `resumes` (private, per-user folders).

### LLM integration

Uses `openai` SDK pointed at any OpenAI-compatible API (`OPENAI_COMPATIBLE_BASE_URL`). Zod schemas for structured output parsing (`src/lib/llm/schemas.ts`).

### Streaming (SSE)

`src/lib/stream/sse.ts` provides `createSseStream()` — a lightweight SSE helper using Web Streams API (zero dependencies). Used by `/api/score/run` for real-time scoring progress.

### Mock modes

- `BILLING_MODE=mock` — `/api/billing/portal` returns local mock URL, no Stripe
- `EMAIL_MODE=mock` — digest logs to server console

## Supabase quirks

- **Rate limit:** `auth.rate_limit.email_sent = 2` per hour (in `supabase/config.toml`). This is why the admin API bypass is needed for automation.
- **Token expiry:** 3600s (1 hour) — `jwt_expiry` in config, matches `expires_in` from verify response
- **OTP length:** 6 digits (`otp_length = 6`)
- **Site URL:** `http://127.0.0.1:3000` in local config — if dev runs on localhost vs 127.0.0.1, redirects may fail
- **RLS:** `companies` and `postings` are `select`-only for authenticated users; writes go through the admin client (service_role key)

## Config files

| File | Note |
|---|---|
| `next.config.ts` | `serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth"]` |
| `tsconfig.json` | `@/` → `./src/*`, strict mode |
| `tailwind.config.ts` | shadcn/ui theme (colors, border-radius, dark mode) + tailwindcss-animate plugin |
| `vitest.config.ts` | custom alias for `@/` and `server-only` mock |
| `eslint.config.mjs` | Next.js + TypeScript defaults |
| `components.json` | shadcn/ui config (Tailwind v3, src/components/ui, lucide icons) |
| `.gitignore` | `.env*`, `.next/`, `.vercel/`, `coverage/`, `supabase/.temp/` |

## Screenshot automation

Script at `scripts/screenshot-with-auth.mjs`. Pipeline:
1. Admin API → email OTP (no email sent)
2. REST `/auth/v1/verify` → session tokens
3. Inject `sb-{project_ref}-auth-token` cookie into Playwright
4. Verify login on `/matches` — if redirected to `/login`, abort
5. Screenshot 7 routes: `/`, `/login`, `/matches`, `/applications`, `/profile`, `/onboarding`, `/usage`
6. Inject markdown table into `README.md` + `README-zh.md` between `<!-- screenshots -->` markers

Re-run: `node --env-file=.env.local scripts/screenshot-with-auth.mjs`

Requires: `PLAYWRIGHT` devDependency installed, `npx playwright install chromium` run once, dev server on port 3000.
