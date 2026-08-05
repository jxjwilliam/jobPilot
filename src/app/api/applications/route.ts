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

/** Create or return existing application shell for a posting (Tailor entrypoint). */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const postingId =
    typeof body === "object" &&
    body !== null &&
    "posting_id" in body &&
    typeof (body as { posting_id: unknown }).posting_id === "string"
      ? (body as { posting_id: string }).posting_id
      : null;

  if (!postingId) {
    return NextResponse.json(
      { error: "posting_id is required" },
      { status: 400 }
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("jp_profiles")
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
    .from("jp_postings")
    .select("id")
    .eq("id", postingId)
    .maybeSingle();

  if (postingError) {
    return NextResponse.json({ error: postingError.message }, { status: 500 });
  }
  if (!posting) {
    return NextResponse.json({ error: "Posting not found" }, { status: 404 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("jp_applications")
    .select("id, status, posting_id, profile_id")
    .eq("profile_id", profile.id)
    .eq("posting_id", postingId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ application: existing }, { status: 200 });
  }

  const now = new Date().toISOString();
  const { data: created, error: createError } = await supabase
    .from("jp_applications")
    .insert({
      profile_id: profile.id,
      posting_id: postingId,
      status: "discovered",
      status_history: [{ status: "discovered", timestamp: now }],
    })
    .select("id, status, posting_id, profile_id")
    .single();

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  return NextResponse.json({ application: created }, { status: 201 });
}

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("jp_profiles")
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
    .from("jp_applications")
    .select(
      `
      id,
      status,
      posting_id,
      profile_id,
      applied_at,
      notes,
      status_history,
      postings (
        title,
        company_name
      )
    `
    )
    .eq("profile_id", profile.id)
    .order("id", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const applications = (data ?? []).map((row) => {
    const posting = Array.isArray(row.postings)
      ? row.postings[0]
      : row.postings;
    return {
      id: row.id,
      status: row.status,
      posting_id: row.posting_id,
      profile_id: row.profile_id,
      applied_at: row.applied_at,
      notes: row.notes,
      status_history: row.status_history,
      title: posting?.title ?? null,
      company_name: posting?.company_name ?? null,
    };
  });

  return NextResponse.json({ applications });
}
