import type { Session } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mint a real Supabase session for an allowlisted email without sending mail.
 *
 * Used by the password gate (/api/auth/password-login) and the optional demo
 * login. The email is created (confirmed, no email sent) if missing, then a
 * magic-link OTP is generated with the admin API and exchanged for a session
 * via /auth/v1/verify. The caller stores the session with `setSession()`, so it
 * lands in the same origin-scoped localStorage as a normal sign-in — which is
 * what makes the app work inside cross-origin iframes.
 */
export async function mintSessionForEmail(
  email: string,
  options: { metadata?: Record<string, unknown> } = {}
): Promise<Session> {
  const supabase = createAdminClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase env not configured");
  }

  // Creating the user explicitly (confirmed, no email) matters: generateLink on
  // a *missing* user silently creates one and returns a signup-type OTP, which
  // fails magic-link verification with 403. The signup trigger creates the
  // profile + usage counter.
  // Tolerate "already registered": Supabase's message is "A user with this
  // email address has already been registered" (note the "been"), so match
  // loosely instead of the exact phrase.
  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: options.metadata,
  });
  if (createError && !/already.*registered/i.test(createError.message)) {
    throw new Error(createError.message);
  }

  const { data: link, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !link?.properties?.email_otp) {
    throw new Error(error?.message ?? "Failed to generate session token");
  }

  const resp = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      APIKey: anonKey,
    },
    body: JSON.stringify({
      email,
      token: link.properties.email_otp,
      type: "magiclink",
    }),
  });

  if (!resp.ok) {
    throw new Error(`Session verify failed (${resp.status})`);
  }

  return (await resp.json()) as Session;
}
