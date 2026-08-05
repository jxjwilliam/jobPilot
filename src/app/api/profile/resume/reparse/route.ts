import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isResumePopulated,
  parseResumeFromBuffer,
} from "@/lib/profile/parse-resume";
import {
  PreferencesSchema,
  emptyPreferences,
} from "@/lib/profile/types";
import { ParsedResumeSchema } from "@/lib/llm/schemas";

/** Re-run LLM extraction on the already-uploaded resume file. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("jp_profiles")
    .select("resume_raw_url, preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const path = profile?.resume_raw_url;
  if (!path) {
    return NextResponse.json(
      { error: "No resume uploaded yet. Upload a file first." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: file, error: downloadError } = await admin.storage
    .from("jp_resumes")
    .download(path);

  if (downloadError || !file) {
    return NextResponse.json(
      { error: downloadError?.message ?? "Could not download resume" },
      { status: 500 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const existingPreferences = PreferencesSchema.parse(
    profile?.preferences ?? {}
  );
  const { parsed, preferences, error: parseError } = await parseResumeFromBuffer(
    buffer,
    path,
    { existingPreferences }
  );

  if (parseError || !isResumePopulated(parsed)) {
    return NextResponse.json(
      {
        error:
          parseError ??
          "Could not auto-extract resume fields. Try re-uploading a text-based PDF/DOCX.",
        parse_error: parseError ?? "empty_extraction",
      },
      { status: 422 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("jp_profiles")
    .update({
      resume_parsed: parsed,
      preferences,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .select("resume_parsed, preferences, resume_raw_url, updated_at")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    resume_parsed: ParsedResumeSchema.parse(updated?.resume_parsed ?? parsed),
    preferences: PreferencesSchema.parse(
      updated?.preferences ?? preferences ?? emptyPreferences()
    ),
    resume_raw_url: updated?.resume_raw_url ?? path,
    parse_error: null,
    autofilled: true,
  });
}
