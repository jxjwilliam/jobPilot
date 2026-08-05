# JobPilot MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship JobPilot Must-scope MVP — magic-link auth, resume/profile, Greenhouse+Lever ingestion, scoring, tailoring with human review, Kanban tracker, quota/billing (mock Stripe), and weekly digest (mock email).

**Architecture:** Modular monolith — Next.js App Router + linked Supabase. Pipeline stages as `src/lib/*` modules with adapter interfaces for LLM, Stripe, and Resend.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Supabase (Auth/DB/Storage), OpenAI-compatible SDK (`openai` npm), Vitest, Zod.

**Spec:** `docs/superpowers/specs/2026-07-11-jobpilot-design.md`

---

## File map (create during tasks)

```
package.json
.env.example
vitest.config.ts
supabase/migrations/20260711000000_init.sql
supabase/seed_companies.sql
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/admin.ts
src/lib/llm/client.ts
src/lib/llm/schemas.ts
src/lib/ingestion/greenhouse.ts
src/lib/ingestion/lever.ts
src/lib/ingestion/poll.ts
src/lib/scoring/score.ts
src/lib/tailoring/tailor.ts
src/lib/applications/status.ts
src/lib/billing/quota.ts
src/lib/billing/stripe.ts
src/lib/notifications/email.ts
src/lib/notifications/digest.ts
src/app/layout.tsx
src/app/page.tsx
src/app/(auth)/login/page.tsx
src/app/(auth)/auth/callback/route.ts
src/app/(app)/layout.tsx
src/app/(app)/onboarding/page.tsx
src/app/(app)/matches/page.tsx
src/app/(app)/applications/page.tsx
src/app/(app)/applications/[id]/page.tsx
src/app/(app)/profile/page.tsx
src/app/(app)/usage/page.tsx
src/app/api/profile/route.ts
src/app/api/profile/resume/route.ts
src/app/api/postings/route.ts
src/app/api/postings/[id]/route.ts
src/app/api/applications/route.ts
src/app/api/applications/[id]/route.ts
src/app/api/applications/[id]/tailor/route.ts
src/app/api/applications/[id]/regenerate/route.ts
src/app/api/usage/route.ts
src/app/api/billing/portal/route.ts
src/app/api/webhooks/stripe/route.ts
src/app/api/cron/poll-ats/route.ts
src/app/api/cron/score/route.ts
src/app/api/cron/digest/route.ts
src/components/...
tests/unit/...
```

---

### Task 1: Scaffold Next.js app + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `.env.example`, `vitest.config.ts`

- [ ] **Step 1: Create Next.js TypeScript app in place**

Run from repo root:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --yes
```

If create-next-app refuses non-empty dir, scaffold manually with the same flags' equivalent `package.json` scripts (`dev`, `build`, `start`, `lint`, `test`) and dependencies: `next`, `react`, `react-dom`, `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `tailwindcss`, `postcss`, `autoprefixer`, `zod`, `openai`, `@supabase/supabase-js`, `@supabase/ssr`, `vitest`.

- [ ] **Step 2: Add Vitest**

```bash
npm install -D vitest @vitejs/plugin-react jsdom
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

Add script `"test": "vitest run"` to `package.json`.

- [ ] **Step 3: Write `.env.example`**

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

OPENAI_COMPATIBLE_BASE_URL=
OPENAI_COMPATIBLE_API_KEY=
OPENAI_COMPATIBLE_MODEL=

BILLING_MODE=mock
EMAIL_MODE=mock
CRON_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
EMAIL_FROM=noreply@jobpilot.local
```

Document: copy keys from existing `.env` / Supabase dashboard into `.env.local` (never commit secrets). Map DeepSeek (or preferred) key into `OPENAI_COMPATIBLE_*`.

- [ ] **Step 4: Verify scaffold**

```bash
npm run build
```

Expected: Next.js build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js JobPilot app with Vitest"
```

---

### Task 2: Supabase schema + RLS

**Files:**
- Create: `supabase/migrations/20260711000000_init.sql`
- Keep: existing `supabase/config.toml`

- [ ] **Step 1: Write migration**

```sql
-- enums
create type subscription_tier as enum ('free', 'pro', 'crunch');
create type ats_source as enum ('greenhouse', 'lever');
create type application_status as enum (
  'discovered', 'reviewing', 'applied', 'screening',
  'interview', 'offer', 'rejected', 'archived'
);

create table public.jp_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  subscription_tier subscription_tier not null default 'free',
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

create table public.jp_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.jp_users(id) on delete cascade unique,
  resume_raw_url text,
  resume_parsed jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.jp_companies (
  id uuid primary key default gen_random_uuid(),
  ats_source ats_source not null,
  board_slug text not null,
  company_name text not null,
  is_active boolean not null default true,
  consecutive_failures int not null default 0,
  last_polled_at timestamptz,
  unique (ats_source, board_slug)
);

create table public.jp_postings (
  id uuid primary key default gen_random_uuid(),
  ats_source ats_source not null,
  external_id text not null,
  company_name text not null,
  title text not null,
  location text,
  employment_type text,
  description_raw text not null default '',
  salary_min numeric,
  salary_max numeric,
  apply_url text,
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true,
  unique (ats_source, external_id)
);

create table public.jp_scores (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.jp_profiles(id) on delete cascade,
  posting_id uuid not null references public.jp_postings(id) on delete cascade,
  score numeric not null check (score >= 0 and score <= 100),
  rationale text not null default '',
  matched_skills jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  scored_at timestamptz not null default now(),
  unique (profile_id, posting_id)
);

create table public.jp_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.jp_profiles(id) on delete cascade,
  posting_id uuid not null references public.jp_postings(id) on delete cascade,
  status application_status not null default 'discovered',
  tailored_resume jsonb,
  tailored_cover_letter text,
  applied_at timestamptz,
  status_history jsonb not null default '[]'::jsonb,
  notes text,
  unique (profile_id, posting_id)
);

create table public.jp_usage_counters (
  user_id uuid primary key references public.jp_users(id) on delete cascade,
  period_start date not null,
  tailoring_count int not null default 0,
  reset_at timestamptz not null
);

-- RLS
alter table public.jp_users enable row level security;
alter table public.jp_profiles enable row level security;
alter table public.jp_scores enable row level security;
alter table public.jp_applications enable row level security;
alter table public.jp_usage_counters enable row level security;
-- companies + postings readable by authenticated users; writes via service role only

create policy users_self on public.jp_users for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self on public.jp_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy scores_self on public.jp_scores for select using (
  profile_id in (select id from public.jp_profiles where user_id = auth.uid())
);
create policy applications_self on public.jp_applications for all using (
  profile_id in (select id from public.jp_profiles where user_id = auth.uid())
) with check (
  profile_id in (select id from public.jp_profiles where user_id = auth.uid())
);
create policy usage_self on public.jp_usage_counters for select using (user_id = auth.uid());
create policy postings_read on public.jp_postings for select to authenticated using (true);
create policy companies_read on public.jp_companies for select to authenticated using (true);

-- auto-create public.jp_users row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.jp_users (id, email) values (new.id, new.email);
  insert into public.jp_profiles (user_id) values (new.id);
  insert into public.jp_usage_counters (user_id, period_start, tailoring_count, reset_at)
  values (new.id, date_trunc('month', now())::date, 0, (date_trunc('month', now()) + interval '1 month'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: migration applied to linked project. If CLI needs login, use linked project already in `supabase/.temp`.

- [ ] **Step 3: Commit**

```bash
git add supabase/ && git commit -m "feat(db): add JobPilot schema, RLS, and signup trigger"
```

---

### Task 3: Supabase clients + LLM client

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/lib/llm/client.ts`, `src/lib/llm/schemas.ts`
- Test: `tests/unit/llm-schemas.test.ts`

- [ ] **Step 1: Write failing schema tests**

```ts
import { describe, it, expect } from "vitest";
import { ScoreResultSchema, ParsedResumeSchema } from "@/lib/llm/schemas";

describe("ScoreResultSchema", () => {
  it("parses valid score payload", () => {
    const parsed = ScoreResultSchema.parse({
      score: 82,
      rationale: "Strong TypeScript match",
      matched_skills: ["TypeScript"],
      gaps: ["Kubernetes"],
    });
    expect(parsed.score).toBe(82);
  });

  it("rejects score out of range", () => {
    expect(() =>
      ScoreResultSchema.parse({ score: 120, rationale: "x", matched_skills: [], gaps: [] })
    ).toThrow();
  });
});

describe("ParsedResumeSchema", () => {
  it("accepts minimal resume", () => {
    const parsed = ParsedResumeSchema.parse({
      summary: "Engineer",
      skills: ["Go"],
      experience: [],
      education: [],
    });
    expect(parsed.skills).toEqual(["Go"]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/unit/llm-schemas.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement schemas + clients**

`src/lib/llm/schemas.ts`:

```ts
import { z } from "zod";

export const ParsedResumeSchema = z.object({
  summary: z.string().default(""),
  skills: z.array(z.string()).default([]),
  experience: z.array(z.object({
    title: z.string(),
    company: z.string(),
    start: z.string().optional(),
    end: z.string().optional(),
    bullets: z.array(z.string()).default([]),
  })).default([]),
  education: z.array(z.object({
    school: z.string(),
    degree: z.string().optional(),
    year: z.string().optional(),
  })).default([]),
});

export const ScoreResultSchema = z.object({
  score: z.number().min(0).max(100),
  rationale: z.string(),
  matched_skills: z.array(z.string()),
  gaps: z.array(z.string()),
});

export const TailorResultSchema = z.object({
  tailored_resume: ParsedResumeSchema,
  cover_letter: z.string(),
  change_summary: z.string().optional(),
});

export type ParsedResume = z.infer<typeof ParsedResumeSchema>;
export type ScoreResult = z.infer<typeof ScoreResultSchema>;
export type TailorResult = z.infer<typeof TailorResultSchema>;
```

`src/lib/llm/client.ts`:

```ts
import OpenAI from "openai";

export function getLlmClient() {
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
  const baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL;
  if (!apiKey || !baseURL) throw new Error("LLM env not configured");
  return new OpenAI({ apiKey, baseURL });
}

export function getLlmModel() {
  return process.env.OPENAI_COMPATIBLE_MODEL ?? "deepseek-chat";
}
```

Implement browser/server/admin Supabase helpers per latest `@supabase/ssr` Next.js patterns (`createBrowserClient`, `createServerClient` with cookies, `createClient` with service role for cron).

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- tests/unit/llm-schemas.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: add Supabase helpers, LLM client, and Zod schemas"
```

---

### Task 4: Auth (magic link) + app shell

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/auth/callback/route.ts`, `src/app/(app)/layout.tsx`, `src/middleware.ts`, `src/components/AppNav.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Login page** — form collects email, calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: origin + '/auth/callback' } })`, shows “Check your email”.

- [ ] **Step 2: Callback route** — exchange code for session (`exchangeCodeForSession`), redirect to `/matches` or `/onboarding` if profile incomplete (no `resume_parsed.skills` length and no resume URL).

- [ ] **Step 3: Middleware** — refresh session; protect `/(app)/*` routes; redirect unauthenticated users to `/login`.

- [ ] **Step 4: App layout + nav** — Matches, Applications, Profile, Usage links.

- [ ] **Step 5: Manual smoke** — `npm run dev`, request magic link (or use Supabase Inbucket locally if configured). Confirm redirect works.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(auth): magic-link login and protected app shell"
```

---

### Task 5: Profile, resume upload, preferences, onboarding

**Files:**
- Create: `src/app/(app)/onboarding/page.tsx`, `src/app/(app)/profile/page.tsx`, `src/app/api/profile/route.ts`, `src/app/api/profile/resume/route.ts`, `src/lib/profile/parse-resume.ts`
- Test: `tests/unit/parse-resume.test.ts`

- [ ] **Step 1: Failing test for parse helper extracting JSON from LLM content**

```ts
import { describe, it, expect } from "vitest";
import { extractJsonObject } from "@/lib/profile/parse-resume";

describe("extractJsonObject", () => {
  it("parses fenced json", () => {
    const raw = 'Here:\\n```json\\n{"summary":"x","skills":["a"],"experience":[],"education":[]}\\n```';
    expect(extractJsonObject(raw).skills).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Implement `parse-resume.ts`** — read PDF/DOCX text (use `pdf-parse` for PDF; for DOCX use `mammoth`); call LLM with structured extraction prompt; validate with `ParsedResumeSchema`; on failure return empty structure (do not throw past API).

- [ ] **Step 3: `POST /api/profile/resume`** — multipart upload → Storage bucket `jp_resumes/{user_id}/...` → parse → update `jp_profiles.resume_raw_url` + `resume_parsed`. Ensure Storage bucket exists (create via SQL or dashboard in this task).

- [ ] **Step 4: `GET/PUT /api/profile`** — read/update `resume_parsed` + `preferences` (`roles[]`, `locations[]`, `remote_pref`, `salary_floor`, `excluded_industries[]`).

- [ ] **Step 5: Onboarding + Profile UI** — multi-step: upload → edit parsed fields → preferences → continue to Matches.

- [ ] **Step 6: Tests + commit**

```bash
npm test -- tests/unit/parse-resume.test.ts
git commit -am "feat(profile): resume upload, LLM parse, preferences, onboarding"
```

---

### Task 6: Company seed + Greenhouse/Lever ingestion

**Files:**
- Create: `src/lib/ingestion/greenhouse.ts`, `src/lib/ingestion/lever.ts`, `src/lib/ingestion/poll.ts`, `src/app/api/cron/poll-ats/route.ts`, `supabase/seed_companies.sql`
- Test: `tests/unit/ingestion-normalize.test.ts`

- [ ] **Step 1: Normalize unit tests** — map Greenhouse job JSON and Lever posting JSON into a shared `NormalizedPosting` type (`external_id`, `title`, `location`, `description_raw`, `apply_url`, `posted_at`).

- [ ] **Step 2: Implement fetchers**

Greenhouse: `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`  
Lever: `GET https://api.lever.co/v0/postings/{slug}?mode=json`  

Use `User-Agent: JobPilotBot/0.1 (+https://jobpilot.local)` and timeout 15s. Catch 404/429 per company; increment `consecutive_failures`; deactivate after 5 failures.

- [ ] **Step 3: `pollCompanies(adminClient)`** — iterate active companies (batch of 25), upsert postings on `(ats_source, external_id)`, bump `last_seen_at`, set `is_active=false` for postings not seen in this company's poll round when previously active (optional MVP: only upsert, freshness cleanup in same function).

- [ ] **Step 4: Cron route** — `POST /api/cron/poll-ats` checks `Authorization: Bearer ${CRON_SECRET}`, uses admin client, returns `{ polled, upserted, errors }`.

- [ ] **Step 5: Seed 30–50 known public boards** (e.g. greenhouse: `airbnb`, `stripe`, `gitlab`; lever: `netflix`, etc. — verify slugs resolve before seeding). File: `supabase/seed_companies.sql`. Apply via `psql` or Supabase SQL editor.

- [ ] **Step 6: Manual run with secret; commit**

```bash
git commit -am "feat(ingestion): Greenhouse/Lever poller, company seed, cron route"
```

---

### Task 7: Scoring pipeline

**Files:**
- Create: `src/lib/scoring/score.ts`, `src/app/api/cron/score/route.ts`, `src/app/api/postings/route.ts`, `src/app/api/postings/[id]/route.ts`, `src/app/(app)/matches/page.tsx`
- Test: `tests/unit/scoring-prompt.test.ts` (prompt builder / threshold filter)

- [ ] **Step 1: `scorePair(profile, posting)`** — LLM with JSON schema instructions; validate `ScoreResultSchema`; upsert `jp_scores`. Never re-score if row exists unless `force`.

- [ ] **Step 2: Cron `/api/cron/score`** — for each active profile × recent active postings missing scores, score up to N per run (e.g. 50) to control cost.

- [ ] **Step 3: `GET /api/postings?min_score=70`** — join scores for current user's profile; return list.

- [ ] **Step 4: Matches page** — cards with company, title, score, rationale snippet, Tailor button (creates application shell or navigates to tailor API).

- [ ] **Step 5: Tests + commit**

```bash
git commit -am "feat(scoring): LLM fit scores, cron batch, matches UI"
```

---

### Task 8: Quota + billing adapters

**Files:**
- Create: `src/lib/billing/quota.ts`, `src/lib/billing/stripe.ts`, `src/app/api/usage/route.ts`, `src/app/api/billing/portal/route.ts`, `src/app/api/webhooks/stripe/route.ts`, `src/app/(app)/usage/page.tsx`
- Test: `tests/unit/quota.test.ts`

- [ ] **Step 1: Failing quota tests**

```ts
import { describe, it, expect } from "vitest";
import { canTailor, FREE_MONTHLY_LIMIT } from "@/lib/billing/quota";

describe("canTailor", () => {
  it("allows free user under limit", () => {
    expect(canTailor({ tier: "free", tailoring_count: 4 })).toBe(true);
  });
  it("blocks free user at limit", () => {
    expect(canTailor({ tier: "free", tailoring_count: FREE_MONTHLY_LIMIT })).toBe(false);
  });
  it("allows pro always", () => {
    expect(canTailor({ tier: "pro", tailoring_count: 999 })).toBe(true);
  });
});
```

- [ ] **Step 2: Implement quota** — `FREE_MONTHLY_LIMIT = 5`; reset period if `now >= reset_at`; `incrementTailoring(adminOrUserClient, userId)`.

- [ ] **Step 3: Stripe adapter**

```ts
export interface BillingPortal {
  createPortalUrl(userId: string): Promise<string>;
}
export function getBilling(): BillingPortal {
  if (process.env.BILLING_MODE === "live") return liveStripeBilling();
  return {
    async createPortalUrl() {
      return "/usage?mockUpgrade=1";
    },
  };
}
```

Webhook route no-ops in mock mode; in live mode updates `subscription_tier`.

- [ ] **Step 4: Usage page** — show count/limit, Upgrade button → portal URL.

- [ ] **Step 5: Tests + commit**

```bash
npm test -- tests/unit/quota.test.ts
git commit -am "feat(billing): quota enforcement and mock Stripe portal"
```

---

### Task 9: Tailoring + review UI

**Files:**
- Create: `src/lib/tailoring/tailor.ts`, `src/app/api/applications/[id]/tailor/route.ts`, `src/app/api/applications/[id]/regenerate/route.ts`, `src/app/(app)/applications/[id]/page.tsx`
- Test: `tests/unit/tailor-guardrails.test.ts` (prompt includes no-fabrication instruction — assert prompt builder includes guardrail string)

- [ ] **Step 1: `tailorApplication`** — load profile + posting + score; check quota; LLM → `TailorResultSchema`; save `tailored_resume`, `tailored_cover_letter`; set status `reviewing`; append status_history; increment usage.

- [ ] **Step 2: Regenerate** — same with free-text instruction; does not double-charge if regenerating same application in-period (MVP: regenerate free after first paid tailor; document in code comment).

- [ ] **Step 3: Review UI** — side-by-side / section list of original vs tailored; cover letter textarea; Regenerate input; Approve → status stays `reviewing` until user marks Applied (or Approve sets ready — per spec: Approve then user marks Applied). Implement: Approve keeps materials; primary CTA “Mark Applied” sets `applied` + `applied_at`.

- [ ] **Step 4: Ensure Tailor from Matches creates application row (`discovered`/`reviewing`) then runs tailor.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(tailoring): LLM drafts, regenerate, and review UI"
```

---

### Task 10: Applications list API + Kanban tracker

**Files:**
- Create: `src/lib/applications/status.ts`, `src/app/api/applications/route.ts`, `src/app/api/applications/[id]/route.ts`, `src/app/(app)/applications/page.tsx`
- Test: `tests/unit/status-machine.test.ts`

- [ ] **Step 1: Status helper**

```ts
const ALLOWED: Record<string, string[]> = {
  discovered: ["reviewing", "archived"],
  reviewing: ["applied", "archived"],
  applied: ["screening", "rejected", "archived"],
  screening: ["interview", "rejected", "archived"],
  interview: ["offer", "rejected", "archived"],
  offer: ["archived"],
  rejected: ["archived"],
  archived: [],
};

export function assertTransition(from: string, to: string) {
  if (!ALLOWED[from]?.includes(to)) throw new Error(`Invalid transition ${from} -> ${to}`);
}
```

- [ ] **Step 2: PATCH `/api/applications/:id`** — status + notes; append `{status, timestamp}` to history.

- [ ] **Step 3: Kanban page** — columns for major statuses; cards link to review detail; drag optional (buttons to move status OK for MVP).

- [ ] **Step 4: Tests + commit**

```bash
npm test -- tests/unit/status-machine.test.ts
git commit -am "feat(applications): status machine and Kanban tracker"
```

---

### Task 11: Weekly digest (mock email)

**Files:**
- Create: `src/lib/notifications/email.ts`, `src/lib/notifications/digest.ts`, `src/app/api/cron/digest/route.ts`
- Test: `tests/unit/digest.test.ts`

- [ ] **Step 1: Email adapter** — `sendEmail({to,subject,html})`; mock logs to console / returns `{ mocked: true }`; live uses Resend if `EMAIL_MODE=live`.

- [ ] **Step 2: `buildDigestForUser`** — new high-fit scores this week, applications in `reviewing`, quota remaining.

- [ ] **Step 3: Cron `/api/cron/digest`** — iterate users with profiles; send digest.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(notifications): weekly digest with mock email adapter"
```

---

### Task 12: Polish, empty states, delete affordance, README

**Files:**
- Modify: UI pages for loading/empty/error states
- Create: `README.md`, `src/app/api/account/delete/route.ts` (basic cascade via deleting auth user or service-role cleanup)

- [ ] **Step 1: Empty states** — no matches, no applications, onboarding incomplete banners.

- [ ] **Step 2: Account delete** — authenticated endpoint that deletes Storage objects + relies on FK cascade / auth admin delete.

- [ ] **Step 3: README** — setup (`.env.local`, `supabase db push`, seed, cron secrets, `npm run dev`), architecture pointer to design spec.

- [ ] **Step 4: Full test suite + build**

```bash
npm test && npm run build
```

Expected: all pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git commit -am "docs: README and MVP polish (empty states, account delete)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Magic-link auth | 4 |
| Resume parse + preferences | 5 |
| Greenhouse + Lever ingestion | 6 |
| Scoring + threshold Matches | 7 |
| Tailoring + review + regenerate | 9 |
| Kanban tracker | 10 |
| Billing/quota (mock Stripe) | 8 |
| Weekly digest (mock email) | 11 |
| Modular lib boundaries | 3, 6–11 |
| RLS / schema | 2 |
| Error/quota/ATS isolation | 6, 8, 9 |
| Unit + smoke path | tests in 3,5,6,7,8,10,11 + Task 12 build |

---

## Execution notes

- Prefer `BILLING_MODE=mock` and `EMAIL_MODE=mock` until keys exist.
- Map existing provider keys in `.env` into `OPENAI_COMPATIBLE_*` in `.env.local`.
- Do not commit `.env` / `.env.local`.
- Cron: secure with `CRON_SECRET`; schedule via Vercel Cron or Supabase `pg_cron` + `net.http_post` in a follow-up if needed — for MVP, documented manual/curl triggers are acceptable until hosting cron is wired in Task 12 README.
