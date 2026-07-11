# JobPilot

JobPilot is an AI career-operations pipeline: upload a resume, set preferences, and get Greenhouse/Lever postings scored against your profile. Tailor applications with human review, track them on a Kanban board, and receive a weekly digest — with mock billing and email adapters so you can run the full MVP without Stripe or Resend keys.

## Setup

**Requirements:** Node.js 20+ (recommended).

1. Copy env template and fill values:

```bash
cp .env.example .env.local
```

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same |
| `SUPABASE_SERVICE_ROLE_KEY` | same (server-only; never expose to the browser) |
| `OPENAI_COMPATIBLE_BASE_URL` | OpenAI-compatible provider base URL (e.g. DeepSeek) |
| `OPENAI_COMPATIBLE_API_KEY` | provider API key |
| `OPENAI_COMPATIBLE_MODEL` | model id |
| `CRON_SECRET` | any long random string; required for cron routes |
| `BILLING_MODE` | `mock` (default) or `live` |
| `EMAIL_MODE` | `mock` (default) or `live` |
| `STRIPE_*` / `RESEND_*` | only needed when the matching mode is `live` |

2. Install and apply schema:

```bash
npm install
npx supabase db push
```

If this repo is already linked to your Supabase project and the migration `supabase/migrations/20260711000000_init.sql` has been applied, `db push` may report nothing new — that is fine.

3. Seed ATS companies (optional but recommended for local demos):

```bash
# via Supabase SQL editor, or:
psql "$DATABASE_URL" -f supabase/seed_companies.sql
```

4. Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with a magic link from Supabase Auth.

## Cron endpoints

Secure with `Authorization: Bearer $CRON_SECRET` (or header `x-cron-secret`).

```bash
export CRON_SECRET=your-secret
export BASE=http://localhost:3000

curl -X POST "$BASE/api/cron/poll-ats" \
  -H "Authorization: Bearer $CRON_SECRET"

curl -X POST "$BASE/api/cron/score" \
  -H "Authorization: Bearer $CRON_SECRET"

curl -X POST "$BASE/api/cron/digest" \
  -H "Authorization: Bearer $CRON_SECRET"
```

| Route | Role |
|---|---|
| `POST /api/cron/poll-ats` | Ingest Greenhouse + Lever postings |
| `POST /api/cron/score` | Score unscored profile × posting pairs |
| `POST /api/cron/digest` | Send weekly digests (mock or Resend) |

## Mock billing & email

- **`BILLING_MODE=mock`** — upgrade portal returns a local mock success URL; no Stripe charges. Set `live` and provide `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` for real Stripe.
- **`EMAIL_MODE=mock`** — digest emails log to the server console and return `{ mocked: true }`. Set `live` with `RESEND_API_KEY` and `EMAIL_FROM` for real delivery.

## Architecture

Design decisions and module boundaries:

- Spec: [`docs/superpowers/specs/2026-07-11-jobpilot-design.md`](docs/superpowers/specs/2026-07-11-jobpilot-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-07-11-jobpilot-mvp.md`](docs/superpowers/plans/2026-07-11-jobpilot-mvp.md)

Core libraries live under `src/lib/` (`ingestion`, `scoring`, `tailoring`, `applications`, `billing`, `notifications`, `llm`, `profile`).

## Scripts

```bash
npm run dev    # Next.js dev server (Turbopack)
npm test       # Vitest unit tests
npm run build  # production build
```

## Account deletion

Authenticated users can delete their account from **Profile → Danger zone**, which calls `DELETE /api/account/delete`. That endpoint removes Storage objects under `resumes/{user_id}/` and deletes the auth user (cascading `public.users` and related rows via FK).
