# JobPilot — Current Implementation Workflow

**Last updated:** 2026-08-05  
**Companion:** `docs/superpowers/specs/2026-07-11-jobpilot-design.md`  
**Also see:** root `README.md` (setup), `docs/01-jobpilot-product-spec.md` (original spec)

This document describes what the running app does today: user flows, background jobs, and sequence diagrams. It is the source of truth for *implemented* behavior when product specs still mention deferred items (e.g. interview prep).

---

## 1. High-level architecture

```mermaid
flowchart LR
  subgraph Client
    UI[Next.js App Router UI\nshadcn/ui components]
  end

  subgraph Server["Next.js Route Handlers"]
    Auth[Auth + Profile APIs]
    ScoreAPI[Score / Browse APIs]
    AppAPI[Applications / Follow-up APIs]
    InterviewAPI[Interview APIs]
    Pipeline[Pipeline: refresh / status]
    Cron[Cron: poll / score / digest]
  end

  subgraph Data
    SB[(Supabase Auth + Postgres + Storage)]
    LLM[OpenAI-compatible LLM]
    ATS[6 ATS sources\nGreenhouse/Lever/Ashby/Workable/Recruitee/Personio]
  end

  UI --> Auth
  UI --> ScoreAPI
  UI --> AppAPI
  UI --> InterviewAPI
  UI --> Pipeline
  Auth --> SB
  Auth --> LLM
  ScoreAPI --> SB
  ScoreAPI --> LLM
  AppAPI --> SB
  AppAPI --> LLM
  InterviewAPI --> SB
  InterviewAPI --> LLM
  Pipeline --> SB
  Pipeline --> ATS
  Pipeline --> LLM
  Cron --> ATS
  Cron --> SB
  Cron --> LLM
```

**Modules (under `src/lib/`):**

| Module | Role |
|---|---|
| `ingestion/` | Poll 6 ATS sources → upsert `jp_postings` |
| `scoring/` | LLM fit score → `jp_scores`, with SSE streaming |
| `tailoring/` | Split + SSE-streamed resume/cover letter drafts → `jp_applications` |
| `applications/` | Status state machine + stale detection |
| `billing/` | Quota + mock Stripe |
| `notifications/` | Weekly digest + mock email |
| `profile/` | Resume parse / preference extract |
| `stream/` | SSE streaming helper (Web Streams API) |
| `pipeline/` | Auto-refresh pipeline: poll → stale-sweep → score → rescore (lock + TTL) |
| `matches/` | Applied-job filtering helper for the matches feed |

---

## 2. End-to-end product workflow

```mermaid
flowchart TD
  A[Magic-link login] --> B[Upload resume]
  B --> C[LLM extracts profile + suggested preferences]
  C --> D[User reviews autofilled fields]
  D --> E[Save preferences]
  E --> F[Pipeline auto-refresh: poll + stale-sweep + score]
  F --> G[Matches list: score ≥ threshold]
  G --> H[Tailor → application shell]
  H --> I[Generate tailored resume + cover letter]
  I --> J[Review / regenerate / Mark Applied]
  J --> K[Kanban tracker status updates]
  K --> L[Weekly digest cron]
  F -. resume changed .-> R[Auto re-score top matches]
  R --> G
```

---

## 3. Sequence diagrams

### 3.1 Auth (magic link)

```mermaid
sequenceDiagram
  actor U as User
  participant FE as /login
  participant SB as Supabase Auth
  participant CB as /auth/callback

  U->>FE: Enter email
  FE->>SB: signInWithOtp(email)
  SB-->>U: Magic link email
  U->>CB: Open link (?code=…)
  CB->>SB: exchangeCodeForSession
  CB->>SB: Load profile
  alt resume incomplete
    CB-->>U: Redirect /onboarding
  else resume present
    CB-->>U: Redirect /matches
  end
```

### 3.2 Resume upload → autofill form

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Onboarding/Profile
  participant API as POST /api/profile/resume
  participant Store as Supabase Storage
  participant DB as profiles
  participant LLM as OpenAI-compatible LLM

  U->>FE: Choose PDF/DOCX
  FE->>API: multipart file
  API->>Store: upload resumes/{userId}/file
  API->>LLM: Extract JSON (resume + preferences)
  LLM-->>API: structured fields
  API->>DB: update resume_parsed + preferences
  API-->>FE: autofilled payload
  FE-->>U: Fields populated (review only)
```

Re-extract without re-upload: `POST /api/profile/resume/reparse` downloads the stored file and runs the same LLM path.

### 3.3 Job discovery (ingestion)

```mermaid
sequenceDiagram
  participant Trig as Cron / pipeline / manual
  participant Ing as ingestion/poll
  participant GH as Greenhouse API
  participant LV as Lever API
  participant DB as companies + postings

  Note over Trig: Triggered by cron (CRON_SECRET), the auto-refresh pipeline, or POST /api/pipeline/run
  Trig->>Ing: pollCompanies(admin)
  Ing->>DB: load active companies
  loop each company batch
    alt greenhouse
      Ing->>GH: GET /v1/boards/{slug}/jobs
      GH-->>Ing: jobs JSON
    else lever
      Ing->>LV: GET /v0/postings/{slug}
      LV-->>Ing: postings JSON
    end
    Ing->>DB: upsert postings (ats_source, external_id)
  end
  Ing-->>Trig: { polled, upserted, errors }
```

**Stale-job sweep:** the pipeline then runs `deactivateStalePostings()` — any posting whose
`last_seen_at` is older than **30 days** is set `is_active = false` and drops out of Browse and
Matches. Postings that reappear on the board are reactivated automatically by the upsert.

### 3.4 Scoring → Matches list

```mermaid
sequenceDiagram
  actor U as User
  participant FE as /matches
  participant Run as POST /api/score/run
  participant Score as scoring/scorePair
  participant LLM as LLM
  participant DB as scores + postings
  participant List as GET /api/postings

  U->>FE: Score matches now
  FE->>Run: { limit: 20 }
  Run->>DB: load profile + unscored active postings
  loop up to limit
    Run->>Score: scorePair(profile, posting)
    Score->>LLM: fit JSON
    LLM-->>Score: score, rationale, skills, gaps
    Score->>DB: upsert scores
  end
  Run-->>FE: { scored, attempted, errors }
  FE->>List: GET ?min_score=50
  List->>DB: scores ⨝ postings for profile
  List-->>FE: ranked matches
  FE-->>U: Job cards + Tailor
```

Cron alternative: `POST /api/cron/score` (service role + `CRON_SECRET`) batches all active profiles.

**Re-scoring on resume change:** `/api/score/run` also accepts `force: true` (the Matches
"Re-score matches" button) to re-score the current user's top-ranked jobs even if already scored.
In the background pipeline, `rescoreChangedProfiles()` compares a `resume_fingerprint` hash on
`jp_profiles`; when the resume changes, it force re-scores the top ~50 ranked jobs for that
profile. Fingerprints are backfilled on first run with **no** LLM cost.

### 3.5 Tailor → review → apply

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Matches / Application detail
  participant Apps as POST /api/applications
  participant Tailor as POST .../tailor (SSE)
  participant Quota as billing/quota
  participant LLM as LLM (2 calls)
  participant DB as applications

  U->>FE: Tailor
  FE->>Apps: { posting_id }
  Apps->>DB: insert application (discovered) if new
  Apps-->>FE: application.id
  FE->>FE: navigate /applications/{id}
  U->>FE: Generate tailored materials
  FE->>Tailor: POST (SSE stream)
  Tailor->>Quota: assertTailorQuota → 402 if exhausted (before stream)
  Tailor-->>FE: SSE resume_start → "Step 1/2: Tailoring resume…"
  Tailor->>LLM: call 1 — tailored resume only
  LLM-->>Tailor: tailored_resume JSON
  Tailor-->>FE: SSE resume_done → "Step 2/2: Writing cover letter…"
  Tailor->>LLM: call 2 — cover letter (grounded in tailored resume)
  LLM-->>Tailor: cover_letter JSON
  Tailor-->>FE: SSE cover_done
  Tailor->>DB: save drafts, status=reviewing (+ increment quota)
  Tailor-->>FE: SSE done { application }
  FE->>FE: reload application
  U->>FE: Edit / Regenerate (same SSE flow, free) / Mark Applied
  FE->>DB: PATCH status, cover letter, history
```

Tailoring is **split into two LLM calls** (resume, then cover letter grounded in the tailored
resume) and **streamed over SSE**, so each piece lands faster and the UI shows live step progress
instead of a blank wait. `POST /api/applications/:id/regenerate` uses the same streamed flow with
`countAgainstQuota: false` (free after the first tailor).

### 3.6 Kanban tracking

```mermaid
stateDiagram-v2
  [*] --> discovered
  discovered --> reviewing: start tailor
  discovered --> archived
  reviewing --> applied: Mark Applied
  reviewing --> archived
  applied --> screening
  applied --> rejected
  applied --> archived
  screening --> interview
  screening --> rejected
  screening --> archived
  interview --> offer
  interview --> rejected
  interview --> archived
  offer --> archived
  rejected --> archived
```

Invalid transitions are rejected by `assertTransition` in `src/lib/applications/status.ts`.

---

## 4. Data tables (runtime)

| Table | Written by | Read by |
|---|---|---|
| `jp_users` | Auth signup trigger | Billing / digest |
| `jp_profiles` | Resume upload / profile PUT | Scoring, Matches gate; `resume_fingerprint` written by pipeline rescore |
| `jp_companies` | Seed SQL | Poller |
| `jp_postings` | Poller (6 ATS sources); stale-sweep sets `is_active=false` | Scoring, Browse page, Matches join |
| `jp_scores` | Score run / cron / pipeline rescore | Matches list |
| `jp_applications` | Tailor flow + Kanban PATCH | Tracker, review UI, follow-up, Matches applied-filter |
| `jp_interview_sessions` | Interview generate / evaluate | Interview UI, report |
| `jp_usage_counters` | Tailor increment | Usage page / quota |
| `jp_pipeline_state` | Pipeline (lock + TTL timestamps) | `/api/pipeline/status`, lazy trigger |

---

## 8. Important API map

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/profile/resume` | User | Upload + LLM autofill |
| POST | `/api/profile/resume/reparse` | User | Re-extract stored file |
| GET/PUT | `/api/profile` | User | Read/update profile |
| POST | `/api/score/run` | User | Score my profile vs jobs (SSE streaming; `force: true` re-scores) |
| GET | `/api/postings?min_score=` | User | Matches list (scored only; hides applied unless `include_applied=1`) |
| GET | `/api/postings/browse` | Public | Browse all active postings (triggers lazy refresh) |
| GET | `/api/stats` | User | Pipeline health (counts, timestamps; triggers lazy refresh) |
| GET | `/api/pipeline/status` | User | Pipeline freshness (`last_poll_at`, `stale`, `running`) |
| POST | `/api/pipeline/run` | User | Manual "Refresh now" — poll + stale-sweep + score in background |
| POST | `/api/applications` | User | Create application shell |
| POST | `/api/applications/:id/tailor` | User | Generate drafts (quota; SSE streamed, resume → cover letter) |
| POST | `/api/applications/:id/regenerate` | User | Free regenerate (SSE streamed) |
| POST | `/api/applications/:id/follow-up` | User | Draft follow-up email |
| PATCH | `/api/applications/:id` | User | Status / notes / cover letter |
| POST | `/api/interview/generate` | User | Generate interview questions |
| POST | `/api/interview/evaluate` | User | Evaluate answer + STAR feedback |
| POST | `/api/cron/poll-ats` | Cron secret | Ingest 6 ATS sources |
| POST | `/api/cron/score` | Cron secret | Batch score all profiles |
| POST | `/api/cron/digest` | Cron secret | Weekly email |

---

## 6. New workflows (Phase 2)

### 6.1 Browse all jobs

```mermaid
sequenceDiagram
  actor U as User
  participant FE as /browse
  participant API as GET /api/postings/browse
  participant DB as postings

  U->>FE: Search / filter jobs
  FE->>API: ?q=engineer&location=Remote&page=1
  API->>DB: SELECT active postings (ilike filters)
  DB-->>API: paginated results
  API-->>FE: { postings, total, total_pages }
  FE-->>U: Job cards with Score / View buttons
  U->>FE: Click "Score it"
  FE->>FE: Navigate to /matches (auto-score triggers)
```

### 6.2 Mock interview

```mermaid
sequenceDiagram
  actor U as User
  participant FE as /interview/[id]
  participant Gen as POST /api/interview/generate
  participant Eval as POST /api/interview/evaluate
  participant LLM as LLM
  participant DB as interview_sessions

  U->>FE: Open interview from Matches
  FE->>Gen: { posting_id }
  Gen->>DB: INSERT session (in_progress)
  Gen->>LLM: Generate 8-12 questions from JD
  LLM-->>Gen: questions JSON
  Gen-->>FE: { session_id, questions }

  loop Each question
    U->>FE: Type answer
    FE->>Eval: { session_id, question_index, answer }
    Eval->>LLM: Evaluate answer (STAR scoring)
    LLM-->>Eval: { score, strengths, improvements, star_assessment }
    Eval->>DB: UPDATE answers array
    Eval-->>FE: { feedback, completed, session_status }
    FE-->>U: Score + feedback for this question
  end

  FE-->>U: Complete report with overall score
```

### 6.3 Stale follow-up

```mermaid
sequenceDiagram
  actor U as User
  participant FE as /applications/[id]
  participant API as POST /api/applications/:id/follow-up
  participant LLM as LLM
  participant DB as applications

  U->>FE: Open application (applied 21+ days ago)
  FE-->>U: Stale badge: "21d stale"
  U->>FE: Click "Draft follow-up email"
  FE->>API: POST
  API->>DB: Load posting + application data
  API->>LLM: Generate follow-up email draft
  LLM-->>API: { subject, body }
  API->>DB: PATCH notes (append follow-up draft)
  API-->>FE: { subject, body, stale_days }
  FE-->>U: Follow-up email draft saved
```

### 6.4 Auto-scoring

```mermaid
sequenceDiagram
  actor U as User
  participant FE as /matches
  participant Stats as GET /api/stats
  participant Score as POST /api/score/run (SSE)

  U->>FE: Enter Matches page
  FE->>Stats: Pipeline health
  Stats-->>FE: { total_postings: 1247, scored_count: 0 }
  FE-->>U: "1,247 jobs available · 0 scored"
  FE->>Score: { limit: 20, stream: true }
  Score-->>FE: SSE: { type: "progress", index: 1, company: "Stripe", title: "SWE" }
  FE-->>U: Progress bar: "1/20 · Scoring SWE at Stripe"
  Score-->>FE: SSE: { type: "done", scored: 17 }
  FE-->>U: Refresh matches list
```

### 6.5 Self-refreshing pipeline (auto-refresh)

The app is self-sustaining: no external scheduler is required. Any visit to `/browse`
(the public browse API) or `/matches` (via `/api/stats`) calls `maybeTriggerPipeline()`; if it's
been >6h since the last poll and no run is live, it kicks off `runPipeline()` **after** the
response is sent (`next/server` `after()`). A DB lock (`jp_pipeline_state.running` +
`running_at`, with a 15-min stale timeout) serializes concurrent runs across requests/instances.

```mermaid
sequenceDiagram
  actor U as User
  participant FE as /browse or /matches
  participant Stats as GET /api/stats or /api/postings/browse
  participant Pipe as pipeline/runPipeline
  participant Lock as jp_pipeline_state
  participant ATS as ATS APIs
  participant DB as postings/scores

  U->>FE: Open page
  FE->>Stats: fetch (PipelineStats / postings)
  Stats->>Pipe: maybeTriggerPipeline(admin) — stale? (>6h) && not running?
  Pipe->>Lock: acquirePipelineLock()
  Lock-->>Pipe: lock acquired
  Pipe->>ATS: pollCompanies() → upsert jp_postings
  Pipe->>DB: deactivateStalePostings(30 days)
  Pipe->>DB: scoreUnscoredBatch() → new jp_scores
  Pipe->>DB: rescoreChangedProfiles() → force re-score on resume change
  Pipe->>Lock: releasePipelineLock()
  Stats-->>FE: response (page renders)
```

Manual refresh: **"Refresh now"** on `/browse` → `POST /api/pipeline/run` (409 if a run is
live). Freshness is surfaced by `GET /api/pipeline/status` → `{ last_poll_at, stale, running }`.

## 7. Why Matches can look empty

Matches only lists rows in `jp_scores` for **your** profile above `min_score`, and hides jobs you've
already applied to (unless the "Show applied" toggle is on).

Typical first-run state:

1. Pipeline auto-refresh fills `jp_postings` (thousands of jobs) ✓  
2. Profile has `resume_parsed` ✓  
3. `jp_scores` is still empty ✗ → **Auto-score triggers automatically!**
4. Progress bar shows "Scoring 1/20 · Stripe SWE…"
5. Matches appear as scoring completes

The Matches page self-refreshes every ~8s while postings or scores are still empty (data is being
built in the background), so it fills in without a manual reload.

Job freshness: postings unseen for 30 days are deactivated and leave the list, so Matches/Browse
reflect the live market rather than a stale snapshot. Scores refresh automatically when you update
your resume (fingerprint-based re-score), or on demand via **Re-score matches**.

You can also browse all postings at `/browse` before scoring — search, filter, "Refresh now", and
trigger scoring on individual jobs.

---

## 7. Local operator cheatsheet

```bash
# The pipeline self-refreshes on page visits (lazy TTL, >6h). Manual triggers:

# Manual refresh (authenticated) — "Refresh now" button, or:
curl -X POST -H "Content-Type: application/json" \
  http://localhost:5200/api/pipeline/run -d "{}"

# Pipeline freshness:
curl http://localhost:5200/api/pipeline/status
# → { "last_poll_at": "...", "stale": false, "running": false }

# Cron path (still available; requires CRON_SECRET):
export CRON_SECRET="$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)"
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:5200/api/cron/poll-ats
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:5200/api/cron/score
```

Env used by LLM paths: `OPENAI_COMPATIBLE_BASE_URL`, `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_MODEL`.
