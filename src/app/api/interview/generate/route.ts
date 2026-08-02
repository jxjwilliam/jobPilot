import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLlmClient, getLlmModel } from "@/lib/llm/client";
import { getCompletionText } from "@/lib/llm/message-text";
import { z } from "zod";

const QuestionsSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      category: z.string(),
      tip: z.string().optional(),
    })
  ),
});

const PROMPT = `You are an experienced technical interviewer and career coach. Generate realistic interview questions for a specific job posting.

Rules:
- Generate 8-12 questions
- Mix categories: technical skills, behavioral (STAR method), company knowledge, role-specific scenarios
- Make questions specific to the job description — not generic
- Include a brief tip for what a strong answer should cover
- Difficulty should match the seniority level of the role

Return ONLY valid JSON (no markdown):
{
  "questions": [
    {"question": "...", "category": "technical|behavioral|company|scenario", "tip": "..."}
  ]
}`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let postingId: string;
  try {
    const body = (await request.json()) as { posting_id?: string };
    if (!body.posting_id) throw new Error("posting_id required");
    postingId = body.posting_id;
  } catch {
    return NextResponse.json({ error: "posting_id required" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: posting, error: postingError } = await admin
    .from("postings")
    .select("title, company_name, description_raw, employment_type, location")
    .eq("id", postingId)
    .maybeSingle();

  if (postingError || !posting) {
    return NextResponse.json({ error: "Posting not found" }, { status: 404 });
  }

  const client = getLlmClient();
  const completion = await client.chat.completions.create({
    model: getLlmModel(),
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PROMPT },
      {
        role: "user",
        content: `Generate interview questions for:
Role: ${posting.title}
Company: ${posting.company_name}
Location: ${posting.location ?? "N/A"}
Type: ${posting.employment_type ?? "N/A"}

Job Description:
${posting.description_raw.slice(0, 8000)}`,
      },
    ],
  });

  const content = getCompletionText(completion);
  let result: { questions?: Array<{ question: string; category: string; tip?: string }> } = {};
  try {
    const trimmed = content.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] ?? trimmed).trim();
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      result = QuestionsSchema.parse(parsed);
    }
  } catch {
    return NextResponse.json({ error: "Failed to parse questions" }, { status: 500 });
  }

  // Create interview session
  const { data: session, error: sessionError } = await admin
    .from("interview_sessions")
    .insert({
      profile_id: profile.id,
      posting_id: postingId,
      questions: result.questions ?? [],
      answers: [],
      status: "in_progress",
    })
    .select("id")
    .single();

  if (sessionError) {
    return NextResponse.json(
      { error: `Failed to create session: ${sessionError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    session_id: session.id,
    questions: result.questions ?? [],
    posting: {
      title: posting.title,
      company_name: posting.company_name,
    },
  });
}
