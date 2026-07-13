#!/usr/bin/env node
// ─── screenshot-with-auth.mjs (FIXED v2 — cookie-injection) ──────────────
// Pipeline: Admin API → REST session → cookie injection → screenshots → README
//
// Usage:
//   node --env-file=.env.local scripts/screenshot-with-auth.mjs
//
// FIX: Instead of navigating to the hash-based magic link URL (which requires
//      client-side JS to process), we:
//   1. Get email OTP via Supabase admin API (no email sent)
//   2. Exchange OTP for session via Supabase REST /auth/v1/verify
//   3. Inject the session cookie directly into Playwright's browser context
//   4. This works because @supabase/ssr reads the session from cookies
//
// If REST API fails or login verification fails → STOP immediately.
// ───────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ── Config ────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP_URL = "http://localhost:3000";
const OUTPUT_DIR = path.resolve(PROJECT_ROOT, "screenshots");
const VIEWPORT = { width: 1440, height: 900 };

const PROJECT_REF = SUPABASE_URL
  ? new URL(SUPABASE_URL).hostname.split(".")[0]
  : null;

const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

// All routes to screenshot (in navigation order)
const ROUTES = [
  { path: "/",          name: "home" },
  { path: "/login",     name: "login" },
  { path: "/matches",   name: "matches" },
  { path: "/applications", name: "applications" },
  { path: "/profile",   name: "profile" },
  { path: "/onboarding", name: "onboarding" },
  { path: "/usage",     name: "usage" },
];

// ── Helpers ───────────────────────────────────────────────────────────────
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function titleCase(slug) {
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Step 1: Get session from Supabase REST API (no email sent) ──────────
async function getSessionFromAPI() {
  console.log("=".repeat(50));
  console.log("  STEP 1: Get session via Supabase REST API");
  console.log("=".repeat(50));

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    console.error("\n  ❌ Missing SUPABASE env vars.");
    console.error("     Run with: node --env-file=.env.local scripts/screenshot-with-auth.mjs\n");
    return null;
  }

  // 1a. Generate OTP token via admin API (no email sent)
  console.log("  Generating OTP for jxjwilliam@gmail.com...");

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: "jxjwilliam@gmail.com",
  });

  if (linkError) {
    console.error(`\n  ❌ Admin API error: ${linkError.message}\n`);
    return null;
  }

  const emailOtp = linkData?.properties?.email_otp;
  if (!emailOtp) {
    console.error("\n  ❌ No email_otp returned from admin API.\n");
    return null;
  }

  console.log(`  OTP generated: ${emailOtp}`);

  // 1b. Exchange OTP for session via REST API
  console.log("  Exchanging OTP for session via REST /auth/v1/verify...");

  const resp = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "APIKey": ANON_KEY,
    },
    body: JSON.stringify({
      email: "jxjwilliam@gmail.com",
      token: emailOtp,
      type: "magiclink",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`\n  ❌ Verify API failed (${resp.status}): ${text}\n`);
    return null;
  }

  const session = await resp.json();
  console.log(`  ✅ Session obtained for user: ${session.user?.email || "unknown"}`);

  return session;
}

// ── Step 2: Set cookie and verify login ────────────────────────────────
async function loginWithCookie(session) {
  console.log("\n" + "=".repeat(50));
  console.log("  STEP 2: Inject session cookie and verify login");
  console.log("=".repeat(50));

  const cookieValue = JSON.stringify(session);
  console.log(`  Cookie: ${COOKIE_NAME}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  try {
    // First visit the domain to establish it
    console.log("  Visiting localhost to set domain...");
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 10000 });

    // Set the session cookie (raw JSON — @supabase/ssr handles both raw and base64url)
    await context.addCookies([{
      name: COOKIE_NAME,
      value: cookieValue,
      domain: "localhost",
      path: "/",
    }]);

    // Verify cookie was set
    const cookies = await context.cookies();
    const authCookie = cookies.find(c => c.name === COOKIE_NAME);
    if (!authCookie) {
      throw new Error("Failed to set auth cookie");
    }
    console.log("  ✅ Cookie set successfully");

    // Navigate to protected page to verify login
    console.log("  Verifying: navigating to /matches...");
    await page.goto(`${APP_URL}/matches`, {
      waitUntil: "networkidle",
      timeout: 20000,
    });

    const currentUrl = page.url();

    if (currentUrl.includes("/login")) {
      console.error(`\n  ❌ LOGIN FAILED — redirected to /login.`);
      console.error("     The session cookie was not accepted by the server.");
      console.error("     Stopping. No screenshots taken.\n");
      await browser.close();
      return { success: false, browser: null, page: null };
    }

    console.log(`  ✅ Login verified — on: ${currentUrl}`);
    return { success: true, browser, page };

  } catch (err) {
    console.error(`\n  ❌ Login error: ${err.message}\n`);
    await browser.close();
    return { success: false, browser: null, page: null };
  }
}

// ── Step 3: Screenshots ───────────────────────────────────────────────
async function captureScreenshots(page) {
  console.log("\n" + "=".repeat(50));
  console.log("  STEP 3: Capture screenshots");
  console.log("=".repeat(50));

  ensureDir(OUTPUT_DIR);
  const results = [];

  for (const route of ROUTES) {
    const filePath = path.join(OUTPUT_DIR, `${route.name}.png`);
    const url = `${APP_URL}${route.path}`;

    process.stdout.write(`  📸 [${route.name}] ${url} ... `);

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await sleep(1500);

      // Dismiss overlays/toasts
      await page.evaluate(() => {
        document.querySelectorAll('[role="alert"], .toast, .notification, [class*="toast"], [class*="overlay"]')
          .forEach((el) => el.remove());
      });

      await page.screenshot({ path: filePath, fullPage: false });
      console.log("✅");
      results.push({ name: route.name, file: path.relative(PROJECT_ROOT, filePath), status: "ok" });
    } catch (err) {
      console.log(`❌ ${err.message}`);
      results.push({ name: route.name, file: path.relative(PROJECT_ROOT, filePath), status: "error", error: err.message });
      try { await page.screenshot({ path: filePath, fullPage: false }); } catch {}
    }
  }

  return results;
}

// ── Step 4: Inject README ─────────────────────────────────────────────
function buildScreenshotMarkdown(results) {
  const ok = results.filter((r) => r.status === "ok");
  if (ok.length === 0) return "";

  const cols = ok.length >= 3 ? 3 : ok.length;
  const chunk = (arr, n) =>
    Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  const groups = chunk(ok, cols);

  const lines = ["## Screenshots", ""];

  for (const group of groups) {
    const header = "| " + group.map((r) => titleCase(r.name)).join(" | ") + " |";
    const sep    = "| " + group.map(() => "---").join(" | ") + " |";
    const images = "| " + group.map((r) => `![${titleCase(r.name)}](screenshots/${r.name}.png)`).join(" | ") + " |";
    lines.push(header, sep, images, "");
  }

  return lines.join("\n");
}

function injectReadme(readmePath, markdownBlock) {
  if (!fs.existsSync(readmePath)) {
    console.log(`  ℹ️  README not found at ${readmePath} — skipping`);
    return;
  }

  let content = fs.readFileSync(readmePath, "utf8");
  const startMarker = "<!-- screenshots -->";
  const endMarker   = "<!-- /screenshots -->";

  const block = `${startMarker}\n${markdownBlock}\n${endMarker}`;

  if (content.includes(startMarker) && content.includes(endMarker)) {
    const re = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, "g");
    content = content.replace(re, block);
    console.log(`  ✏️  Updated <!-- screenshots --> block in ${path.basename(readmePath)}`);
  } else if (content.includes(startMarker)) {
    content = content.replace(startMarker, block);
    console.log(`  ✏️  Replaced <!-- screenshots --> marker in ${path.basename(readmePath)}`);
  } else {
    content = content.trimEnd() + "\n\n" + block + "\n";
    console.log(`  ✏️  Appended ## Screenshots to ${path.basename(readmePath)}`);
  }

  fs.writeFileSync(readmePath, content, "utf8");
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🚀  JobPilot Screenshot Pipeline (cookie-injection)\n");

  // Phase 1: Get session via REST API
  const session = await getSessionFromAPI();
  if (!session) {
    console.log("\n❌  ABORTED — Could not obtain session. No screenshots taken.\n");
    process.exit(1);
  }

  // Phase 2: Inject cookie and verify login
  const loginResult = await loginWithCookie(session);
  if (!loginResult.success) {
    console.log("\n❌  ABORTED — Login verification failed. No screenshots taken.\n");
    process.exit(1);
  }

  const { browser, page } = loginResult;

  try {
    // Phase 3: Take screenshots
    const results = await captureScreenshots(page);

    const ok  = results.filter((r) => r.status === "ok").length;
    const err = results.filter((r) => r.status === "error").length;
    console.log(`\n  📊 Summary: ${ok} captured, ${err} failed\n`);

    if (ok === 0) {
      console.log("❌  No screenshots captured successfully. Skipping README injection.\n");
      process.exit(1);
    }

    // Phase 4: Inject into READMEs
    console.log("=".repeat(50));
    console.log("  STEP 4: Inject into README");
    console.log("=".repeat(50));

    const mdBlock = buildScreenshotMarkdown(results);

    if (mdBlock) {
      injectReadme(path.join(PROJECT_ROOT, "README.md"), mdBlock);
      injectReadme(path.join(PROJECT_ROOT, "README-zh.md"), mdBlock);
    }

    console.log("\n" + "=".repeat(50));
    console.log("  ✅  COMPLETE");
    console.log("=".repeat(50));
    console.log(`  📁 Screenshots: ${OUTPUT_DIR}/`);
    console.log(`  📝 README.md   injected`);
    console.log(`  📝 README-zh.md injected`);
    console.log();

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\n❌  Fatal error:", err.message);
  process.exit(1);
});
