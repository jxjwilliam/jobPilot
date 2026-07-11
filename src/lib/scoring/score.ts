import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLlmClient, getLlmModel } from "@/lib/llm/client";
import { getCompletionText } from "@/lib/llm/message-text";
import {
  ParsedResumeSchema,
  ScoreResultSchema,
  type ParsedResume,
  type ScoreResult,
} from "@/lib/llm/schemas";
import {
  PreferencesSchema,
  type Preferences,
} from "@/lib/profile/types";

export const DEFAULT_MIN_SCORE = 70;
export const DEFAULT_SCORE_BATCH_LIMIT = 50;

export type ScoreProfile = {
  id: string;
  resume_parsed: unknown;
  preferences?: unknown;
};

export type ScorePosting = {
  id: string;
  company_name: string;
  title: string;
  location?: string | null;
  employment_type?: string | null;
  description_raw: string;
  salary_min?: number | null;
  salary_max?: number | null;
};

const SCORE_JSON_SHAPE = `{
  "score": number (0-100),
  "rationale": string,
  "matched_skills": string[],
  "gaps": string[]
}`;

/** Build the user prompt for LLM fit scoring (exported for tests). */
export function buildScoringPrompt(
  resume: ParsedResume,
  preferences: Preferences,
  posting: ScorePosting
): string {
  const salary =
    posting.salary_min != null || posting.salary_max != null
      ? `${posting.salary_min ?? "?"}-${posting.salary_max ?? "?"}`
      : "unknown";

  return `Score how well this candidate fits the job posting.
Return ONLY a JSON object with this shape (no markdown outside the object):
${SCORE_JSON_SHAPE}

Candidate resume (JSON):
${JSON.stringify(resume)}

Candidate preferences (JSON):
${JSON.stringify(preferences)}

Job posting:
- Company: ${posting.company_name}
- Title: ${posting.title}
- Location: ${posting.location ?? "unknown"}
- Employment type: ${posting.employment_type ?? "unknown"}
- Salary range: ${salary}
- Description:
${posting.description_raw.slice(0, 12_000)}`;
}

/** Filter scored rows by minimum score threshold (exported for tests). */
export function filterByMinScore<T extends { score: number }>(
  rows: T[],
  minScore: number
): T[] {
  return rows.filter((row) => row.score >= minScore);
}

export function extractScoreResult(text: string): ScoreResult {
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
  return ScoreResultSchema.parse(raw);
}

function parseProfileFields(profile: ScoreProfile): {
  resume: ParsedResume;
  preferences: Preferences;
} {
  return {
    resume: ParsedResumeSchema.parse(profile.resume_parsed ?? {}),
    preferences: PreferencesSchema.parse(profile.preferences ?? {}),
  };
}

export type ScorePairResult = {
  skipped: boolean;
  reason?: "already_scored";
  result?: ScoreResult;
};

/**
 * Score one profile × posting pair via LLM and upsert into `scores`.
 * Skips if a score row already exists unless `force: true`.
 */
export async function scorePair(
  adminClient: SupabaseClient,
  profile: ScoreProfile,
  posting: ScorePosting,
  options: { force?: boolean } = {}
): Promise<ScorePairResult> {
  if (!options.force) {
    const { data: existing } = await adminClient
      .from("scores")
      .select("id")
      .eq("profile_id", profile.id)
      .eq("posting_id", posting.id)
      .maybeSingle();

    if (existing) {
      return { skipped: true, reason: "already_scored" };
    }
  }

  const { resume, preferences } = parseProfileFields(profile);
  const client = getLlmClient();
  const completion = await client.chat.completions.create({
    model: getLlmModel(),
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a job-fit scoring assistant. Return strict JSON only. Be calibrated: 70+ means a strong realistic fit.",
      },
      {
        role: "user",
        content: buildScoringPrompt(resume, preferences, posting),
      },
    ],
  });

  const content = getCompletionText(completion);
  const result = extractScoreResult(content);

  const { error } = await adminClient.from("scores").upsert(
    {
      profile_id: profile.id,
      posting_id: posting.id,
      score: result.score,
      rationale: result.rationale,
      matched_skills: result.matched_skills,
      gaps: result.gaps,
      scored_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,posting_id" }
  );

  if (error) {
    throw new Error(`Failed to upsert score: ${error.message}`);
  }

  return { skipped: false, result };
}

export type ScoreBatchResult = {
  attempted: number;
  scored: number;
  skipped: number;
  errors: number;
};

function isActiveProfile(profile: ScoreProfile): boolean {
  const resume = ParsedResumeSchema.safeParse(profile.resume_parsed ?? {});
  if (!resume.success) return false;
  const { summary, skills, experience } = resume.data;
  return (
    summary.trim().length > 0 ||
    skills.length > 0 ||
    experience.length > 0
  );
}

/**
 * Score unscored active-profile × active-posting pairs, up to `limit`.
 */
export async function scoreUnscoredBatch(
  adminClient: SupabaseClient,
  options: { limit?: number } = {}
): Promise<ScoreBatchResult> {
  const limit = options.limit ?? DEFAULT_SCORE_BATCH_LIMIT;

  const { data: profiles, error: profilesError } = await adminClient
    .from("profiles")
    .select("id, resume_parsed, preferences");

  if (profilesError) {
    throw new Error(`Failed to load profiles: ${profilesError.message}`);
  }

  const activeProfiles = (profiles ?? []).filter(isActiveProfile);
  if (activeProfiles.length === 0) {
    return { attempted: 0, scored: 0, skipped: 0, errors: 0 };
  }

  const { data: postings, error: postingsError } = await adminClient
    .from("postings")
    .select(
      "id, company_name, title, location, employment_type, description_raw, salary_min, salary_max"
    )
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false })
    .limit(500);

  if (postingsError) {
    throw new Error(`Failed to load postings: ${postingsError.message}`);
  }

  const activePostings = (postings ?? []) as ScorePosting[];
  if (activePostings.length === 0) {
    return { attempted: 0, scored: 0, skipped: 0, errors: 0 };
  }

  const profileIds = activeProfiles.map((p) => p.id);
  const postingIds = activePostings.map((p) => p.id);

  const { data: existingScores, error: scoresError } = await adminClient
    .from("scores")
    .select("profile_id, posting_id")
    .in("profile_id", profileIds)
    .in("posting_id", postingIds);

  if (scoresError) {
    throw new Error(`Failed to load scores: ${scoresError.message}`);
  }

  const scoredKeys = new Set(
    (existingScores ?? []).map((s) => `${s.profile_id}:${s.posting_id}`)
  );

  const pairs: { profile: ScoreProfile; posting: ScorePosting }[] = [];
  for (const profile of activeProfiles) {
    for (const posting of activePostings) {
      const key = `${profile.id}:${posting.id}`;
      if (!scoredKeys.has(key)) {
        pairs.push({ profile, posting });
        if (pairs.length >= limit) break;
      }
    }
    if (pairs.length >= limit) break;
  }

  let scored = 0;
  let skipped = 0;
  let errors = 0;

  for (const { profile, posting } of pairs) {
    try {
      const outcome = await scorePair(adminClient, profile, posting);
      if (outcome.skipped) skipped += 1;
      else scored += 1;
    } catch {
      errors += 1;
    }
  }

  return {
    attempted: pairs.length,
    scored,
    skipped,
    errors,
  };
}
