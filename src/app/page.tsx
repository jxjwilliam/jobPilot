"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { isProfileIncomplete } from "@/lib/profile/complete";
import { JobPilotLogo } from "@/components/brand/JobPilotLogo";

export default function Home() {
  const router = useRouter();

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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <JobPilotLogo className="scale-125" />
      <p className="mt-6 max-w-md text-center text-lg text-neutral-600">
        AI-powered job application assistant. Sign in with a magic link to get
        started.
      </p>
      <Link
        href="/login"
        className="mt-8 rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white"
      >
        Sign in
      </Link>
    </main>
  );
}
