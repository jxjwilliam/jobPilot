import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProfileIncomplete } from "@/lib/profile/complete";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (next && next.startsWith("/")) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("resume_raw_url, resume_parsed")
          .eq("user_id", user.id)
          .maybeSingle();

        const destination = isProfileIncomplete(profile)
          ? "/onboarding"
          : "/matches";
        return NextResponse.redirect(`${origin}${destination}`);
      }

      return NextResponse.redirect(`${origin}/matches`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
