import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  emptyPreferences,
  PreferencesSchema,
  type Preferences,
} from "@/lib/profile/types";
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

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("jp_profiles")
    .select("resume_parsed, preferences, resume_raw_url, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resume_parsed = ParsedResumeSchema.parse(data?.resume_parsed ?? {});
  const preferences = PreferencesSchema.parse(data?.preferences ?? {});

  return NextResponse.json({
    resume_parsed,
    preferences,
    resume_raw_url: data?.resume_raw_url ?? null,
    updated_at: data?.updated_at ?? null,
  });
}

export async function PUT(request: Request) {
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

  const record = body as {
    resume_parsed?: unknown;
    preferences?: unknown;
  };

  const updates: {
    resume_parsed?: ParsedResume;
    preferences?: Preferences;
    updated_at: string;
  } = { updated_at: new Date().toISOString() };

  if (record.resume_parsed !== undefined) {
    const parsed = ParsedResumeSchema.safeParse(record.resume_parsed);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid resume data — check experience/education fields",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }
    updates.resume_parsed = parsed.data;
  }

  if (record.preferences !== undefined) {
    const prefs = PreferencesSchema.safeParse(record.preferences);
    if (!prefs.success) {
      return NextResponse.json(
        {
          error: "Invalid preferences — check salary and list fields",
          details: prefs.error.flatten(),
        },
        { status: 400 }
      );
    }
    updates.preferences = prefs.data;
  }

  const { data, error } = await supabase
    .from("jp_profiles")
    .update(updates)
    .eq("user_id", user.id)
    .select("resume_parsed, preferences, resume_raw_url, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Profile not found or not writable for this user" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    resume_parsed: ParsedResumeSchema.parse(data.resume_parsed ?? {}),
    preferences: PreferencesSchema.parse(
      data.preferences ?? emptyPreferences()
    ),
    resume_raw_url: data.resume_raw_url ?? null,
    updated_at: data.updated_at ?? null,
  });
}
