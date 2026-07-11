import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_SCORE_BATCH_LIMIT,
  scorePair,
  type ScorePosting,
  type ScoreProfile,
} from "@/lib/scoring/score";
import { ParsedResumeSchema } from "@/lib/llm/schemas";

/**
 * Score the current user's profile against recent active postings.
 * Auth required (unlike the cron route).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit = 25;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      limit?: unknown;
    };
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.min(Math.max(Math.floor(body.limit), 1), 50);
    }
  } catch {
    // default limit
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, resume_parsed, preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const resume = ParsedResumeSchema.safeParse(profile.resume_parsed ?? {});
  const populated =
    resume.success &&
    (resume.data.summary.trim().length > 0 ||
      resume.data.skills.length > 0 ||
      resume.data.experience.length > 0);

  if (!populated) {
    return NextResponse.json(
      {
        error:
          "Complete your resume profile first (upload + extract) before scoring matches.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: postings, error: postingsError } = await admin
    .from("postings")
    .select(
      "id, company_name, title, location, employment_type, description_raw, salary_min, salary_max"
    )
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false })
    .limit(400);

  if (postingsError) {
    return NextResponse.json({ error: postingsError.message }, { status: 500 });
  }

  const activePostings = (postings ?? []) as ScorePosting[];
  const { data: existingScores } = await admin
    .from("scores")
    .select("posting_id")
    .eq("profile_id", profile.id)
    .in(
      "posting_id",
      activePostings.map((p) => p.id)
    );

  const scored = new Set((existingScores ?? []).map((s) => s.posting_id));
  const pending = activePostings
    .filter((p) => !scored.has(p.id))
    .slice(0, limit);

  const scoreProfile: ScoreProfile = {
    id: profile.id,
    resume_parsed: profile.resume_parsed,
    preferences: profile.preferences,
  };

  let scoredCount = 0;
  let errors = 0;
  const errorSamples: string[] = [];

  for (const posting of pending) {
    try {
      const outcome = await scorePair(admin, scoreProfile, posting);
      if (!outcome.skipped) scoredCount += 1;
    } catch (err) {
      errors += 1;
      if (errorSamples.length < 3) {
        errorSamples.push(
          err instanceof Error ? err.message : "unknown score error"
        );
      }
    }
  }

  return NextResponse.json({
    attempted: pending.length,
    scored: scoredCount,
    errors,
    error_samples: errorSamples,
    limit: limit || DEFAULT_SCORE_BATCH_LIMIT,
    remaining_unscored_estimate: Math.max(
      0,
      activePostings.length - scored.size - scoredCount
    ),
  });
}
