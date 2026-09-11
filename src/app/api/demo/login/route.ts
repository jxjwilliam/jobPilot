import { NextResponse } from "next/server";
import { mintSessionForEmail } from "@/lib/auth/mint-session";

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

  try {
    const session = await mintSessionForEmail(DEMO_EMAIL, {
      metadata: { demo: true },
    });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Demo login failed",
      },
      { status: 500 }
    );
  }
}
