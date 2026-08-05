import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  canTailor,
  getUsageForUser,
  incrementTailoring,
} from "@/lib/billing/quota";
import { getLlmClient, getLlmModel } from "@/lib/llm/client";
import { getCompletionText } from "@/lib/llm/message-text";
import {
  ParsedResumeSchema,
  type ParsedResume,
} from "@/lib/llm/schemas";

/** Must appear in every tailor prompt — unit-tested. */
export const TAILOR_NO_FABRICATION_GUARDRAIL =
  "Never fabricate experience, dates, titles, or credentials — only rephrase, reorder, or emphasize real content from the source resume.";

const TAILOR_RESUME_JSON_SHAPE = `{
  "tailored_resume": {
    "summary": string,
    "skills": string[],
    "experience": [{ "title": string, "company": string, "start"?: string, "end"?: string, "bullets": string[] }],
    "education": [{ "school": string, "degree"?: string, "year"?: string }]
  },
  "change_summary": string (optional)
}`;

const TAILOR_COVER_JSON_SHAPE = `{
  "cover_letter": string
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

function scoreBlock(input: BuildTailorPromptInput): string {
  const { score } = input;
  return score && (score.score != null || score.matched_skills || score.gaps)
    ? `Fit score context (JSON):
${JSON.stringify({
  score: score.score,
  rationale: score.rationale,
  matched_skills: score.matched_skills ?? [],
  gaps: score.gaps ?? [],
})}`
    : "Fit score context: none available.";
}

function instructionBlock(input: BuildTailorPromptInput): string {
  const instruction = input.instruction?.trim();
  return instruction
    ? `\nAdditional user instruction for this draft:\n${instruction}\n`
    : "";
}

/** Build the user prompt for the tailored RESUME (exported for guardrail tests). */
export function buildTailorPrompt(input: BuildTailorPromptInput): string {
  const { resume, posting } = input;

  return `Tailor this candidate's resume for the job posting.
Return ONLY a JSON object with this shape (no markdown outside the object):
${TAILOR_RESUME_JSON_SHAPE}

CRITICAL GUARDRAIL: ${TAILOR_NO_FABRICATION_GUARDRAIL}
Preserve real employers, titles, dates, degrees, and credentials. You may reorder bullets, rephrase for clarity/keywords, emphasize relevant skills, and adjust the summary — but invent nothing.
${instructionBlock(input)}
Candidate resume (JSON) — source of truth:
${JSON.stringify(resume)}

${scoreBlock(input)}

Job posting:
- Company: ${posting.company_name}
- Title: ${posting.title}
- Location: ${posting.location ?? "unknown"}
- Employment type: ${posting.employment_type ?? "unknown"}
- Description:
${posting.description_raw.slice(0, 12_000)}`;
}

/** Build the user prompt for the cover letter, consistent with the tailored resume. */
export function buildCoverLetterPrompt(
  input: BuildTailorPromptInput,
  tailoredResume: ParsedResume
): string {
  const { posting } = input;

  return `Write a short cover letter for the job posting, consistent with the candidate's tailored resume.
Return ONLY a JSON object with this shape (no markdown outside the object):
${TAILOR_COVER_JSON_SHAPE}

CRITICAL GUARDRAIL: ${TAILOR_NO_FABRICATION_GUARDRAIL}
Only reference real experience from the tailored resume. Invent no employers, titles, dates, or credentials.
${instructionBlock(input)}
Tailored resume (JSON) — source of truth:
${JSON.stringify(tailoredResume)}

${scoreBlock(input)}

Job posting:
- Company: ${posting.company_name}
- Title: ${posting.title}
- Location: ${posting.location ?? "unknown"}
- Employment type: ${posting.employment_type ?? "unknown"}
- Description:
${posting.description_raw.slice(0, 12_000)}`;
}

/** Strip code fences and parse the first JSON object in an LLM response. */
function extractJson<S extends z.ZodTypeAny>(
  text: string,
  schema: S
): z.infer<S> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in LLM response");
  }

  const raw = JSON.parse(candidate.slice(start, end + 1)) as unknown;
  return schema.parse(raw);
}

const TailorResumePartSchema = z.object({
  tailored_resume: ParsedResumeSchema,
  change_summary: z.string().optional(),
});

const TailorCoverPartSchema = z.object({
  cover_letter: z.string(),
});

async function runResumeLlm(
  input: BuildTailorPromptInput
): Promise<z.infer<typeof TailorResumePartSchema>> {
  const client = getLlmClient();
  const completion = await client.chat.completions.create({
    model: getLlmModel(),
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You are a resume tailoring assistant. Return strict JSON only. ${TAILOR_NO_FABRICATION_GUARDRAIL}`,
      },
      {
        role: "user",
        content: buildTailorPrompt(input),
      },
    ],
  });
  return extractJson(getCompletionText(completion), TailorResumePartSchema);
}

async function runCoverLetterLlm(
  input: BuildTailorPromptInput,
  tailoredResume: ParsedResume
): Promise<z.infer<typeof TailorCoverPartSchema>> {
  const client = getLlmClient();
  const completion = await client.chat.completions.create({
    model: getLlmModel(),
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You are a cover-letter writing assistant. Return strict JSON only. ${TAILOR_NO_FABRICATION_GUARDRAIL}`,
      },
      {
        role: "user",
        content: buildCoverLetterPrompt(input, tailoredResume),
      },
    ],
  });
  return extractJson(getCompletionText(completion), TailorCoverPartSchema);
}

export class QuotaExceededError extends Error {
  constructor(message = "Tailoring quota exceeded") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/**
 * Fast-fail quota gate for the tailor route: returns a 402 before any SSE
 * stream is opened. The stream generator still increments the counter after a
 * successful generation.
 */
export async function assertTailorQuota(
  adminClient: SupabaseClient,
  userId: string
): Promise<void> {
  const usage = await getUsageForUser(adminClient, userId);
  if (!canTailor({ tier: usage.tier, tailoring_count: usage.tailoring_count })) {
    throw new QuotaExceededError();
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

/** SSE events emitted by `streamTailorApplication`, in order. */
export type TailorStreamEvent =
  | { type: "resume_start" }
  | { type: "resume_done" }
  | { type: "cover_start" }
  | { type: "cover_done" }
  | { type: "done"; application: TailorApplicationRow }
  | { type: "error"; message: string };

/**
 * Generate tailored resume then cover letter as TWO separate LLM calls,
 * yielding an event before/after each so the route can stream progress.
 * Each call has a smaller output than the old combined one, so pieces land
 * faster. Caller (route) is responsible for the pre-stream quota check via
 * `assertTailorQuota`; this increments the counter after a successful save.
 */
export async function* streamTailorApplication(
  adminClient: SupabaseClient,
  userId: string,
  applicationId: string,
  options: TailorOptions = {}
): AsyncGenerator<TailorStreamEvent> {
  const countAgainstQuota = options.countAgainstQuota !== false;

  const { profile, application, posting, score } = await loadTailorContext(
    adminClient,
    userId,
    applicationId
  );

  const resume = ParsedResumeSchema.parse(profile.resume_parsed ?? {});
  const baseInput: BuildTailorPromptInput = {
    resume,
    posting,
    score,
    instruction: options.instruction,
  };

  yield { type: "resume_start" };
  const resumePart = await runResumeLlm(baseInput);
  yield { type: "resume_done" };

  yield { type: "cover_start" };
  const coverPart = await runCoverLetterLlm(baseInput, resumePart.tailored_resume);
  yield { type: "cover_done" };

  const now = new Date().toISOString();
  const history = asHistory(application.status_history);
  const nextStatus = "reviewing";
  const status_history =
    application.status === nextStatus
      ? history
      : [...history, { status: nextStatus, timestamp: now }];

  const { data: updated, error: updateError } = await adminClient
    .from("jp_applications")
    .update({
      tailored_resume: resumePart.tailored_resume,
      tailored_cover_letter: coverPart.cover_letter,
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

  yield {
    type: "done",
    application: {
      ...updated,
      status_history: asHistory(updated.status_history),
    } as TailorApplicationRow,
  };
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
    .from("jp_profiles")
    .select("id, resume_parsed, user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("Profile not found");

  const { data: application, error: appError } = await client
    .from("jp_applications")
    .select(
      "id, profile_id, posting_id, status, tailored_resume, tailored_cover_letter, applied_at, notes, status_history"
    )
    .eq("id", applicationId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (appError) throw new Error(appError.message);
  if (!application) throw new Error("Application not found");

  const { data: posting, error: postingError } = await client
    .from("jp_postings")
    .select(
      "id, company_name, title, location, employment_type, description_raw"
    )
    .eq("id", application.posting_id)
    .maybeSingle();

  if (postingError) throw new Error(postingError.message);
  if (!posting) throw new Error("Posting not found");

  const { data: score } = await client
    .from("jp_scores")
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
