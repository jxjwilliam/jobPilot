import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseResumeFromBuffer } from "@/lib/profile/parse-resume";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const filename = file.name.replace(/[^\w.\-]+/g, "_") || "resume.pdf";
  const path = `${user.id}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { parsed, error: parseError } = await parseResumeFromBuffer(
    buffer,
    file.type || filename
  );

  const { data: profile, error: updateError } = await supabase
    .from("profiles")
    .update({
      resume_raw_url: path,
      resume_parsed: parsed,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .select("resume_parsed, preferences, resume_raw_url, updated_at")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    resume_parsed: profile?.resume_parsed ?? parsed,
    preferences: profile?.preferences ?? {},
    resume_raw_url: profile?.resume_raw_url ?? path,
    parse_error: parseError ?? null,
  });
}
