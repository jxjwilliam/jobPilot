import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLlmClient, getLlmModel } from "@/lib/llm/client";
import { getCompletionText } from "@/lib/llm/message-text";
import { z } from "zod";

const FeedbackSchema = z.object({
  score: z.number().min(1).max(10),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  star_assessment: z
    .object({
      situation: z.number().min(1).max(5).optional(),
      task: z.number().min(1).max(5).optional(),
      action: z.number().min(1).max(5).optional(),
      result: z.number().min(1).max(5).optional(),
    })
    .optional(),
  overall_comment: z.string(),
});

const PROMPT = `You are an expert interview coach. Evaluate the candidate's answer to an interview question.

Score 1-10 based on:
- Relevance: does it answer the question directly?
- Specificity: concrete examples vs vague statements
- Structure: clear organization (STAR method for behavioral questions)
- Impact: quantifiable results, demonstrated skills

For behavioral questions, also assess STAR components (1-5 each):
- Situation: did they set context clearly?
- Task: did they define their responsibility?
- Action: did they describe specific actions they took?
- Result: did they share measurable outcomes?

Return ONLY valid JSON:
{
  "score": number (1-10),
  "strengths": ["..."],
  "improvements": ["..."],
  "star_assessment": {"situation": 1-5, "task": 1-5, "action": 1-5, "result": 1-5},
  "overall_comment": "string"
}`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sessionId: string;
  let questionIndex: number;
  let answer: string;

  try {
    const body = (await request.json()) as {
      session_id?: string;
      question_index?: number;
      answer?: string;
    };
    if (!body.session_id || body.question_index == null || !body.answer?.trim()) {
      throw new Error("session_id, question_index, and answer required");
    }
    sessionId = body.session_id;
    questionIndex = body.question_index;
    answer = body.answer.trim();
  } catch {
    return NextResponse.json(
      { error: "session_id, question_index, and answer required" },
      { status: 400 }
    );
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
  const { data: session, error: sessionError } = await admin
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const questions = Array.isArray(session.questions)
    ? (session.questions as Array<{ question: string; category: string; tip?: string }>)
    : [];

  if (questionIndex < 0 || questionIndex >= questions.length) {
    return NextResponse.json({ error: "Invalid question index" }, { status: 400 });
  }

  const question = questions[questionIndex];

  const client = getLlmClient();
  const completion = await client.chat.completions.create({
    model: getLlmModel(),
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PROMPT },
      {
        role: "user",
        content: `Interview question (${question.category}):\n${question.question}\n\nCandidate's answer:\n${answer}\n\nEvaluate this answer.`,
      },
    ],
  });

  const content = getCompletionText(completion);
  let feedback: z.infer<typeof FeedbackSchema>;
  try {
    const trimmed = content.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] ?? trimmed).trim();
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      feedback = FeedbackSchema.parse(JSON.parse(candidate.slice(start, end + 1)));
    } else {
      throw new Error("No JSON found");
    }
  } catch {
    return NextResponse.json({ error: "Failed to parse feedback" }, { status: 500 });
  }

  // Append answer + feedback to session
  const answers = Array.isArray(session.answers)
    ? [...(session.answers as Array<unknown>)]
    : [];
  answers[questionIndex] = {
    question: question.question,
    category: question.category,
    answer,
    feedback,
    evaluated_at: new Date().toISOString(),
  };

  // Count evaluated answers — if all done, mark completed
  const completedCount = answers.filter(
    (a) => a != null && typeof a === "object" && "feedback" in (a as object)
  ).length;
  const newStatus = completedCount >= questions.length ? "completed" : "in_progress";

  const { error: updateError } = await admin
    .from("interview_sessions")
    .update({
      answers,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to save: ${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    feedback,
    question_index: questionIndex,
    total_questions: questions.length,
    completed: completedCount,
    session_status: newStatus,
  });
}
