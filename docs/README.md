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
| **Board slug** | Short company id in those URLs (e.g. `stripe`, `gitlab`) stored in `companies.board_slug`. |
| **Pipeline** | The self-refreshing job pipeline: poll ATS → deactivate stale jobs (30 days) → score new pairs → re-score on resume change. Runs in the background on page visits (lazy TTL, >6h) via `src/lib/pipeline/`, plus a manual "Refresh now". Serialized by a DB lock. |
| **Cron** | Optional scheduled / on-demand server jobs secured by `CRON_SECRET`. Routes: `poll-ats` (ingest jobs), `score` (batch LLM fit scores), `digest` (weekly email). Not Greenhouse billing. The app no longer *requires* cron — the pipeline self-refreshes. |
| **Match / score** | LLM fit score (0–100) of **your profile** vs a posting; Matches lists scores above a min threshold. |
| **Customize application (Tailor)** | LLM drafts a tailored resume + cover letter for one job — now split into two streamed steps (resume, then cover letter grounded in it) with live SSE progress; human review; you apply on the company site. |
| **Quota / billing** | JobPilot SaaS limits on **tailoring count** (Free vs Pro). Mock Stripe by default — unrelated to Greenhouse fees. |
| **Tier 1 vs Tier 3** | Tier 1 = public ATS APIs (Greenhouse/Lever). Tier 3 = LinkedIn/Indeed-style scraping — **out of MVP** (ToS / legal risk). |

---

## Key product points

1. **Upload resume → AI autofills** profile + suggested preferences.  
2. **Poll** Greenhouse/Lever → `jp_postings` table.  
3. **Score** profile × jobs (UI “Score more matches” or cron) → `jp_scores`.  
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
| **Supabase** | Auth (magic link), Postgres, Storage (resumes), RLS |
| **OpenAI-compatible LLM** (`openai` SDK + env base URL) | Parse resume, score, tailor (e.g. DeepSeek) |
| **Greenhouse / Lever** public APIs | Job discovery |
| **Stripe** | Subscriptions (adapter; `BILLING_MODE=mock` by default) |
| **Resend** (or similar) | Digest email (`EMAIL_MODE=mock` by default) |
| **Vercel** (typical host) | Deploy Next.js |
| **Zod / Vitest / Tailwind** | Validation, tests, styling |

**Not used in MVP:** LinkedIn/Indeed scraping, LessTranslate, Anthropic-as-required-provider (Claude was in early research; runtime is OpenAI-compatible).
