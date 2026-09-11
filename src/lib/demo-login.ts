import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign in as the demo user. The server mints a session (no email, no OTP
 * entry); storing it via setSession puts it in the same origin-scoped
 * sessionStorage used by magic-link sign-in, so it works inside iframes too.
 */
export async function demoSignIn(): Promise<void> {
  const res = await fetch("/api/demo/login", { method: "POST" });
  const data = (await res.json().catch(() => ({}))) as {
    session?: Session;
    error?: string;
  };
  if (!res.ok || !data.session) {
    throw new Error(data.error ?? "Demo login failed");
  }

  const supabase = createClient();
  const { error } = await supabase.auth.setSession(data.session);
  if (error) throw error;
}
