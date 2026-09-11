# Playwright Screenshot Automation — Signing In Without Email

**Status:** Guide · **Applies to:** JobPilot (Supabase Auth + fixed-credential password login) · **Last updated:** 2026-09-10

The working implementation is [`scripts/screenshot-with-auth.mjs`](../scripts/screenshot-with-auth.mjs). This doc explains how it authenticates and how to adapt the same pattern elsewhere.

---

## Table of Contents

1. [Why the script mints its own session](#1-why-the-script-mints-its-own-session)
2. [How auth works now](#2-how-auth-works-now)
3. [The approach: admin API → sessionStorage injection](#3-the-approach-admin-api--sessionstorage-injection)
4. [Inside `scripts/screenshot-with-auth.mjs`](#4-inside-scriptsscreenshot-with-authmjs)
5. [Running it](#5-running-it)
6. [Integration with the screenshot-ui skill](#6-integration-with-the-screenshot-ui-skill)
7. [Alternative: drive the real password form](#7-alternative-drive-the-real-password-form)
8. [Troubleshooting](#8-troubleshooting)
9. [Reference](#9-reference)

---

## 1. Why the script mints its own session

The app has exactly one login path: the fixed-credential form at `/login`, which posts to
`POST /api/auth/password-login`. A headless screenshot run should not embed or type the
owner's password, so instead the script mints a real Supabase session server-side with the
**service-role key** and injects it into the browser. No email is sent, no rate limit is
consumed, and the password never appears in a script.

This doc used to be about dodging Supabase's magic-link email rate limit (2 emails/hour on
the free tier). Magic-link is no longer the login path, but the same admin-API trick is
still what makes headless auth reliable.

---

## 2. How auth works now

```
┌──────────┐  email+password  ┌──────────────────────────┐
│  /login  │─────────────────▶│ POST /api/auth/password-login │
└──────────┘                  └────────────┬─────────────┘
                                           │ credentials match
                                           ▼
                               ┌──────────────────────────┐
                               │ mintSessionForEmail()    │
                               │  admin createUser        │
                               │  generateLink(magiclink) │
                               │  POST /auth/v1/verify    │
                               └────────────┬─────────────┘
                                            │ Session
                                            ▼
                               ┌──────────────────────────┐
                               │ supabase.auth.setSession │
                               │ → sessionStorage         │
                               └──────────────────────────┘
```

Key points:

- **Single-tenant gate.** `APP_LOGIN_EMAIL` / `APP_LOGIN_PASSWORD` are compared with a
  constant-time hash comparison; failures are throttled (10 attempts per IP per 5 minutes,
  per serverless instance). Self-serve signup is gone, and `jp_restrict_signups` rejects new
  `auth.users` rows outside the allowlist.
- **The server mints a normal Supabase session.** `mintSessionForEmail()`
  (`src/lib/auth/mint-session.ts`) creates the user if missing (confirmed, no email), calls
  `supabase.auth.admin.generateLink({ type: "magiclink" })` to get a 6-digit `email_otp`, then
  exchanges it at `POST {SUPABASE_URL}/auth/v1/verify` for `access_token` / `refresh_token`.
- **The session lives in `sessionStorage`.** The browser client
  (`src/lib/supabase/client.ts`) sets `storage: window.sessionStorage`, so the session is
  **per browser tab** — it survives reloads and in-app navigation but is dropped when the tab
  closes. Cookies are never used, which keeps the app working inside cross-origin iframes.
- **API routes read a Bearer token.** `getSessionUser(request)` resolves the user from the
  `Authorization: Bearer <access_token>` header attached by `apiFetch()`. Route protection is
  client-side in `src/app/(app)/layout.tsx`; there is no middleware.

---

## 3. The approach: admin API → sessionStorage injection

1. Derive the project ref from `NEXT_PUBLIC_SUPABASE_URL` (the first hostname label).
2. Ask the Admin API for a magic-link OTP: `supabase.auth.admin.generateLink({ type: "magiclink", email })`
   — **no email is sent**.
3. Exchange the OTP for a session over REST:
   `POST {SUPABASE_URL}/auth/v1/verify` with `{ email, token: email_otp, type: "magiclink" }`
   and the public anon key in the `APIKey` header.
4. Open the app once to establish the origin, then write the session JSON into
   `sessionStorage` under `sb-<project_ref>-auth-token` **in the same tab**, and only then
   navigate to a protected page (`/matches`). The `@supabase/supabase-js` client picks it up
   exactly like a session created by the login form.
5. If any step fails — or `/matches` redirects to `/login` — abort without taking screenshots.

> **Do not use Playwright `storageState` for this.** `storageState` saves cookies and
> `localStorage` only; it cannot capture `sessionStorage`. A saved `auth-state.json` will
> **not** restore login for this app. Inject the session on every run.

---

## 4. Inside `scripts/screenshot-with-auth.mjs`

Configuration:

```javascript
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP_URL = process.env.APP_URL ?? "http://localhost:5200";

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;
```

The pipeline, step by step:

| Step | What it does |
|---|---|
| 1. `getSessionFromAPI()` | `admin.generateLink({ type: "magiclink" })` → `email_otp` → `POST /auth/v1/verify` → session JSON |
| 2. `loginWithSession()` | `page.goto(APP_URL)` → `sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))` → navigate to `/matches` → abort if redirected to `/login` |
| 3. `captureScreenshots()` | Visits 7 routes at 1440×900, waits 1.5s, removes toasts/alerts, writes `screenshots/<name>.png` |
| 4. `injectReadme()` | Replaces the `<!-- screenshots -->…<!-- /screenshots -->` block in `README.md` and `README-zh.md` |

The 7 captured routes: `/` (home), `/login`, `/matches`, `/applications`, `/profile`,
`/onboarding`, `/usage`.

---

## 5. Running it

```bash
# Terminal 1 — dev server (requires PLAYWRIGHT devDependency + npx playwright install chromium once)
npm run dev

# Terminal 2 — requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#              NEXT_PUBLIC_SUPABASE_ANON_KEY, APP_URL (optional, default :5200)
node --env-file=.env.local scripts/screenshot-with-auth.mjs
```

Expected output (abridged):

```
🚀  JobPilot Screenshot Pipeline (sessionStorage-injection)

  STEP 1: Get session via Supabase REST API
  Generating OTP for jxjwilliam@gmail.com...
  ✅ Session obtained for user: jxjwilliam@gmail.com

  STEP 2: Inject session into sessionStorage and verify login
  ✅ Session stored in sessionStorage
  ✅ Login verified — on: http://localhost:5200/matches

  STEP 3: Capture screenshots
  📸 [home] http://localhost:5200/ ... ✅
  ...
```

Side effects: PNGs under `screenshots/` and a refreshed screenshot table in `README.md` /
`README-zh.md`. If login cannot be established the script exits with code 1 and takes no
screenshots.

---

## 6. Integration with the screenshot-ui skill

The `screenshot-ui` skill drives this script for auth-protected apps:

1. Start the dev server on port 5200.
2. Run `node --env-file=.env.local scripts/screenshot-with-auth.mjs`.
3. The script authenticates, captures all routes, and updates the README markers.
4. `/demo-video` can then reuse the same PNGs — see
   [`05-screenshot-demo-pipeline.md`](./05-screenshot-demo-pipeline.md).

No `loginDelaySeconds` or manual browser step is needed, because the session is injected
before the first protected navigation.

---

## 7. Alternative: drive the real password form

Because the login page is now a real email + password form, Playwright *can* log in directly:

```javascript
await page.goto(`${APP_URL}/login`);
await page.fill('input[type="email"]', process.env.APP_LOGIN_EMAIL);
await page.fill('input[type="password"]', process.env.APP_LOGIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((url) => !url.pathname.startsWith("/login"));
```

This works inside a single browser context (the session lands in that tab's `sessionStorage`),
but it requires putting `APP_LOGIN_EMAIL` / `APP_LOGIN_PASSWORD` into the screenshot
environment. The admin-API injection in §3 is preferred because the password never leaves the
server-side login route.

---

## 8. Troubleshooting

### "Missing SUPABASE env vars"

Run the script with `node --env-file=.env.local …`, and make sure all three of
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
are set.

### `generateLink` or `/auth/v1/verify` fails (403 / "Failed to generate session token")

`generateLink` on an **unknown** user returns a signup-type OTP that `/auth/v1/verify` rejects.
The owner account must already exist. Sign in once through `/login` (which runs
`mintSessionForEmail()` → `admin.createUser()`), or add an explicit `createUser` call to the
script like `src/lib/auth/mint-session.ts` does.

### Redirected to `/login` after injection

The session key or origin doesn't match. Check that:

- you injected **after** `page.goto(APP_URL)` in the same tab/page;
- the key is `sb-<project_ref>-auth-token`, where `<project_ref>` comes from your Supabase URL;
- `APP_URL` points at the same origin the app is served from (default `http://localhost:5200`).

### 401s appear after roughly an hour

Supabase access tokens live 3600 seconds. The script mints a fresh session on every run, so
just re-run it; there is nothing to refresh manually.

### Wrong port / "connection refused"

Set `APP_URL=http://localhost:<port> node --env-file=.env.local scripts/screenshot-with-auth.mjs`,
or start the dev server with `npm run dev` (port 5200).

### Does the admin API hit email rate limits?

No — `generateLink` sends no email. If you get an error, verify you're using
`SUPABASE_SERVICE_ROLE_KEY` (not the anon key) for the admin client.

---

## 9. Reference

| Code file | Purpose |
|---|---|
| `src/app/(auth)/login/page.tsx` | Password login form (nothing prefilled) |
| `src/app/api/auth/password-login/route.ts` | Constant-time credential check + throttle; returns a minted session |
| `src/lib/auth/mint-session.ts` | Creates the user if needed and exchanges an admin OTP for a session |
| `src/lib/supabase/client.ts` | Browser client — `sessionStorage`, PKCE, iframe-safe |
| `src/lib/supabase/server.ts` | `getSessionUser()` — Bearer-token auth for API routes |
| `src/lib/supabase/admin.ts` | Admin client (service-role key) |
| `scripts/screenshot-with-auth.mjs` | Session injection + 7-route screenshot pipeline |

**Related:** [`03-jobpilot-workflow.md`](./03-jobpilot-workflow.md) (runtime auth flow) ·
[`05-screenshot-demo-pipeline.md`](./05-screenshot-demo-pipeline.md) (screenshots → demo video)
