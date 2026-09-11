# JobPilot

JobPilot is an AI career-operations pipeline: upload a resume, get fields auto-filled by LLM, browse and score jobs from 6 ATS platforms, tailor applications with human review, practice mock interviews, track everything on a Kanban board, and receive a weekly digest. Stripe and email run in **mock** mode by default.

## What's implemented

- Fixed-credential password login (single-tenant) over Supabase sessions
- Resume upload → **AI autofill** (summary, skills, experience, education, suggested preferences) + re-extract
- ATS ingestion: Greenhouse, Lever, Ashby, Workable, Recruitee, Personio (`/api/cron/poll-ats`)
- **Strict keyword filter** — a posting is only stored if its *title* names an AI/full-stack specialism and a seniority signal, and its location is Canada-eligible or location-agnostic (`src/lib/ingestion/filter.ts`). Target: 50–100 live postings, not thousands.
- **Canada-first company list** — 67 watched boards, every slug verified live against its public ATS API; boards with zero Canada/remote roles are deactivated (`supabase/seed/jp_companies_canada.sql`)
- **`is_relevant` / `matched_keywords`** on every posting, so the dashboard counts and source filters are plain SQL (`scripts/backfill_relevance.mjs` backfills existing rows)
- **Streaming scoring** with real-time progress bar (`/api/score/run` — SSE)
- **Auto-scoring** — triggers automatically when you enter Matches with unscored jobs
- **Browse page** — search relevant postings, filter by keyword/location/remote **and by source board** (Greenhouse / Lever / Ashby / …, defaults to Greenhouse) (`/browse`)
- **Mock interview** — AI generates role-specific questions, evaluates answers with STAR scoring, produces report (`/interview/[id]`)
- **Stale application detection** — flags applications idle for 21+ days, drafts AI follow-up emails
- **Self-refreshing pipeline** — jobs refresh automatically (lazy TTL on page visits) + a manual "Refresh now" button on Browse; no external cron required
- **Stale job expiry** — postings unseen on their ATS board for 30 days are auto-deactivated and drop out of Browse/Matches
- **Applied-job tracking** — applied jobs hide from Matches by default, with a "Show applied" toggle and Applied badge
- **Resume-change re-scoring** — matches re-score automatically when you update your resume, plus a manual "Re-score matches" button
- **Streamed tailoring** — resume + cover letter generated as two LLM steps with live SSE progress; regenerate is free
- Tailoring + regenerate + review UI; Kanban tracker with stale badges
- Pipeline stats bar — "Jobs matching your keywords" (relevant + active only, not raw scraped volume), scored count, applications, last poll time, plus a **By source** breakdown
- **Kanban + Matches default to Greenhouse**; switch the Source dropdown to `All sources` for the rest
- Quota / mock Stripe portal; weekly digest (mock email)
- Brand: SVG favicon + logo in nav / login / home
- **shadcn/ui** component library (Button, Card, Badge, Progress, Skeleton, Dialog, Tabs, DropdownMenu)

### Demo login ("Try the demo")

- Opt-in via `NEXT_PUBLIC_DEMO_MODE=true` (do not enable on public production deployments).
- `POST /api/demo/login` ensures the demo user exists (tolerating "already been registered" —
  fixed 2026-08: the tolerance regex previously didn't match Supabase's exact message), then
  mints a magic-link OTP with the admin API (no email sent) and exchanges it for a session.
- The client stores the returned session via `supabase.auth.setSession`, i.e. **sessionStorage
  PKCE** — the same origin-scoped store the password login uses, so demo sign-in works inside
  the dashboard iframe (no cookies involved).

### Login (single-tenant)

`/login` is a plain email + password form. The server checks the pair against
`APP_LOGIN_EMAIL` / `APP_LOGIN_PASSWORD` and then mints a Supabase session for
that one account, so there is no self-serve signup and no email rate limit.
Set both variables in `.env.local` (and in your host's env) to keep the password
out of the repo; the code falls back to the original hardcoded pair when unset.
New accounts outside the allowlist are also rejected at the database level by
`jp_restrict_signups` (`npx supabase db push`).

Sessions live in `sessionStorage`, so they are **per browser tab**: reloads and in-app
navigation keep you signed in, but closing the tab (or opening the app in a new one) lands on
`/login` and the credentials have to be typed again. There is no session cookie, which is what
keeps login working inside cross-origin iframes.

## Docs map

| Doc | Purpose |
|---|---|
| [`docs/03-jobpilot-workflow.md`](docs/03-jobpilot-workflow.md) | **Start here** — runtime workflows + sequence diagrams |
| [`docs/06-jobpilot-improvement-plan.md`](docs/06-jobpilot-improvement-plan.md) | **Improvement plan** — architecture decisions + Phase 1/2 changes |
| [`docs/01-jobpilot-product-spec.md`](docs/01-jobpilot-product-spec.md) | Original product/technical spec |
| [`docs/02-jobpilot-mvp-plan.md`](docs/02-jobpilot-mvp-plan.md) | Original MVP sequencing / MoSCoW |
| [`docs/superpowers/specs/2026-07-11-jobpilot-design.md`](docs/superpowers/specs/2026-07-11-jobpilot-design.md) | Brainstorming design decisions |
| [`docs/superpowers/plans/2026-07-11-jobpilot-mvp.md`](docs/superpowers/plans/2026-07-11-jobpilot-mvp.md) | Implementation task plan |
| [`docs/cascading-github-pipeline-playbook.md`](docs/cascading-github-pipeline-playbook.md) | Research notes that led to JobPilot |

## Setup

**Requirements:** Node.js 20+ (recommended).

1. Copy env template and fill values:

```bash
cp .env.example .env.local
```

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same (legacy anon JWT works with current clients) |
| `SUPABASE_SERVICE_ROLE_KEY` | same (server-only; never expose to the browser) |
| `OPENAI_COMPATIBLE_BASE_URL` | e.g. `https://api.deepseek.com` |
| `OPENAI_COMPATIBLE_API_KEY` | provider API key |
| `OPENAI_COMPATIBLE_MODEL` | prefer a chat model that returns `content` (e.g. `deepseek-chat`) |
| `CRON_SECRET` | long random string; required for cron routes |
| `BILLING_MODE` | `mock` (default) or `live` |
| `EMAIL_MODE` | `mock` (default) or `live` |
| `STRIPE_*` / `RESEND_*` | only when the matching mode is `live` |
| `APP_LOGIN_EMAIL` / `APP_LOGIN_PASSWORD` | single-tenant credentials checked by `POST /api/auth/password-login` |
| `NEXT_PUBLIC_DEMO_MODE` / `DEMO_EMAIL` | optional "Try the demo" button (off by default) |

2. Install and apply schema:

```bash
npm install
npx supabase db push
```

3. Seed ATS companies (recommended):

```bash
npx supabase db query --linked --file supabase/seed_companies.sql
```

> Tip: to wipe and recreate everything from scratch (all data, schema, and seed in one
> shot), run `npx supabase db reset --linked`. The seed file is wired into
> `supabase/config.toml` (`[db.seed].sql_paths`), so it re-seeds automatically.

4. Run the app:

```bash
npm run dev
```

Open [http://localhost:5200](http://localhost:5200) and sign in with the
`APP_LOGIN_EMAIL` / `APP_LOGIN_PASSWORD` pair from `.env.local`.

## First-run pipeline

```bash
# Jobs refresh AUTOMATICALLY: any visit to /browse or /matches kicks off a
# poll+sweep+score in the background when it's been >6h since the last poll
# (uses next/server after(); no external cron needed). The steps below are
# optional manual triggers.
export CRON_SECRET="$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)"
export BASE=http://localhost:5200

# 1) (Optional) Ingest jobs now, or hit "Refresh now" on /browse:
curl -sS -X POST "$BASE/api/pipeline/run" -H "Content-Type: application/json" -d "{}"
#    (authenticated user) — or via cron: POST /api/cron/poll-ats with Bearer CRON_SECRET

# 2) Complete onboarding (upload resume → review autofill)

# 3) Open /matches — scoring auto-triggers with progress bar!
```

## API map

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/cron/poll-ats` | Cron secret | Ingest 6 ATS sources |
| POST | `/api/cron/score` | Cron secret | Batch-score all profiles |
| POST | `/api/cron/digest` | Cron secret | Weekly digests (mock or Resend) |
| POST | `/api/score/run` | User (session) | Score current user with SSE streaming (`force: true` re-scores) |
| GET | `/api/postings` | User (session) | Matches list (scored only; hides applied unless `include_applied=1`) |
| GET | `/api/postings/browse` | Public | Browse all active postings (also triggers lazy refresh) |
| GET | `/api/stats` | User (session) | Pipeline health (counts, timestamps; also triggers lazy refresh) |
| GET | `/api/pipeline/status` | User (session) | Pipeline freshness (`last_poll_at`, `stale`, `running`) |
| POST | `/api/pipeline/run` | User (session) | Manual "Refresh now" — poll + stale-sweep + score in background |
| POST | `/api/profile/resume` | User | Upload + LLM autofill |
| POST | `/api/profile/resume/reparse` | User | Re-extract from stored file |
| POST | `/api/applications` | User | Create application shell |
| POST | `/api/applications/:id/tailor` | User | Generate drafts (quota; SSE streamed — resume → cover letter) |
| POST | `/api/applications/:id/regenerate` | User | Free regenerate with instruction (SSE streamed) |
| POST | `/api/applications/:id/follow-up` | User | Generate follow-up email draft |
| PATCH | `/api/applications/:id` | User | Status / notes / cover letter |
| POST | `/api/interview/generate` | User | Generate interview questions from JD |
| POST | `/api/interview/evaluate` | User | Evaluate answer + STAR feedback |
| POST | `/api/billing/portal` | User | Stripe/mock portal |
| DELETE | `/api/account/delete` | User | Delete account + storage |

## Page routes

| Page | Path | Description |
|---|---|---|
| Matches | `/matches` | Scored jobs with streaming Auto-score, Re-score, Tailor, Mock Interview; "Show applied" toggle |
| Browse | `/browse` | Search all active postings across 6 ATS platforms; "Refresh now" + last-updated stamp |
| Applications | `/applications` | Kanban tracker with stale detection badges |
| Application Detail | `/applications/[id]` | Resume diff, cover letter edit, follow-up draft |
| Interview | `/interview/[id]` | Mock interview with AI question generation + evaluation |
| Profile | `/profile` | Edit profile, preferences, upload resume |
| Onboarding | `/onboarding` | First-run resume upload + autofill |
| Usage | `/usage` | Quota counter |

## Architecture

Core libraries: `src/lib/{ingestion,scoring,tailoring,applications,billing,notifications,llm,profile,stream,pipeline,matches}`.

Components: `src/components/{AppNav,EmptyState,PipelineStats,brand,profile,ui}`.

UI system: **shadcn/ui** (Button, Card, Badge, Progress, Skeleton, Tabs, Dialog, DropdownMenu) with Tailwind CSS v3.

Data model: `jp_users`, `jp_profiles`, `jp_companies`, `jp_postings`, `jp_scores`, `jp_applications`, `jp_interview_sessions`, `jp_usage_counters`, `jp_pipeline_state` (refresh lock/TTL). RLS on all.

## Scripts

```bash
npm run dev    # Next.js (Turbopack)
npm test       # Vitest (59 tests across 11 files)
npm run build  # production build
```

## Account deletion

**Profile → Danger zone** → `DELETE /api/account/delete` removes Storage objects from the `jp_resumes` bucket under `{user_id}/` and deletes the auth user (FK cascade).

<!-- screenshots -->
## Screenshots

| Home | Login | Matches |
| --- | --- | --- |
| ![Home](screenshots/home.png) | ![Login](screenshots/login.png) | ![Matches](screenshots/matches.png) |

| Applications | Profile | Onboarding |
| --- | --- | --- |
| ![Applications](screenshots/applications.png) | ![Profile](screenshots/profile.png) | ![Onboarding](screenshots/onboarding.png) |

| Usage |
| --- |
| ![Usage](screenshots/usage.png) |

<!-- /screenshots -->
