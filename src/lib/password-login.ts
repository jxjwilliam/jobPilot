import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign in with the fixed owner credentials. The server verifies them and mints
 * a session; storing it with `setSession` puts it in the same origin-scoped
 * localStorage used by the rest of the app, so it works inside iframes too.
 */
export async function passwordSignIn(
  email: string,
  password: string
): Promise<void> {
  const res = await fetch("/api/auth/password-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    session?: Session;
    error?: string;
  };
  if (!res.ok || !data.session) {
    throw new Error(data.error ?? "Sign in failed");
  }

  const supabase = createClient();
  const { error } = await supabase.auth.setSession(data.session);
  if (error) throw error;
}
