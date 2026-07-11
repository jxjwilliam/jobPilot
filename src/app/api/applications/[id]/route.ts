import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertTransition } from "@/lib/applications/status";
import {
  ParsedResumeSchema,
  type ParsedResume,
} from "@/lib/llm/schemas";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null as null };
  return { supabase, user };
}

type StatusHistoryEntry = { status: string; timestamp: string };

function asHistory(value: unknown): StatusHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (e): e is StatusHistoryEntry =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as StatusHistoryEntry).status === "string" &&
      typeof (e as StatusHistoryEntry).timestamp === "string"
  );
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
    .select("id, resume_parsed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data: application, error: appError } = await supabase
    .from("applications")
    .select(
      "id, profile_id, posting_id, status, tailored_resume, tailored_cover_letter, applied_at, notes, status_history"
    )
    .eq("id", id)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (appError) {
    return NextResponse.json({ error: appError.message }, { status: 500 });
  }
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const { data: posting, error: postingError } = await supabase
    .from("postings")
    .select(
      "id, company_name, title, location, employment_type, apply_url, description_raw"
    )
    .eq("id", application.posting_id)
    .maybeSingle();

  if (postingError) {
    return NextResponse.json({ error: postingError.message }, { status: 500 });
  }
  if (!posting) {
    return NextResponse.json({ error: "Posting not found" }, { status: 404 });
  }

  const { data: score } = await supabase
    .from("scores")
    .select("score, rationale, matched_skills, gaps, scored_at")
    .eq("profile_id", profile.id)
    .eq("posting_id", posting.id)
    .maybeSingle();

  return NextResponse.json({
    application: {
      ...application,
      tailored_resume: application.tailored_resume
        ? ParsedResumeSchema.parse(application.tailored_resume)
        : null,
      status_history: asHistory(application.status_history),
    },
    posting,
    profile: {
      resume_parsed: ParsedResumeSchema.parse(profile.resume_parsed ?? {}),
    },
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const record = (body ?? {}) as {
    status?: unknown;
    notes?: unknown;
    tailored_cover_letter?: unknown;
    tailored_resume?: unknown;
  };

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

  const { data: existing, error: existingError } = await supabase
    .from("applications")
    .select(
      "id, status, tailored_resume, tailored_cover_letter, applied_at, notes, status_history, profile_id, posting_id"
    )
    .eq("id", id)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  const now = new Date().toISOString();

  if (typeof record.notes === "string") {
    updates.notes = record.notes;
  }

  if (typeof record.tailored_cover_letter === "string") {
    updates.tailored_cover_letter = record.tailored_cover_letter;
  }

  if (record.tailored_resume !== undefined) {
    const parsed = ParsedResumeSchema.safeParse(record.tailored_resume);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid tailored_resume", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    updates.tailored_resume = parsed.data;
  }

  if (typeof record.status === "string" && record.status !== existing.status) {
    try {
      assertTransition(existing.status, record.status);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Invalid status transition",
        },
        { status: 400 }
      );
    }
    updates.status = record.status;
    const history = asHistory(existing.status_history);
    updates.status_history = [
      ...history,
      { status: record.status, timestamp: now },
    ];
    if (record.status === "applied" && !existing.applied_at) {
      updates.applied_at = now;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({
      application: {
        ...existing,
        tailored_resume: existing.tailored_resume
          ? ParsedResumeSchema.parse(existing.tailored_resume)
          : null,
        status_history: asHistory(existing.status_history),
      },
    });
  }

  const { data: updated, error: updateError } = await supabase
    .from("applications")
    .update(updates)
    .eq("id", id)
    .eq("profile_id", profile.id)
    .select(
      "id, profile_id, posting_id, status, tailored_resume, tailored_cover_letter, applied_at, notes, status_history"
    )
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    application: {
      ...updated,
      tailored_resume: updated.tailored_resume
        ? (ParsedResumeSchema.parse(updated.tailored_resume) as ParsedResume)
        : null,
      status_history: asHistory(updated.status_history),
    },
  });
}
