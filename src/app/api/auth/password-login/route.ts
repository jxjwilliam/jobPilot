import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { mintSessionForEmail } from "@/lib/auth/mint-session";

/**
 * Fixed-credential login gate.
 *
 * The app is single-tenant: only the owner account may sign in, and the sole
 * entry point is this route. Credentials come from APP_LOGIN_EMAIL /
 * APP_LOGIN_PASSWORD (set them in .env.local; the defaults below are the
 * original hardcoded pair).
 *
 * On a match we mint a normal Supabase session for that email, so RLS, the
 * (app) layout guard, and every API route keep working unchanged — no session
 * cookie is ever needed.
 */

const LOGIN_EMAIL = (
  process.env.APP_LOGIN_EMAIL?.trim() || "jxjwilliam@gmail.com"
).toLowerCase();
const LOGIN_PASSWORD = process.env.APP_LOGIN_PASSWORD || "William1!";

// Best-effort brute-force throttle. Per serverless instance only, which is
// fine for a single-user gate; it just makes guessing the password slow.
const ATTEMPT_WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function isThrottled(key: string): boolean {
  const now = Date.now();
  if (attempts.size > 500) {
    for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
  }
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

/** Constant-time comparison that tolerates different-length inputs. */
function matches(candidate: string, expected: string): boolean {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const key = clientKey(request);
  if (isThrottled(key)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };
    if (typeof body.email === "string") email = body.email.trim().toLowerCase();
    if (typeof body.password === "string") password = body.password;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const emailOk = matches(email, LOGIN_EMAIL);
  const passwordOk = matches(password, LOGIN_PASSWORD);
  if (!emailOk || !passwordOk) {
    recordFailure(key);
    // Small constant delay so failures are not a free oracle.
    await new Promise((resolve) => setTimeout(resolve, 250));
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  attempts.delete(key);

  try {
    const session = await mintSessionForEmail(LOGIN_EMAIL);
    return NextResponse.json({ session });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
