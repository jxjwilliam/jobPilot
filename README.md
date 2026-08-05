# JobPilot

JobPilot is an AI career-operations pipeline: upload a resume, get fields auto-filled by LLM, browse and score jobs from 6 ATS platforms, tailor applications with human review, practice mock interviews, track everything on a Kanban board, and receive a weekly digest. Stripe and email run in **mock** mode by default.

## What's implemented

- Magic-link auth (Supabase)
- Resume upload → **AI autofill** (summary, skills, experience, education, suggested preferences) + re-extract
- ATS ingestion: Greenhouse, Lever, Ashby, Workable, Recruitee, Personio (`/api/cron/poll-ats`)
- **Streaming scoring** with real-time progress bar (`/api/score/run` — SSE)
- **Auto-scoring** — triggers automatically when you enter Matches with unscored jobs
- **Browse page** — search all active job postings, filter by keyword/location/remote (`/browse`)
- **Mock interview** — AI generates role-specific questions, evaluates answers with STAR scoring, produces report (`/interview/[id]`)
- **Stale application detection** — flags applications idle for 21+ days, drafts AI follow-up emails
- **Self-refreshing pipeline** — jobs refresh automatically (lazy TTL on page visits) + a manual "Refresh now" button on Browse; no external cron required
- **Stale job expiry** — postings unseen on their ATS board for 30 days are auto-deactivated and drop out of Browse/Matches
- **Applied-job tracking** — applied jobs hide from Matches by default, with a "Show applied" toggle and Applied badge
- **Resume-change re-scoring** — matches re-score automatically when you update your resume, plus a manual "Re-score matches" button
- **Streamed tailoring** — resume + cover letter generated as two LLM steps with live SSE progress; regenerate is free
- Tailoring + regenerate + review UI; Kanban tracker with stale badges
- Pipeline stats bar (total jobs, scored count, applications, last poll time)
- Quota / mock Stripe portal; weekly digest (mock email)
- Brand: SVG favicon + logo in nav / login / home
- **shadcn/ui** component library (Button, Card, Badge, Progress, Skeleton, Dialog, Tabs, DropdownMenu)

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

Open [http://localhost:5200](http://localhost:5200). Sign in with a magic link.

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

Data model: `jp_users`, `jp_profiles`, `jp_resumes`, `jp_companies`, `jp_postings`, `jp_scores`, `jp_applications`, `jp_interview_sessions`, `jp_usage_counters`, `jp_pipeline_state` (refresh lock/TTL). RLS on all.

## Scripts

```bash
npm run dev    # Next.js (Turbopack)
npm test       # Vitest (59 tests across 11 files)
npm run build  # production build
```

## Account deletion

**Profile → Danger zone** → `DELETE /api/account/delete` removes Storage objects from the `jp_resumes` bucket under `{user_id}/` and deletes the auth user (FK cascade).
