# JobPilot — Current Implementation Workflow

**Last updated:** 2026-07-11  
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
  Auth --> SB
  Auth --> LLM
  ScoreAPI --> SB
  ScoreAPI --> LLM
  AppAPI --> SB
  AppAPI --> LLM
  InterviewAPI --> SB
  InterviewAPI --> LLM
  Cron --> ATS
  Cron --> SB
  Cron --> LLM
```

**Modules (under `src/lib/`):**

| Module | Role |
|---|---|
| `ingestion/` | Poll 6 ATS sources → upsert `postings` |
| `scoring/` | LLM fit score → `scores`, with SSE streaming |
| `tailoring/` | LLM resume/cover letter drafts → `applications` |
| `applications/` | Status state machine + stale detection |
| `billing/` | Quota + mock Stripe |
| `notifications/` | Weekly digest + mock email |
| `profile/` | Resume parse / preference extract |
| `stream/` | SSE streaming helper (Web Streams API) |

---

## 2. End-to-end product workflow

```mermaid
flowchart TD
  A[Magic-link login] --> B[Upload resume]
  B --> C[LLM extracts profile + suggested preferences]
  C --> D[User reviews autofilled fields]
  D --> E[Save preferences]
  E --> F[ATS poller fills postings table]
  F --> G[Score matches now / cron score]
  G --> H[Matches list: score ≥ threshold]
  H --> I[Tailor → application shell]
  I --> J[Generate tailored resume + cover letter]
  J --> K[Review / regenerate / Mark Applied]
  K --> L[Kanban tracker status updates]
  L --> M[Weekly digest cron]
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
  participant Cron as POST /api/cron/poll-ats
  participant Ing as ingestion/poll
  participant GH as Greenhouse API
  participant LV as Lever API
  participant DB as companies + postings

  Note over Cron: Authorization Bearer CRON_SECRET
  Cron->>Ing: pollCompanies(admin)
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
  Ing-->>Cron: { polled, upserted, errors }
```

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

### 3.5 Tailor → review → apply

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Matches / Application detail
  participant Apps as POST /api/applications
  participant Tailor as POST .../tailor
  participant Quota as billing/quota
  participant LLM as LLM
  participant DB as applications

  U->>FE: Tailor
  FE->>Apps: { posting_id }
  Apps->>DB: insert application (discovered) if new
  Apps-->>FE: application.id
  FE->>FE: navigate /applications/{id}
  U->>FE: Generate tailored materials
  FE->>Tailor: POST
  Tailor->>Quota: canTailor? increment if first tailor
  Tailor->>LLM: tailored_resume + cover_letter
  LLM-->>Tailor: JSON draft
  Tailor->>DB: save drafts, status=reviewing
  Tailor-->>FE: application
  U->>FE: Edit / Regenerate / Mark Applied
  FE->>DB: PATCH status, cover letter, history
```

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
| `users` | Auth signup trigger | Billing / digest |
| `profiles` | Resume upload / profile PUT | Scoring, Matches gate |
| `resumes` | Resume upload (multi-resume support) | Profile page, scoring |
| `companies` | Seed SQL | Poller |
| `postings` | Poller (6 ATS sources) | Scoring, Browse page, Matches join |
| `scores` | Score run / cron | Matches list |
| `applications` | Tailor flow + Kanban PATCH | Tracker, review UI, follow-up |
| `interview_sessions` | Interview generate / evaluate | Interview UI, report |
| `usage_counters` | Tailor increment | Usage page / quota |

---

## 8. Important API map

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/profile/resume` | User | Upload + LLM autofill |
| POST | `/api/profile/resume/reparse` | User | Re-extract stored file |
| GET/PUT | `/api/profile` | User | Read/update profile |
| POST | `/api/score/run` | User | Score my profile vs jobs (SSE streaming) |
| GET | `/api/postings?min_score=` | User | Matches list (scored only) |
| GET | `/api/postings/browse` | Public | Browse all active postings |
| GET | `/api/stats` | User | Pipeline health (counts, timestamps) |
| POST | `/api/applications` | User | Create application shell |
| POST | `/api/applications/:id/tailor` | User | Generate drafts (quota) |
| POST | `/api/applications/:id/regenerate` | User | Free regenerate |
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

## 7. Why Matches can look empty

Matches only lists rows in `scores` for **your** profile above `min_score`.

Typical first-run state:

1. Poller has filled `postings` (thousands of jobs) ✓  
2. Profile has `resume_parsed` ✓  
3. `scores` is still empty ✗ → **Auto-score triggers automatically!**
4. Progress bar shows "Scoring 1/20 · Stripe SWE…"
5. Matches appear as scoring completes

You can also browse all postings at `/browse` before scoring — search, filter, and trigger scoring on individual jobs.

---

## 7. Local operator cheatsheet

```bash
# Load cron secret from env file
export CRON_SECRET="$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)"

# Ingest / refresh jobs
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/poll-ats

# Batch score (all profiles) — or use Matches UI button for your user only
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/score
```

Env used by LLM paths: `OPENAI_COMPATIBLE_BASE_URL`, `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_MODEL`.
