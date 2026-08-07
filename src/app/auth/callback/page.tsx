"use client";

import { Suspense, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { isProfileIncomplete } from "@/lib/profile/complete";
import { useRouter, useSearchParams } from "next/navigation";

function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const next = searchParams.get("next");
    let cancelled = false;

    async function routeAfterSignIn() {
      // The session was written to localStorage (shared with the parent
      // iframe's origin) — close the popup; the opener/iframe picks it up.
      if (window.opener) {
        window.close();
        return;
      }
      if (next && next.startsWith("/")) {
        router.replace(next);
        router.refresh();
        return;
      }
      // Preserve the old server behavior: send incomplete profiles to
      // onboarding, complete ones to matches.
      let destination = "/onboarding";
      try {
        const res = await apiFetch("/api/profile");
        if (res.ok) {
          const profile = (await res.json()) as {
            resume_raw_url: string | null;
            resume_parsed: { skills?: unknown[] } | null;
          };
          destination = isProfileIncomplete(profile)
            ? "/onboarding"
            : "/matches";
        }
      } catch {
        // fall back to onboarding — it loads the profile itself
      }
      router.replace(destination);
      router.refresh();
    }

    // Accept implicit-flow redirects (e.g. links issued outside the PKCE
    // flow, which land on /auth/callback#access_token=... instead of ?code=).
    async function recoverFromImplicitHash() {
      const hash = window.location.hash;
      if (!hash.includes("access_token")) return false;
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const accessToken = params.get("access_token");
      if (!accessToken) return false;
      const session: {
        access_token: string;
        refresh_token: string;
        expires_in?: number;
        expires_at?: number;
        token_type?: string;
        user?: unknown;
      } = {
        access_token: accessToken,
        refresh_token: params.get("refresh_token") ?? "",
      };
      const expiresIn = params.get("expires_in");
      const expiresAt = params.get("expires_at");
      if (expiresIn) session.expires_in = Number(expiresIn);
      if (expiresAt) session.expires_at = Number(expiresAt);
      const tokenType = params.get("token_type");
      if (tokenType) session.token_type = tokenType;
      const userRaw = params.get("user");
      if (userRaw) {
        try {
          session.user = JSON.parse(userRaw);
        } catch {
          // ignore malformed user payload
        }
      }
      const supabase = createClient();
      const { error } = await supabase.auth.setSession(session);
      return !error;
    }

    (async () => {
      if (code) {
        const supabase = createClient();
        // detectSessionInUrl auto-exchanges the PKCE code during client init,
        // so getSession() resolves after the exchange. Check for a session
        // first to avoid double-exchanging a single-use code.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) {
          await routeAfterSignIn();
          return;
        }
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          const {
            data: { session: retrySession },
          } = await supabase.auth.getSession();
          if (retrySession) {
            await routeAfterSignIn();
            return;
          }
          router.replace("/login?error=" + encodeURIComponent(error.message));
          return;
        }
        await routeAfterSignIn();
        return;
      }

      const recovered = await recoverFromImplicitHash();
      if (cancelled) return;
      if (recovered) {
        await routeAfterSignIn();
        return;
      }
      router.replace("/login?error=auth");
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <p className="text-sm text-neutral-600">Completing sign-in…</p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center p-8">
          <p className="text-sm text-neutral-600">Completing sign-in…</p>
        </main>
      }
    >
      <AuthCallback />
    </Suspense>
  );
}
