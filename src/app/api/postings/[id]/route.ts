import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null as null };
  return { supabase, user };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data: posting, error: postingError } = await supabase
    .from("postings")
    .select(
      "id, company_name, title, location, employment_type, description_raw, salary_min, salary_max, apply_url, posted_at, is_active, ats_source"
    )
    .eq("id", id)
    .maybeSingle();

  if (postingError) {
    return NextResponse.json({ error: postingError.message }, { status: 500 });
  }
  if (!posting) {
    return NextResponse.json({ error: "Posting not found" }, { status: 404 });
  }

  const { data: score, error: scoreError } = await supabase
    .from("scores")
    .select("score, rationale, matched_skills, gaps, scored_at")
    .eq("profile_id", profile.id)
    .eq("posting_id", id)
    .maybeSingle();

  if (scoreError) {
    return NextResponse.json({ error: scoreError.message }, { status: 500 });
  }

  return NextResponse.json({
    ...posting,
    score: score
      ? {
          score: Number(score.score),
          rationale: score.rationale,
          matched_skills: Array.isArray(score.matched_skills)
            ? score.matched_skills
            : [],
          gaps: Array.isArray(score.gaps) ? score.gaps : [],
          scored_at: score.scored_at,
        }
      : null,
  });
}
