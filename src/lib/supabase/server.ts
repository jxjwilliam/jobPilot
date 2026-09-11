import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

/**
 * Server auth for browser requests.
 *
 * Browser sessions live in sessionStorage (iframe-safe, see client.ts), so the
 * server never sees a session cookie. API routes resolve the user from the
 * `Authorization: Bearer <access_token>` header attached by apiFetch() and
 * run all .from() queries through a client bound to that JWT so RLS applies.
 */
export function getAccessToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  return header.replace(/^Bearer\s+/i, "").trim() || null;
}

export function createAuthedClient(request: NextRequest) {
  const token = getAccessToken(request);
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: token
        ? { headers: { Authorization: `Bearer ${token}` } }
        : {},
    }
  );
}

export async function getSessionUser(request: NextRequest) {
  const accessToken = getAccessToken(request);
  const supabase = createAuthedClient(request);
  if (!accessToken) return { user: null, supabase, accessToken: null };

  const {
    data: { user },
  } = await supabase.auth.getUser(accessToken);

  if (!user) return { user: null, supabase, accessToken };
  return { user, supabase, accessToken };
}
