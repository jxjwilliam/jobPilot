"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { demoSignIn } from "@/lib/demo-login";
import { apiFetch } from "@/lib/api";
import { isProfileIncomplete } from "@/lib/profile/complete";
import { JobPilotLogo } from "@/components/brand/JobPilotLogo";

const demoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function Home() {
  const router = useRouter();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      let destination = "/matches";
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
        // keep /matches as the default destination
      }
      router.replace(destination);
    });
  }, [router]);

  async function handleDemo() {
    setDemoLoading(true);
    setDemoError(null);
    try {
      await demoSignIn();
      router.replace("/matches");
      router.refresh();
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : "Demo login failed");
      setDemoLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <JobPilotLogo className="scale-125" />
      <p className="mt-6 max-w-md text-center text-lg text-neutral-600">
        AI-powered job application assistant. Sign in to get started.
      </p>
      <Link
        href="/login"
        className="mt-8 rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white"
      >
        Sign in
      </Link>
      {demoEnabled ? (
        <>
          <button
            type="button"
            onClick={handleDemo}
            disabled={demoLoading}
            className="mt-3 rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 outline-none hover:bg-neutral-50 disabled:opacity-60"
          >
            {demoLoading ? "Starting demo…" : "Try the demo"}
          </button>
          {demoError ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {demoError}
            </p>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
