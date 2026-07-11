# JobPilot — Design Spec

**Date:** 2026-07-11  
**Status:** Implemented (MVP) — runtime detail in `docs/03-jobpilot-workflow.md`  
**Companions:** `docs/01-jobpilot-product-spec.md`, `docs/02-jobpilot-mvp-plan.md`, `docs/cascading-github-pipeline-playbook.md`

---

## 1. Decisions locked in brainstorming

| Decision | Choice |
|---|---|
| Product | JobPilot — AI career-operations pipeline |
| Validation week | **Skipped** — build the product now |
| First ship scope | **Full Must list** (see §3) |
| Architecture | **Modular monolith** — one Next.js app + linked Supabase |
| External services | Env placeholders + **mock adapters** for Stripe/Resend; real Supabase; OpenAI-compatible LLM from existing `.env` |
| LLM | OpenAI-compatible default (DeepSeek / Qwen / etc. via env); not Anthropic-first |
| Auth | Supabase Auth — **email magic link only** |

---

## 2. Architecture

One Next.js App Router application (Vercel) backed by the already-linked Supabase project.

```
┌─────────────────────────────────────────────────────────┐
│  Next.js (UI + Route Handlers / Server Actions)         │
│  modules: ingestion · scoring · tailoring · applications│
│           billing · notifications · llm · auth          │
└───────────────┬─────────────────────────┬───────────────┘
                │                         │
        Supabase Auth/DB/Storage    OpenAI-compatible LLM
                │
     pg_cron / Vercel Cron (poll + digest)
```

**Internal modules** (same deploy, clear interfaces — extractable later):

| Module | Responsibility |
|---|---|
| `ingestion` | Poll Greenhouse + Lever; normalize; dedup; freshness |
| `scoring` | Profile × posting → score + rationale; cache by pair |
| `tailoring` | Resume section edits + cover letter; never fabricate facts |
| `applications` | Lifecycle state machine + Kanban data |
| `billing` | Tiers, usage counters, portal — **mock Stripe** until keys |
| `notifications` | Weekly digest — **mock Resend** until keys |
| `llm` | Thin OpenAI-compatible client; model/base URL from env |

---

## 3. MVP Must scope (single ship)

**In:**
- Resume upload + parse into structured profile (LLM structured JSON; user confirms/edits)
- Preferences (roles, locations, remote/hybrid/onsite, salary floor, exclusions)
- ATS ingestion: **Greenhouse + Lever only**
- Scoring with configurable threshold (default 70)
- Tailoring (section edits + cover letter) with regenerate-with-instruction
- Human review UI (diff, edit, approve)
- Application tracker (Kanban, manual status updates)
- Billing/quota: Free (5 tailorings/mo) + Pro (unlimited) — enforced via counters; Stripe adapter mockable. `crunch` exists on the tier enum for later but is not sold or exposed in this ship.
- Weekly digest job (mock email OK)

**Out (fast-follow / later):** Interview prep, Ashby/Workable/etc., browser extension, Gmail status sync, Tier 3 scrapers, auto-submit, non-English, native mobile.

---

## 4. User surfaces

1. **Auth** — request magic link; check-email state  
2. **Onboarding** — upload → confirm parsed profile → preferences → first matches  
3. **Matches** — scored postings ≥ threshold; rationale; Tailor CTA  
4. **Review** — section diff + cover letter; edit; regenerate; approve  
5. **Applications** — Kanban columns from status enum  
6. **Profile / Usage** — edit profile/prefs; quota meter; upgrade CTA  

App shell nav: Matches · Applications · Profile · Usage

---

## 5. Data model

Tables (Supabase migrations + RLS: users only access own rows):

- **users** — id, email, subscription_tier (`free` | `pro` | `crunch`), stripe_customer_id  
- **profiles** — user_id, resume_raw_url, resume_parsed jsonb, preferences jsonb, updated_at  
- **companies** — ats_source, board_slug, company_name, is_active, failure tracking  
- **postings** — ats_source, external_id (unique pair), company_name, title, location, employment_type, description_raw, salary_min/max, posted_at, first_seen_at, last_seen_at, is_active, apply_url  
- **scores** — unique (profile_id, posting_id), score 0–100, rationale, matched_skills[], gaps[], scored_at  
- **applications** — profile_id, posting_id, status enum, tailored_resume jsonb, tailored_cover_letter, applied_at, status_history jsonb, notes  
- **usage_counters** — user_id, period_start, tailoring_count, reset_at  

Application status enum: `discovered` | `reviewing` | `applied` | `screening` | `interview` | `offer` | `rejected` | `archived`

Interview sessions table deferred.

---

## 6. Data flow

1. User confirms profile → `profiles`  
2. Cron poller loads active `companies` → Greenhouse/Lever public APIs → upsert `postings`  
3. Scorer finds unscored (profile, posting) pairs → LLM → `scores`  
4. Matches UI reads scores ≥ threshold  
5. Tailor: check quota → LLM → upsert `applications` (status `reviewing`) → increment `usage_counters`  
6. Approve / status patches update `applications` + `status_history`  
7. Digest cron aggregates high-fit / pending review / quota → notification adapter  

LLM calls always target structured JSON for parse, score, and tailor outputs.

---

## 7. Integrations & adapters

| Concern | MVP behavior |
|---|---|
| Supabase | Real — Auth, Postgres, Storage (already linked) |
| LLM | Real — OpenAI-compatible from `.env` (`OPENAI_COMPATIBLE_BASE_URL` or provider-specific keys) |
| Stripe | Interface + **mock** (upgrade CTA works; no live charge until keys) |
| Resend | Interface + **mock** (log digest payload) |
| ATS | Real HTTP to public Greenhouse/Lever board APIs; seed `companies` list (200–500 tech boards) |

Env template (no secrets in repo): Supabase URL/anon/service keys, LLM base URL/API key/model, optional Stripe/Resend keys, `BILLING_MODE=mock|live`, `EMAIL_MODE=mock|live`.

---

## 8. API surface (MVP)

```
POST   /api/profile/resume
GET    /api/profile
PUT    /api/profile
GET    /api/postings?min_score=70
GET    /api/postings/:id
GET    /api/applications
GET    /api/applications/:id
POST   /api/applications/:id/tailor
POST   /api/applications/:id/regenerate
PATCH  /api/applications/:id
GET    /api/billing/portal
POST   /api/webhooks/stripe
GET    /api/usage
POST   /api/cron/poll-ats
POST   /api/cron/score
POST   /api/cron/digest
```

Auth is handled by Supabase session (cookies); Route Handlers require authenticated user except cron (secured by cron secret) and Stripe webhook.

---

## 9. Error handling

- Magic link expired → clear retry path  
- Resume parse failure → keep file; empty structured fields for manual edit  
- ATS: per-company isolation; backoff on 429; User-Agent identified; mark unhealthy boards  
- LLM: one retry; schema failure → UI error + regenerate; no partial writes  
- Quota exceeded → hard block + upgrade CTA  
- Unique constraints for postings and scores for idempotent retries  
- No resume body in logs; private storage; basic delete/export affordance  

---

## 10. Testing strategy

- Unit: JSON parsers for LLM outputs, status transitions, quota math  
- Integration: migrations + RLS  
- Contract: fixture LLM + mock Stripe/Resend  
- Smoke: onboarding → score fixture posting → tailor → approve → Applied  

---

## 11. Repo / stack summary

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), Tailwind, TypeScript |
| Backend | Next.js Route Handlers + Supabase |
| DB / Auth / Storage | Existing linked Supabase project |
| LLM | OpenAI-compatible SDK |
| Hosting | Vercel + Supabase |
| Tests | Vitest (+ Playwright smoke optional) |

Estimated infra: consistent with original MVP budget; LLM cost is the main variable.

---

## 12. Non-goals reminder

No auto-submit. No LinkedIn/Indeed scraping. No interview prep in this ship. No B2B white-label. English-only.

---

*Next: implementation plan at `docs/superpowers/plans/2026-07-11-jobpilot-mvp.md`.*
