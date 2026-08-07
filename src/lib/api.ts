import { createClient } from "@/lib/supabase/client";

/**
 * fetch() wrapper that attaches the current user's Supabase access token as a
 * Bearer header, so server API routes can resolve the session via
 * getSessionUser() without relying on cookies (which are blocked inside
 * cross-origin iframes).
 */
export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init?.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(path, { ...init, headers });
}
