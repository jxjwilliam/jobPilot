# JobPilot — MVP Execution Plan

**Version:** 0.1
**Companion to:** `01-jobpilot-product-spec.md`
**Last updated:** July 11, 2026

---

## 1. Scope definition

### 1.1 MVP scope (build now)
- Resume upload + parsing into structured profile
- Preferences intake (roles, locations, remote pref, salary floor)
- ATS ingestion: Greenhouse + Lever only for launch (add Ashby/Workable/Recruitee/Personio in fast-follow, not blocking launch)
- Scoring pipeline with configurable threshold
- Tailoring pipeline (resume section edits + cover letter draft)
- Human review UI (diff view, edit, approve, regenerate)
- Application tracker (Kanban board, manual status updates)
- Weekly digest email
- Stripe billing: free tier + one paid tier
- Basic account/auth

### 1.2 Fast-follow (weeks 5–10 post-launch, not MVP-blocking)
- Remaining Tier 1 ATS sources (Ashby, Workable, Recruitee, Personio)
- Interview prep module (Whisper transcription + feedback)
- Stale-application follow-up suggestions
- Usage analytics dashboard for the user (applications sent, response rate)

### 1.3 Phase 2 (post-validation, months 2–4)
- Browser extension for one-click apply prefill
- Gmail integration to auto-detect status changes ("interview scheduled," "unfortunately...")
- Crunch-mode one-time-purchase tier
- Managed scraping vendor evaluation for Tier 3 aggregator coverage (LinkedIn/Indeed)

### 1.4 Phase 3 (post-PMF)
- B2B/white-label for university career centers and outplacement firms
- Team/agency seats
- ATS-side integration (career-center admin dashboard)

**Explicitly out of scope indefinitely (unless re-evaluated):** auto-submission of applications without human review; non-English support; native mobile apps.

---

## 2. MoSCoW prioritization (MVP feature set)

| Priority | Feature |
|---|---|
| **Must** | Resume upload/parsing, preferences, Greenhouse+Lever ingestion, scoring, tailoring, review UI, tracker, billing/quota |
| **Should** | Weekly digest email, regenerate-with-instruction, stale-posting cleanup |
| **Could** | Ashby/Workable/Recruitee/Personio ingestion, basic usage analytics |
| **Won't (MVP)** | Interview prep, browser extension, Gmail integration, auto-apply, Tier 3 sources |

---

## 3. Timeline (solo founder, ~6–8 weeks to launch)

| Week | Focus | Deliverable |
|---|---|---|
| 1 | Validation | Landing page + waitlist live; 10–20 target-user interviews via Reddit (r/jobs, r/cscareerquestions), Indie Hackers, X; confirm willingness-to-pay signal before writing pipeline code |
| 2 | Foundation | Repo scaffold (Next.js + Supabase), auth, resume upload + parsing, profile schema |
| 3 | Ingestion | Greenhouse + Lever pollers, normalization, dedup, seed company list (200–500 companies, manually QA'd) |
| 4 | Scoring | Claude API scoring service, threshold config, caching layer |
| 5 | Tailoring + Review UI | Tailoring service, diff view, approve/regenerate flow |
| 6 | Tracker + Billing | Kanban tracker, Stripe integration, quota enforcement, usage counters |
| 7 | Digest + Polish | Weekly digest email, onboarding flow polish, empty states, error handling |
| 8 | Launch | Soft launch to waitlist, Product Hunt / Indie Hackers / relevant subreddits, monitor and fix |

Fast-follow items (interview prep, remaining ATS sources) target weeks 9–14 based on real usage signal from launch, not built speculatively beforehand.

---

## 4. Validation plan (before/alongside week 1–2 build)

1. **Landing page + waitlist** — describe the core value prop ("AI tailors your resume for every job, automatically"), collect emails, no code behind it yet
2. **Direct outreach** — post in r/jobs, r/cscareerquestions, r/ITCareerQuestions, Indie Hackers "idea validation" threads, and relevant X communities; ask about current pain, not the solution, to avoid leading answers
3. **Willingness-to-pay check** — explicitly ask waitlist signups if they've paid for resume tools, career coaching, or similar before; look for actual past spend, not hypothetical interest
4. **Competitive gap check** — audit existing tools (Teal, Simplify, LazyApply, Careerflow) for what they don't do well (most are either pure trackers with no AI tailoring, or auto-apply tools with quality/trust problems) — JobPilot's differentiation is the tailoring-with-human-review loop plus a legally clean data source
5. **Kill criteria** — if fewer than ~10 people show real payment intent after two weeks of outreach, revisit the idea before investing in the full 8-week build

---

## 5. Success metrics / KPIs

| Metric | MVP target (first 60 days post-launch) |
|---|---|
| Waitlist → signup conversion | 20%+ |
| Signup → resume upload completion | 70%+ |
| Free → paid conversion | 3–5% (typical freemium benchmark for this category) |
| Weekly active users / total signups | 30%+ |
| Applications tailored per active user / week | 3+ (indicates real usage, not just curiosity) |
| Digest email open rate | 35%+ |
| MRR at day 60 | $500–1,500 (early validation threshold, not a target ceiling) |

---

## 6. Pricing and monetization

| Tier | Price | Includes |
|---|---|---|
| Free | $0 | 5 tailored applications/month, full tracker, weekly digest |
| Pro | $19–29/mo | Unlimited tailoring, interview prep (once shipped), priority scoring refresh |
| Crunch | $99 one-time | 50 tailored applications within 7 days — targeted at recently laid-off users via time-boxed messaging |

Billing mechanics: Stripe subscriptions for Free/Pro, one-time Stripe Checkout for Crunch. Usage counters reset monthly for Pro; Crunch consumes from a fixed pool with a 7-day expiry.

**Future upsell (Phase 2+, matches your existing local AI image-gen setup):** $9 AI headshot generation add-on during onboarding, using your ComfyUI/Pinokio pipeline — validated micro-SaaS category, near-zero marginal cost given your existing local infrastructure.

---

## 7. Go-to-market plan

1. **Pre-launch:** waitlist + build-in-public updates on X and Indie Hackers (this category responds well to transparent build logs)
2. **Launch:** Product Hunt, r/jobs, r/cscareerquestions, r/ITCareerQuestions, Indie Hackers "Show IH"
3. **Content loop:** weekly digest itself becomes a light viral loop if it includes a shareable "I found N great-fit jobs this week" stat
4. **SEO (later):** long-tail pages like "Greenhouse jobs at [company]" or "[role] jobs posted this week" — the ingestion pipeline's data is itself an SEO asset once volume justifies public pages
5. **Community:** consider a small Discord for active job-searchers using the tool — matches the "community moat" pattern that performs well for retention in this space

---

## 8. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ATS endpoints rate-limit or block polling | Medium | Medium | Conservative concurrency, backoff, identifiable User-Agent, diversify across many small companies rather than hammering few |
| LLM cost exceeds free-tier economics | Medium | Medium | Cache scores, use a cheaper model for scoring pass, hard quota enforcement |
| Low free-to-paid conversion | Medium | High | Validate willingness-to-pay before full build (§4); keep free tier genuinely useful but capped, not crippled |
| Resume parsing errors erode trust | Medium | Medium | Always show parsed profile for user confirmation/edit before first scoring run |
| Competitor with auto-apply captures market faster | Low-Medium | Medium | Differentiate on quality/trust (human-reviewed, no ToS-violating auto-submit) rather than racing on raw automation |
| Company list coverage too narrow at launch | Medium | Low-Medium | Expand list reactively based on user-requested companies; treat it as a living dataset, not a fixed seed |
| Legal exposure from data sourcing | Low (Tier 1 only) | High if ignored | Strict adherence to public, unauthenticated ATS endpoints only until Tier 3 is deliberately evaluated with proper diligence |

---

## 9. Budget estimate (first 90 days)

| Item | Monthly cost |
|---|---|
| Vercel (frontend/API hosting) | $0–20 (free tier likely sufficient at MVP scale) |
| Supabase (DB, Auth, Storage) | $0–25 |
| Claude API (scoring + tailoring) | $30–150 depending on volume — monitor closely, this is the main variable cost |
| Resend/Postmark (email) | $0–20 |
| Domain + misc | ~$15 one-time/year |
| **Total** | **$50–200/month** at MVP scale |

No paid marketing budget assumed for MVP — go-to-market relies on organic community channels (§7).

---

## 10. Immediate next actions

1. Ship the landing page + waitlist this week
2. Run validation outreach in parallel with early scaffolding (§4)
3. If validation signal is positive by end of week 2, commit to the 8-week build timeline in §3
4. If validation signal is weak, revisit against the two alternate cascade ideas noted in the original research (content-repurposing studio, MCP/agent-skill security gate) before continuing
