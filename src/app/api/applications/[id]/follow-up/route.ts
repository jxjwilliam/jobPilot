import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLlmClient, getLlmModel } from "@/lib/llm/client";
import { getCompletionText } from "@/lib/llm/message-text";
import { assertTransition } from "@/lib/applications/status";

const FOLLOW_UP_PROMPT = `You are a professional career coach. Write a short, polite follow-up email to a recruiter or hiring manager about a job application.

Rules:
- Keep it under 150 words
- Be friendly but professional
- Express continued interest without sounding desperate
- Mention the role and company by name
- Offer to provide additional information if needed
- Do NOT fabricate interview dates or communications that didn't happen
- Write it as a draft the user will personalize before sending

Return ONLY the email subject and body in this JSON format (no markdown):
{
  "subject": "string",
  "body": "string"
}`;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load application with posting info
  const { data: profile } = await supabase
    .from("jp_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: app, error: appError } = await admin
    .from("jp_applications")
    .select("id, profile_id, posting_id, status, applied_at, status_history, notes")
    .eq("id", id)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (appError || !app) {
    return NextResponse.json(
      { error: appError?.message ?? "Application not found" },
      { status: 404 }
    );
  }

  // Only suggest follow-up for applied/screening applications
  if (!["applied", "screening"].includes(app.status)) {
    return NextResponse.json(
      { error: "Follow-up is only relevant for applied applications" },
      { status: 400 }
    );
  }

  // Load posting details
  const { data: posting, error: postingError } = await admin
    .from("jp_postings")
    .select("company_name, title")
    .eq("id", app.posting_id)
    .maybeSingle();

  if (postingError || !posting) {
    return NextResponse.json(
      { error: "Posting not found" },
      { status: 404 }
    );
  }

  // Determine stale duration
  let staleDays = 0;
  if (app.applied_at) {
    staleDays = Math.floor(
      (Date.now() - new Date(app.applied_at).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const staleNote =
    staleDays >= 21
      ? `It has been ${staleDays} days since the application was submitted.`
      : "";

  const client = getLlmClient();
  const completion = await client.chat.completions.create({
    model: getLlmModel(),
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: FOLLOW_UP_PROMPT },
      {
        role: "user",
        content: `Write a follow-up email draft for:
- Role: ${posting.title}
- Company: ${posting.company_name}
- Days since application: ${staleDays > 0 ? staleDays : "recently"}
${staleNote}`,
      },
    ],
  });

  const content = getCompletionText(completion);
  let result: { subject?: string; body?: string } = {};
  try {
    const trimmed = content.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] ?? trimmed).trim();
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      result = JSON.parse(candidate.slice(start, end + 1));
    }
  } catch {
    // fall back to raw text
    result = { subject: "Following up", body: content };
  }

  // Save the follow-up draft as a note
  const followUpNote = `**Follow-up draft** (generated ${new Date().toLocaleDateString()})\n\n**Subject:** ${result.subject ?? "Following up on my application"}\n\n${result.body ?? ""}`;

  const existingNotes = typeof app.notes === "string" && app.notes.trim()
    ? `${app.notes}\n\n---\n\n${followUpNote}`
    : followUpNote;

  // PATCH notes only — don't change status
  const { error: updateError } = await admin
    .from("jp_applications")
    .update({ notes: existingNotes })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to save follow-up: ${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    subject: result.subject ?? "Following up on my application",
    body: result.body ?? "",
    stale_days: staleDays,
    notes: existingNotes,
  });
}
