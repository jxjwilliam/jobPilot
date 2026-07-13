# Playwright Screenshot Automation — Bypassing Supabase Email Rate Limits

**Status:** Guide  
**Applies to:** JobPilot (Supabase magic-link auth)  
**Last updated:** 2026-07-13

---

## Table of Contents

1. [The Problem: Email Rate Limit Exceeded](#1-the-problem-email-rate-limit-exceeded)
2. [How Auth Works in This Project](#2-how-auth-works-in-this-project)
3. [Solution: Admin API Session Injection](#3-solution-admin-api-session-injection)
4. [Setup: One-Time Auth Script](#4-setup-one-time-auth-script)
5. [Reusing the Session for Screenshots](#5-reusing-the-session-for-screenshots)
6. [Integration with Screenshot-UI Skill](#6-integration-with-screenshot-ui-skill)
7. [Alternative: Create a Password-Based Test User](#7-alternative-create-a-password-based-test-user)
8. [Full Pipeline Script](#8-full-pipeline-script)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. The Problem: Email Rate Limit Exceeded

### What it is

Supabase's free-tier auth service imposes **rate limits on OTP / magic link emails**:

| Limit | Value |
|---|---|
| Magic links per email per hour | ~2–5 |
| Cooldown period | ~1 hour |
| Error returned | `429` / `"email rate limit exceeded"` |

### How you trigger it

Every time you click **"Send magic link"** at `http://localhost:3000/login`, the app calls:

```ts
// src/app/(auth)/login/page.tsx — line 22
await supabase.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: `${origin}/auth/callback` },
});
```

If you click it more than 2–5 times in quick succession (very common during development and testing), Supabase blocks further sends from that email.

### Why it breaks Playwright automation

A screenshot script needs to log in to capture auth-protected pages (`/matches`, `/applications`, `/profile`, etc.). The naive approach:

```
Playwright types email → clicks "Send" → ... can't click the magic link in email → stuck.
```

Even if you had email access, each Playwright run would consume a rate-limited slot.


## 2. How Auth Works in This Project

```
┌─────────┐          ┌──────────────┐          ┌───────────┐
│  Login   │ signIn  │   Supabase   │  Email    │  User's   │
│  Page    │ WithOtp │   Auth       │──────────▶│  Inbox    │
│          │────────▶│   Service    │           │           │
│          │         │              │  Magic    │           │
│          │         │              │  Link     │           │
│          │◀────────│  429 blocks  │  Click    │           │
│          │  error  │  if exceeded │──────────▶│           │
└─────────┘         └──────────────┘           └───────────┘
                           │
                           │ redirect to /auth/callback
                           ▼
                    ┌──────────────┐
                    │  exchange    │
                    │  code for    │──▶ session cookie set
                    │  session     │
                    └──────────────┘
```

**Key files:**

| File | Role |
|---|---|
| `src/lib/supabase/client.ts` | Browser client (used by Login page) |
| `src/lib/supabase/server.ts` | Server client (reads cookies from Next.js) |
| `src/lib/supabase/admin.ts` | **Admin client** — uses `SUPABASE_SERVICE_ROLE_KEY`, bypasses all rate limits. This is our escape hatch. |
| `src/app/(auth)/login/page.tsx` | Login UI — calls `signInWithOtp` |
| `src/app/auth/callback/route.ts` | Magic link callback — exchanges code for session |

### The escape hatch

`src/lib/supabase/admin.ts` creates a Supabase client with the **service role key**:

```ts
export function createAdminClient() {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

This client has **admin privileges** — it can generate magic links, create users, and manage sessions **without sending any emails** and **without hitting rate limits**.


## 3. Solution: Admin API Session Injection

The idea is simple:

1. Use the Admin API (`supabase.auth.admin.generateLink()`) to produce a valid magic link URL — **no email is sent**.
2. Have Playwright navigate directly to that URL — this exchanges the code for a session cookie.
3. Now Playwright is authenticated as if it clicked a real magic link.
4. **Save the session** (`storageState`) so all subsequent screenshot runs load instantly without any auth step.

```
┌─────────────┐                  ┌──────────────┐
│  Playwright  │  admin.generate │   Supabase   │
│  Script      │  Link()         │   Admin API  │
│              │────────────────▶│              │
│              │  ← action_link  │              │
│              │                 │              │
│              │  Navigate to    │   Auth        │
│              │  action_link    │   Service     │
│              │────────────────▶│              │
│              │  ← session      │              │
│              │  cookie set     │              │
│              │                 │              │
│              │  Save           │              │
│              │  storageState   │              │
└─────────────┘                  └──────────────┘
```


## 4. Setup: One-Time Auth Script

Create `scripts/setup-auth.mjs`:

```javascript
// scripts/setup-auth.mjs
// Generates a Supabase session without sending any email.
// Usage: node --env-file=.env.local scripts/setup-auth.mjs

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE env vars. Run with: node --env-file=.env.local scripts/setup-auth.mjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Generate a magic link — NO EMAIL SENT, NO RATE LIMIT
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: "jxjwilliam@gmail.com",
  });
  if (error) throw error;

  const actionLink = data.properties?.action_link;
  if (!actionLink) throw new Error("No action_link returned");
  console.log("✓ Magic link generated (no email sent)");

  // 2. Open Playwright and navigate to the link
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(actionLink, { waitUntil: "networkidle" });

  // 3. Verify we're logged in (redirected to /matches or /onboarding)
  const currentUrl = page.url();
  console.log("✓ Redirected to:", currentUrl);

  if (currentUrl.includes("/login") || currentUrl.includes("error")) {
    throw new Error("Login failed — still on login page");
  }

  // 4. Save session for reuse
  await page.context().storageState({ path: "auth-state.json" });
  console.log("✓ Session saved to auth-state.json");

  await browser.close();
  console.log("Done. You can now run screenshot scripts faster.");
}

main().catch((err) => {
  console.error("✗", err);
  process.exit(1);
});
```

**Important:** The `service_role` key is a secret. This script runs locally and never exposes it to the browser.

### Run it once

```bash
node --env-file=.env.local scripts/setup-auth.mjs
```

Expected output:
```
✓ Magic link generated (no email sent)
✓ Redirected to: http://localhost:3000/matches
✓ Session saved to auth-state.json
Done.
```

This creates `auth-state.json` in the project root — the saved authentication state for all future runs.


## 5. Reusing the Session for Screenshots

Now any Playwright script can load the saved session and skip login entirely:

```javascript
// scripts/screenshot-with-auth.mjs
import { chromium } from "playwright";

const APP_URL = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  // Load the pre-saved auth state
  const context = await browser.newContext({
    storageState: "auth-state.json",   // ← the key line
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Already logged in — navigate directly
  const routes = ["/", "/matches", "/applications", "/profile"];
  for (const route of routes) {
    await page.goto(`${APP_URL}${route}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `screenshots/${route.replace("/", "") || "home"}.png` });
    console.log(`  ✓ ${route}`);
  }

  await browser.close();
}

main().catch(console.error);
```

### How it works

When Playwright calls `browser.newContext({ storageState: "auth-state.json" })`, it loads:
- **Cookies** — including the Supabase session cookie (`sb-<project>-auth-token`)
- **Local storage** — any persisted session data

The server-side middleware (`src/middleware.ts`) sees the valid session cookie and lets the request through — exactly as if you'd logged in via the browser.

### When to re-run setup-auth

Re-run `scripts/setup-auth.mjs` when:
- The Supabase session expires (default: 3600 seconds / 1 hour)
- You change the user email
- The `auth-state.json` file is deleted

The generated session is short-lived by Supabase's design, so you'll need to refresh it periodically during long sessions. The script runs in ~3 seconds, so it's fast to re-run.


## 6. Integration with Screenshot-UI Skill

This project has the `screenshot-ui` skill installed. Its base scripts work with auth using two approaches:

### Option A: `loginDelaySeconds` (manual — skip)

The skill's config has a `loginDelaySeconds` option that pauses while you log in manually. Not useful for automation.

### Option B: `storageState` injection (recommended)

Modify the JS screenshot script (`scripts/screenshot.js` from the skill) to load the pre-saved state:

```javascript
// scripts/screenshot.config.js — add a storageState option
export default {
  targets: {
    localhost: "http://localhost:3000",
  },
  run: "localhost",
  outputDir: "screenshots",
  viewport: { width: 1440, height: 900 },
  storageState: "auth-state.json",   // ← load saved session
  manualRoutes: ["/", "/matches", "/applications", "/profile", "/onboarding"],
  // loginDelaySeconds: 0,   // no delay needed
  extraDelayMs: 1500,
};
```

Then in the screenshot script itself, before creating the browser context:

```javascript
// Inside scripts/screenshot.js, when creating context:
const contextOptions = {
  viewport: config.viewport,
};
if (config.storageState) {
  contextOptions.storageState = config.storageState;
}
const context = await browser.newContext(contextOptions);
```

### Option C: Use the skill's Python script with auth

The Python variant (`scripts/screenshot_py.py`) doesn't support `storageState` natively, but you can load cookies from the saved JSON:

```python
import json
from playwright.sync_api import sync_playwright

# Load the auth state
with open("auth-state.json") as f:
    auth_state = json.load(f)

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(
        storage_state=auth_state,
        viewport={"width": 1440, "height": 900}
    )
    # ... proceed with screenshots
```

### End-to-end command

```bash
# 1. Generate auth session (runs once per hour)
node --env-file=.env.local scripts/setup-auth.mjs

# 2. Run screenshot UI script (loads auth-state.json)
node scripts/screenshot.js --target localhost
```


## 7. Alternative: Create a Password-Based Test User

If you prefer email+password login (which Playwright can fill directly), the Admin API can create a test user:

### Create the user (one time)

```javascript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data, error } = await supabase.auth.admin.createUser({
  email: "test@jobpilot.local",
  password: "test123",
  email_confirm: true,                // skip email verification
});
```

### Then login in Playwright

```javascript
await page.goto("http://localhost:3000/login");
await page.fill('input[type="email"]', "test@jobpilot.local");
// You'd need a password field on the login page too...
```

**Downside:** The current login page only has a magic-link (email-only) flow. To use this approach you'd need to either:
1. Add a password field to the login page, or
2. Use a separate API route for password login

The `generateLink()` approach in [§4](#4-setup-one-time-auth-script) is simpler because it works with the existing magic-link-only flow.


## 8. Full Pipeline Script

For convenience, create `scripts/screenshot-all.mjs` that does the full cycle:

```javascript
// scripts/screenshot-all.mjs
// 1. Auth via admin API → 2. Screenshot all routes → 3. Done
// Usage: node --env-file=.env.local scripts/screenshot-all.mjs

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync } from "fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = "http://localhost:3000";
const SCREENSHOT_DIR = "screenshots";

const ROUTES = [
  { path: "/",           name: "home" },
  { path: "/matches",    name: "matches" },
  { path: "/applications", name: "applications" },
  { path: "/profile",    name: "profile" },
  { path: "/onboarding", name: "onboarding" },
];

async function main() {
  if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Step 1: Generate session token (no email)
  console.log("[1/3] Generating auth session...");
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: "jxjwilliam@gmail.com",
  });
  if (error) throw error;
  console.log("  ✓ Magic link generated");

  // Step 2: Launch browser and login
  console.log("[2/3] Logging in and capturing screenshots...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Navigate to the magic link to establish the session
  await page.goto(data.properties.action_link, { waitUntil: "networkidle" });
  console.log(`  ✓ Logged in, at: ${page.url()}`);

  // Step 3: Screenshot each route
  for (const route of ROUTES) {
    await page.goto(`${APP_URL}${route.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000); // let animations complete
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/${route.name}.png`,
      fullPage: false,
    });
    console.log(`  ✓ ${route.path}`);
  }

  await browser.close();
  console.log("[3/3] Done. Screenshots saved to screenshots/");
}

main().catch((err) => {
  console.error("✗", err);
  process.exit(1);
});
```

Run:
```bash
node --env-file=.env.local scripts/screenshot-all.mjs
```


## 9. Troubleshooting

### "action_link is undefined"

The admin `generateLink` response structure depends on your Supabase version. If `data.properties?.action_link` is undefined, try logging the full response to inspect it:

```javascript
const { data } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
console.log(JSON.stringify(data, null, 2));
```

You're looking for a URL that contains something like `?token=xxx&type=magiclink` or `?code=xxx`. Use whichever field holds it.

### Session expires quickly

Supabase access tokens default to **3600 seconds (1 hour)**. If you see 401s after a while, simply re-run the setup script. The full pipeline script in [§8](#8-full-pipeline-script) regenerates the session fresh each run.

### "Email rate limit exceeded" on admin API

The admin API (`generateLink` with `service_role` key) does **not** hit email rate limits because it doesn't send an email. If you get a rate-limit error, check that you're actually using the `SUPABASE_SERVICE_ROLE_KEY` and not the `ANON_KEY`.

### Playwright says "storageState file not found"

Make sure you ran `scripts/setup-auth.mjs` first. The `auth-state.json` file is created in the project root. If you're running scripts from a different working directory, adjust the path:

```javascript
const path = require("path");
const statePath = path.join(process.cwd(), "auth-state.json");
```

### Want a different user?

Change the email in the `generateLink` call. Any email address works — the admin API doesn't require it to exist in Supabase Auth already (it will create the user implicitly).

---

## Reference

| Code file | Purpose |
|---|---|
| `src/lib/supabase/admin.ts` | Admin client with service role key |
| `src/lib/supabase/client.ts` | Browser client (used by Login page) |
| `src/app/(auth)/login/page.tsx` | Login page — calls `signInWithOtp` |
| `src/app/auth/callback/route.ts` | Magic link handler |
| `scripts/setup-auth.mjs` | One-time auth session generator (create this) |
| `scripts/screenshot-all.mjs` | Full pipeline auth + screenshots (create this) |
| `auth-state.json` | Saved Playwright session (generated, do not commit) |

**Related:** `docs/03-jobpilot-workflow.md` — runtime auth flow and sequence diagrams.
