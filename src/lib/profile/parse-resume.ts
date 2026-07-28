import "server-only";
import { z } from "zod";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { getLlmClient, getLlmModel } from "@/lib/llm/client";
import { getCompletionText } from "@/lib/llm/message-text";
import {
  ParsedResumeSchema,
  type ParsedResume,
} from "@/lib/llm/schemas";
import {
  PreferencesSchema,
  emptyParsedResume,
  emptyPreferences,
  type Preferences,
} from "@/lib/profile/types";
import { extractJsonObjectRaw } from "@/lib/profile/extract-json";

export { extractJsonObject } from "@/lib/profile/extract-json";

const ExperienceItemSchema = z.object({
  title: z.string().default(""),
  company: z.string().default(""),
  start: z.string().optional(),
  end: z.string().optional(),
  bullets: z.array(z.string()).default([]),
});

const EducationItemSchema = z.object({
  school: z.string().default(""),
  degree: z.string().optional(),
  year: z.string().optional(),
});

const ExtractionPayloadSchema = z.object({
  summary: z.string().default(""),
  skills: z.array(z.string()).default([]),
  experience: z.array(ExperienceItemSchema).default([]),
  education: z.array(EducationItemSchema).default([]),
  preferences: PreferencesSchema.partial().optional(),
});

export type ParseResumeResult = {
  parsed: ParsedResume;
  preferences: Preferences;
  error?: string;
};

async function extractTextFromBuffer(
  buffer: Buffer,
  mimeOrName: string
): Promise<string> {
  const hint = mimeOrName.toLowerCase();
  const isPdf = hint.includes("pdf") || hint.endsWith(".pdf");
  const isDocx =
    hint.includes("wordprocessingml") ||
    hint.includes("docx") ||
    hint.endsWith(".docx") ||
    hint.includes("msword");

  if (isPdf) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text ?? "";
    } finally {
      await parser.destroy();
    }
  }

  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }

  return buffer.toString("utf8");
}

const EXTRACTION_PROMPT = `Extract structured data from this resume text.
Return ONLY a JSON object with this exact shape:
{
  "summary": string,
  "skills": string[],
  "experience": [{ "title": string, "company": string, "start"?: string, "end"?: string, "bullets": string[] }],
  "education": [{ "school": string, "degree"?: string, "year"?: string }],
  "preferences": {
    "roles": string[],
    "locations": string[],
    "remote_pref": "remote" | "hybrid" | "onsite" | "any" | "",
    "salary_floor": number | null,
    "excluded_industries": string[]
  }
}

Rules:
- Fill every field you can from the resume. Do not leave skills/experience empty if present in the text.
- preferences.roles: infer 2-5 target job titles from recent experience (e.g. "Senior Software Engineer").
- preferences.locations: any cities/regions mentioned; include "Remote" if remote work is indicated.
- preferences.remote_pref: best guess from the text, or "" if unknown.
- preferences.salary_floor: only if explicitly stated; otherwise null.
- Never invent employers, degrees, dates, or credentials not in the source.`;

function preferExistingPreferences(
  existing: Preferences,
  suggested: Preferences
): Preferences {
  const pickList = (cur: string[], next: string[]) =>
    cur.length > 0 ? cur : next;
  return {
    roles: pickList(existing.roles, suggested.roles),
    locations: pickList(existing.locations, suggested.locations),
    remote_pref: existing.remote_pref || suggested.remote_pref || "",
    salary_floor:
      existing.salary_floor != null
        ? existing.salary_floor
        : suggested.salary_floor,
    excluded_industries: pickList(
      existing.excluded_industries,
      suggested.excluded_industries
    ),
    // Essentials — keep existing, never overwrite from resume parse
    full_name: existing.full_name || "",
    photo_url: existing.photo_url || "",
    selfie_url: existing.selfie_url || "",
    linkedin_url: existing.linkedin_url || "",
    github_url: existing.github_url || "",
    portfolio_url: existing.portfolio_url || "",
    email: existing.email || "",
    phone: existing.phone || "",
    postcode: existing.postcode || "",
  };
}

function derivePreferencesFallback(resume: ParsedResume): Preferences {
  const roles = [
    ...new Set(
      resume.experience
        .map((e) => e.title?.trim())
        .filter((t): t is string => Boolean(t))
        .slice(0, 5)
    ),
  ];
  return PreferencesSchema.parse({
    roles,
    locations: [],
    remote_pref: "",
    salary_floor: null,
    excluded_industries: [],
    full_name: "",
    photo_url: "",
    selfie_url: "",
    linkedin_url: "",
    github_url: "",
    portfolio_url: "",
    email: "",
    phone: "",
    postcode: "",
  });
}

async function callExtractionLlm(text: string): Promise<unknown> {
  const client = getLlmClient();
  const completion = await client.chat.completions.create({
    model: getLlmModel(),
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You extract structured resume and job-preference data as JSON. Never invent employers or degrees not present in the source. Respond with a single JSON object only.",
      },
      {
        role: "user",
        content: `${EXTRACTION_PROMPT}\n\n---\n${text.slice(0, 60_000)}`,
      },
    ],
  });

  const content = getCompletionText(completion);
  if (!content.trim()) {
    throw new Error("LLM returned empty content");
  }
  return extractJsonObjectRaw(content);
}

function parseExtractionPayload(raw: unknown): {
  parsed: ParsedResume;
  preferences: Preferences;
} {
  const payload = ExtractionPayloadSchema.parse(raw);
  const parsed = ParsedResumeSchema.parse({
    summary: payload.summary,
    skills: payload.skills,
    experience: payload.experience,
    education: payload.education,
  });
  const preferences = PreferencesSchema.parse(payload.preferences ?? {});
  const withFallback =
    preferences.roles.length === 0
      ? {
          ...preferences,
          roles: derivePreferencesFallback(parsed).roles,
        }
      : preferences;
  return { parsed, preferences: withFallback };
}

export function isResumePopulated(resume: ParsedResume): boolean {
  return Boolean(
    resume.summary?.trim() ||
      resume.skills.length > 0 ||
      resume.experience.length > 0 ||
      resume.education.length > 0
  );
}

export async function parseResumeFromBuffer(
  buffer: Buffer,
  mimeOrName: string,
  options?: { existingPreferences?: Preferences }
): Promise<ParseResumeResult> {
  try {
    const text = await extractTextFromBuffer(buffer, mimeOrName);
    if (!text.trim()) {
      return {
        parsed: emptyParsedResume(),
        preferences: options?.existingPreferences ?? emptyPreferences(),
        error: "Could not extract text from resume file",
      };
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callExtractionLlm(text);
        const { parsed, preferences } = parseExtractionPayload(raw);
        if (!isResumePopulated(parsed)) {
          throw new Error("LLM returned an empty resume structure");
        }
        return {
          parsed,
          preferences: preferExistingPreferences(
            options?.existingPreferences ?? emptyPreferences(),
            preferences
          ),
        };
      } catch (err) {
        lastError = err;
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : "Resume parse failed";
    return {
      parsed: emptyParsedResume(),
      preferences: options?.existingPreferences ?? emptyPreferences(),
      error: message,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Resume parse failed";
    return {
      parsed: emptyParsedResume(),
      preferences: options?.existingPreferences ?? emptyPreferences(),
      error: message,
    };
  }
}
