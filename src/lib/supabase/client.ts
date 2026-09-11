import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client.
 *
 * The session lives in sessionStorage — not localStorage, not cookies:
 *  - it is dropped when the tab/window closes, so opening the app again always
 *    lands on /login and the fixed credentials have to be typed again;
 *  - it is origin-scoped and iframe-safe, unlike third-party cookies, which is
 *    what keeps the app usable inside a cross-origin dashboard iframe.
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
        // Guarded for the server render, where `window` doesn't exist.
        storage: typeof window === "undefined" ? undefined : window.sessionStorage,
      },
    }
  );
}
