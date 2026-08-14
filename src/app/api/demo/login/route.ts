import { NextResponse } from "next/server";
import type { Session } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const DEMO_EMAIL = process.env.DEMO_EMAIL?.trim() || "demo@jobpilot.local";

/**
 * Passwordless demo login — no email is sent and no auth is required.
 *
 * Opt-in via NEXT_PUBLIC_DEMO_MODE=true (do not enable on public production
 * deployments unless you want anyone to be able to sign in as the demo user).
 *
 * Flow: mint a magic-link OTP with the admin API (bypasses the 2/hour email
 * rate limit since no email is sent), then exchange it for a session the same
 * way scripts/screenshot-with-auth.mjs does.
 */
export async function POST() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return NextResponse.json(
      { error: "Demo access is disabled" },
      { status: 404 }
    );
  }

  const supabase = createAdminClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Supabase env not configured" },
      { status: 500 }
    );
  }

  // Ensure the demo user exists. Creating it explicitly (confirmed, no email)
  // is important: generateLink on a *missing* user silently creates one and
  // returns a signup-type OTP, which fails magic-link verification with 403.
  // The signup trigger creates the profile + usage counter.
  // Tolerate "already registered": Supabase's message is "A user with this
  // email address has already been registered" (note the "been"), so match
  // loosely instead of the exact phrase.
  const { error: createError } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    email_confirm: true,
    user_metadata: { demo: true },
  });
  if (createError && !/already.*registered/i.test(createError.message)) {
    return NextResponse.json(
      { error: createError.message },
      { status: 500 }
    );
  }

  // Mint a magic-link OTP for the existing user without sending an email.
  const { data: link, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: DEMO_EMAIL,
  });
  if (error || !link?.properties?.email_otp) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to generate demo token" },
      { status: 500 }
    );
  }

  // Exchange the OTP for a session.
  const resp = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      APIKey: anonKey,
    },
    body: JSON.stringify({
      email: DEMO_EMAIL,
      token: link.properties.email_otp,
      type: "magiclink",
    }),
  });

  if (!resp.ok) {
    return NextResponse.json(
      { error: `Demo verify failed (${resp.status})` },
      { status: 502 }
    );
  }

  const session = (await resp.json()) as Session;
  return NextResponse.json({ session });
}
