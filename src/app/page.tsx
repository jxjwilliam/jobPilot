import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isProfileIncomplete } from "@/lib/profile/complete";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("resume_raw_url, resume_parsed")
      .eq("user_id", user.id)
      .maybeSingle();

    redirect(isProfileIncomplete(profile) ? "/onboarding" : "/matches");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight">JobPilot</h1>
      <p className="mt-4 max-w-md text-center text-lg text-neutral-600">
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
