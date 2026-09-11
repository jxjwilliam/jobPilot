# Docs index

| File | Role |
|---|---|
| [03-jobpilot-workflow.md](./03-jobpilot-workflow.md) | Current implementation workflows & sequence diagrams |
| [01-jobpilot-product-spec.md](./01-jobpilot-product-spec.md) | Product & technical specification (MVP) |
| [02-jobpilot-mvp-plan.md](./02-jobpilot-mvp-plan.md) | Execution plan / MoSCoW / timeline |
| [cascading-github-pipeline-playbook.md](./cascading-github-pipeline-playbook.md) | Upstream research that selected JobPilot |
| [05-screenshot-demo-pipeline.md](./05-screenshot-demo-pipeline.md) | Screenshot UI + demo video pipeline (agent skills) |
| [superpowers/specs/2026-07-11-jobpilot-design.md](./superpowers/specs/2026-07-11-jobpilot-design.md) | Brainstorming design lock-in |
| [superpowers/plans/2026-07-11-jobpilot-mvp.md](./superpowers/plans/2026-07-11-jobpilot-mvp.md) | Bite-sized implementation plan |

Setup and operator commands: repo root [`README.md`](../README.md).

---

## Terminology (brief)

| Term | Meaning in JobPilot |
|---|---|
| **ATS** | Applicant Tracking System — software companies use to host job boards and applications. |
| **Greenhouse** | Popular ATS. JobPilot pulls **real public job JSON** from `boards-api.greenhouse.io/v1/boards/{company}/jobs` (no login; same feed careers pages use). Free for candidates to apply; we do **not** auto-submit. |
| **Lever** | Another ATS with a similar public feed: `api.lever.co/v0/postings/{company}`. Also Tier‑1 MVP source. |
| **Board slug** | Short company id in those URLs (e.g. `stripe`, `gitlab`) stored in `jp_companies.board_slug`. |
| **Relevance filter** | The strict gate every posting must pass before it is stored: the **title** must name an AI/full-stack specialism *and* carry a seniority signal, the title must not look like a junior/non-engineering role, and the location must be Canada-eligible or genuinely location-agnostic. Implemented in `src/lib/ingestion/filter.ts`; the verdict is stored as `jp_postings.is_relevant` + `matched_keywords`. Keeps the pipeline at ~50–100 live postings instead of tens of thousands. |
| **Pipeline** | The self-refreshing job pipeline: poll ATS → relevance filter → deactivate stale jobs (30 days) → score new pairs → re-score on resume change. Runs in the background on page visits (lazy TTL, >6h) via `src/lib/pipeline/`, plus a manual "Refresh now". Serialized by a DB lock. Scoring only considers `is_relevant` postings. |
| **Cron** | Optional scheduled / on-demand server jobs secured by `CRON_SECRET`. Routes: `poll-ats` (ingest jobs), `score` (batch LLM fit scores), `digest` (weekly email). Not Greenhouse billing. The app no longer *requires* cron — the pipeline self-refreshes. |
| **Match / score** | LLM fit score (0–100) of **your profile** vs a posting; Matches lists scores above a min threshold. |
| **Customize application (Tailor)** | LLM drafts a tailored resume + cover letter for one job — now split into two streamed steps (resume, then cover letter grounded in it) with live SSE progress; human review; you apply on the company site. |
| **Quota / billing** | JobPilot SaaS limits on **tailoring count** (Free vs Pro). Mock Stripe by default — unrelated to Greenhouse fees. |
| **Tier 1 vs Tier 3** | Tier 1 = public ATS APIs (Greenhouse, Lever, Ashby, Workable, Recruitee, Personio). Tier 3 = LinkedIn/Indeed-style scraping — **out of MVP** (ToS / legal risk). |
| **Source / channel filter** | The `ats_source` of a posting (`greenhouse`, `lever`, `ashby`, …). Both Browse and Matches default to **Greenhouse only** and expose a Source dropdown (`All sources` shows everything). |

---

## Key product points

1. **Upload resume → AI autofills** profile + suggested preferences (the file itself is stored in the `jp_resumes` Supabase Storage bucket).  
2. **Poll** the watched ATS boards → relevance filter → `jp_postings` (only matching rows are written).  
3. **Score** profile × relevant jobs (UI “Score more matches” or cron) → `jp_scores`.  
4. **Customize application** → review → Mark Applied → **Kanban** tracker.  
5. **Weekly digest** + usage meter (email/billing often **mock** in local env).

---

## Inspiration / GitHub research (not vendored as deps)

From [cascading-github-pipeline-playbook.md](./cascading-github-pipeline-playbook.md) — ideas JobPilot was patterned after; **this repo is a custom Next.js app**, not a git submodule of these:

| Repo / pattern | Role in the idea |
|---|---|
| [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search) | Score + tailor + interview-prep agent workflow |
| [Zackriya-Solutions/meetily](https://github.com/Zackriya-Solutions/meetily) | Local transcription pattern (interview prep — **deferred**) |
| Playwright / Crawlee-style scrapers | Research mentioned scrapers; **MVP uses public ATS HTTP APIs instead** |

---

## Third-party stack (what the app actually uses)

| Service | Use |
|---|---|
| **Next.js** (React, App Router) | Web UI + API routes |
| **Supabase** | Auth (fixed-credential password login → minted session), Postgres, Storage (resumes), RLS |
| **OpenAI-compatible LLM** (`openai` SDK + env base URL) | Parse resume, score, tailor (e.g. DeepSeek) |
| **Greenhouse / Lever / Ashby / Workable / Recruitee / Personio** public APIs | Job discovery (all six ATS sources) |
| **Stripe** | Subscriptions (adapter; `BILLING_MODE=mock` by default) |
| **Resend** (or similar) | Digest email (`EMAIL_MODE=mock` by default) |
| **Vercel** (typical host) | Deploy Next.js |
| **Zod / Vitest / Tailwind** | Validation, tests, styling |

**Not used in MVP:** LinkedIn/Indeed scraping, LessTranslate, Anthropic-as-required-provider (Claude was in early research; runtime is OpenAI-compatible).
