import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_MIN_SCORE, filterByMinScore } from "@/lib/scoring/score";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null as null };
  return { supabase, user };
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const minScoreRaw = searchParams.get("min_score");
  const minScore = minScoreRaw != null ? Number(minScoreRaw) : DEFAULT_MIN_SCORE;
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) {
    return NextResponse.json(
      { error: "min_score must be between 0 and 100" },
      { status: 400 }
    );
  }

  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const remoteOnly = searchParams.get("remote") === "1";
  const maxAgeDaysRaw = searchParams.get("max_age_days");
  const maxAgeDays =
    maxAgeDaysRaw != null && maxAgeDaysRaw !== ""
      ? Number(maxAgeDaysRaw)
      : null;
  const sort = searchParams.get("sort") === "date" ? "date" : "score";

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

  const { data, error } = await supabase
    .from("scores")
    .select(
      `
      score,
      rationale,
      matched_skills,
      gaps,
      scored_at,
      posting_id,
      postings (
        id,
        company_name,
        title,
        location,
        employment_type,
        apply_url,
        description_raw,
        posted_at,
        first_seen_at,
        last_seen_at,
        is_active
      )
    `
    )
    .eq("profile_id", profile.id)
    .gte("score", minScore)
    .order("score", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type ScoreJoin = {
    score: number;
    rationale: string;
    matched_skills: unknown;
    gaps: unknown;
    scored_at: string;
    posting_id: string;
    postings:
      | {
          id: string;
          company_name: string;
          title: string;
          location: string | null;
          employment_type: string | null;
          apply_url: string | null;
          description_raw: string;
          posted_at: string | null;
          first_seen_at: string | null;
          last_seen_at: string | null;
          is_active: boolean;
        }
      | {
          id: string;
          company_name: string;
          title: string;
          location: string | null;
          employment_type: string | null;
          apply_url: string | null;
          description_raw: string;
          posted_at: string | null;
          first_seen_at: string | null;
          last_seen_at: string | null;
          is_active: boolean;
        }[]
      | null;
  };

  let rows = ((data ?? []) as ScoreJoin[])
    .map((row) => {
      const posting = Array.isArray(row.postings)
        ? row.postings[0]
        : row.postings;
      if (!posting || !posting.is_active) return null;
      return {
        id: posting.id,
        posting_id: row.posting_id,
        company_name: posting.company_name,
        title: posting.title,
        location: posting.location,
        employment_type: posting.employment_type,
        apply_url: posting.apply_url,
        description_raw: posting.description_raw,
        posted_at: posting.posted_at,
        first_seen_at: posting.first_seen_at,
        last_seen_at: posting.last_seen_at,
        score: Number(row.score),
        rationale: row.rationale,
        matched_skills: Array.isArray(row.matched_skills)
          ? (row.matched_skills as string[])
          : [],
        gaps: Array.isArray(row.gaps) ? (row.gaps as string[]) : [],
        scored_at: row.scored_at,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  rows = filterByMinScore(rows, minScore);

  if (q) {
    rows = rows.filter((row) => {
      const hay =
        `${row.title} ${row.company_name} ${row.location ?? ""} ${row.rationale}`.toLowerCase();
      return hay.includes(q);
    });
  }

  if (remoteOnly) {
    rows = rows.filter((row) => /remote/i.test(row.location ?? ""));
  }

  if (maxAgeDays != null && Number.isFinite(maxAgeDays) && maxAgeDays > 0) {
    const cutoff = daysAgoIso(maxAgeDays);
    rows = rows.filter((row) => {
      // Prefer the freshest known timestamp — Greenhouse posted_at can be stale.
      const candidates = [row.posted_at, row.first_seen_at, row.last_seen_at].filter(
        (v): v is string => Boolean(v)
      );
      if (candidates.length === 0) return false;
      const newest = candidates.sort().at(-1)!;
      return newest >= cutoff;
    });
  }

  if (sort === "date") {
    rows.sort((a, b) => {
      const da = a.posted_at ?? a.first_seen_at ?? "";
      const db = b.posted_at ?? b.first_seen_at ?? "";
      return db.localeCompare(da);
    });
  } else {
    rows.sort((a, b) => b.score - a.score);
  }

  return NextResponse.json({
    postings: rows,
    min_score: minScore,
    filters: {
      q,
      remote: remoteOnly,
      max_age_days: maxAgeDays,
      sort,
    },
    count: rows.length,
  });
}
