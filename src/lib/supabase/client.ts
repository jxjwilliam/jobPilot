import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client.
 *
 * Sessions are persisted in localStorage (not cookies) so auth keeps working
 * when the app is embedded in a cross-origin iframe — third-party cookies are
 * blocked by browsers, while localStorage is origin-scoped and iframe-safe.
 * API routes authenticate through the Authorization Bearer header attached by
 * lib/api.ts#apiFetch(), not through cookies.
 */
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "pkce",
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    }
  );
}
