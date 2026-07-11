import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canTailor,
  getUsageForUser,
  incrementTailoring,
} from "@/lib/billing/quota";
import { getLlmClient, getLlmModel } from "@/lib/llm/client";
import { getCompletionText } from "@/lib/llm/message-text";
import {
  ParsedResumeSchema,
  TailorResultSchema,
  type ParsedResume,
  type TailorResult,
} from "@/lib/llm/schemas";

/** Must appear in every tailor prompt — unit-tested. */
export const TAILOR_NO_FABRICATION_GUARDRAIL =
  "Never fabricate experience, dates, titles, or credentials — only rephrase, reorder, or emphasize real content from the source resume.";

const TAILOR_JSON_SHAPE = `{
  "tailored_resume": {
    "summary": string,
    "skills": string[],
    "experience": [{ "title": string, "company": string, "start"?: string, "end"?: string, "bullets": string[] }],
    "education": [{ "school": string, "degree"?: string, "year"?: string }]
  },
  "cover_letter": string,
  "change_summary": string (optional)
}`;

export type TailorPosting = {
  id: string;
  company_name: string;
  title: string;
  location?: string | null;
  employment_type?: string | null;
  description_raw: string;
};

export type TailorScoreHint = {
  score?: number;
  rationale?: string;
  matched_skills?: string[];
  gaps?: string[];
} | null;

export type StatusHistoryEntry = {
  status: string;
  timestamp: string;
};

export type TailorApplicationRow = {
  id: string;
  profile_id: string;
  posting_id: string;
  status: string;
  tailored_resume: unknown;
  tailored_cover_letter: string | null;
  applied_at: string | null;
  notes: string | null;
  status_history: StatusHistoryEntry[];
};

type BuildTailorPromptInput = {
  resume: ParsedResume;
  posting: TailorPosting;
  score?: TailorScoreHint;
  instruction?: string;
};

/** Build the user prompt for LLM tailoring (exported for guardrail tests). */
export function buildTailorPrompt(input: BuildTailorPromptInput): string {
  const { resume, posting, score, instruction } = input;

  const scoreBlock =
    score && (score.score != null || score.matched_skills || score.gaps)
      ? `Fit score context (JSON):
${JSON.stringify({
  score: score.score,
  rationale: score.rationale,
  matched_skills: score.matched_skills ?? [],
  gaps: score.gaps ?? [],
})}`
      : "Fit score context: none available.";

  const instructionBlock = instruction?.trim()
    ? `\nAdditional user instruction for this draft:\n${instruction.trim()}\n`
    : "";

  return `Tailor this candidate's resume and write a short cover letter for the job posting.
Return ONLY a JSON object with this shape (no markdown outside the object):
${TAILOR_JSON_SHAPE}

CRITICAL GUARDRAIL: ${TAILOR_NO_FABRICATION_GUARDRAIL}
Preserve real employers, titles, dates, degrees, and credentials. You may reorder bullets, rephrase for clarity/keywords, emphasize relevant skills, and adjust the summary — but invent nothing.
${instructionBlock}
Candidate resume (JSON) — source of truth:
${JSON.stringify(resume)}

${scoreBlock}

Job posting:
- Company: ${posting.company_name}
- Title: ${posting.title}
- Location: ${posting.location ?? "unknown"}
- Employment type: ${posting.employment_type ?? "unknown"}
- Description:
${posting.description_raw.slice(0, 12_000)}`;
}

export function extractTailorResult(text: string): TailorResult {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in LLM response");
  }

  const jsonText = candidate.slice(start, end + 1);
  const raw = JSON.parse(jsonText) as unknown;
  return TailorResultSchema.parse(raw);
}

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

async function loadTailorContext(
  client: SupabaseClient,
  userId: string,
  applicationId: string
) {
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, resume_parsed, user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("Profile not found");

  const { data: application, error: appError } = await client
    .from("applications")
    .select(
      "id, profile_id, posting_id, status, tailored_resume, tailored_cover_letter, applied_at, notes, status_history"
    )
    .eq("id", applicationId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (appError) throw new Error(appError.message);
  if (!application) throw new Error("Application not found");

  const { data: posting, error: postingError } = await client
    .from("postings")
    .select(
      "id, company_name, title, location, employment_type, description_raw"
    )
    .eq("id", application.posting_id)
    .maybeSingle();

  if (postingError) throw new Error(postingError.message);
  if (!posting) throw new Error("Posting not found");

  const { data: score } = await client
    .from("scores")
    .select("score, rationale, matched_skills, gaps")
    .eq("profile_id", profile.id)
    .eq("posting_id", posting.id)
    .maybeSingle();

  return {
    profile,
    application: {
      ...application,
      status_history: asHistory(application.status_history),
    } as TailorApplicationRow,
    posting: posting as TailorPosting,
    score: score
      ? {
          score: Number(score.score),
          rationale: score.rationale ?? undefined,
          matched_skills: Array.isArray(score.matched_skills)
            ? (score.matched_skills as string[])
            : [],
          gaps: Array.isArray(score.gaps) ? (score.gaps as string[]) : [],
        }
      : null,
  };
}

async function runTailorLlm(input: BuildTailorPromptInput): Promise<TailorResult> {
  const client = getLlmClient();
  const completion = await client.chat.completions.create({
    model: getLlmModel(),
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You are a resume/cover-letter tailoring assistant. Return strict JSON only. ${TAILOR_NO_FABRICATION_GUARDRAIL}`,
      },
      {
        role: "user",
        content: buildTailorPrompt(input),
      },
    ],
  });

  const content = getCompletionText(completion);
  return extractTailorResult(content);
}

export class QuotaExceededError extends Error {
  constructor(message = "Tailoring quota exceeded") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export type TailorOptions = {
  /** Free-text regenerate instruction. */
  instruction?: string;
  /**
   * MVP: regenerate does NOT increment quota again (free after first tailor).
   * Only the initial tailor path should pass `true` (default).
   */
  countAgainstQuota?: boolean;
};

/**
 * Generate tailored resume + cover letter for an application.
 * Checks quota (when counting), calls LLM, saves drafts, sets status `reviewing`.
 */
export async function tailorApplication(
  /** Prefer admin client: usage_counters RLS is SELECT-only for writes. */
  adminClient: SupabaseClient,
  userId: string,
  applicationId: string,
  options: TailorOptions = {}
): Promise<TailorApplicationRow> {
  const countAgainstQuota = options.countAgainstQuota !== false;

  const { profile, application, posting, score } = await loadTailorContext(
    adminClient,
    userId,
    applicationId
  );

  if (countAgainstQuota) {
    const usage = await getUsageForUser(adminClient, userId);
    if (!canTailor({ tier: usage.tier, tailoring_count: usage.tailoring_count })) {
      throw new QuotaExceededError();
    }
  }

  const resume = ParsedResumeSchema.parse(profile.resume_parsed ?? {});
  const result = await runTailorLlm({
    resume,
    posting,
    score,
    instruction: options.instruction,
  });

  const now = new Date().toISOString();
  const history = asHistory(application.status_history);
  const nextStatus = "reviewing";
  const status_history =
    application.status === nextStatus
      ? history
      : [...history, { status: nextStatus, timestamp: now }];

  const { data: updated, error: updateError } = await adminClient
    .from("applications")
    .update({
      tailored_resume: result.tailored_resume,
      tailored_cover_letter: result.cover_letter,
      status: nextStatus,
      status_history,
    })
    .eq("id", application.id)
    .select(
      "id, profile_id, posting_id, status, tailored_resume, tailored_cover_letter, applied_at, notes, status_history"
    )
    .single();

  if (updateError) throw new Error(updateError.message);
  if (!updated) throw new Error("Failed to save tailored application");

  if (countAgainstQuota) {
    await incrementTailoring(adminClient, userId);
  }

  return {
    ...updated,
    status_history: asHistory(updated.status_history),
  } as TailorApplicationRow;
}
