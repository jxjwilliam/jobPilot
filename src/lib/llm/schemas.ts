import { z } from "zod";

export const ParsedResumeSchema = z.object({
  summary: z.string().default(""),
  skills: z.array(z.string()).default([]),
  experience: z
    .array(
      z.object({
        title: z.string(),
        company: z.string(),
        start: z.string().optional(),
        end: z.string().optional(),
        bullets: z.array(z.string()).default([]),
      })
    )
    .default([]),
  education: z
    .array(
      z.object({
        school: z.string(),
        degree: z.string().optional(),
        year: z.string().optional(),
      })
    )
    .default([]),
});

export const ScoreResultSchema = z.object({
  score: z.number().min(0).max(100),
  rationale: z.string(),
  matched_skills: z.array(z.string()),
  gaps: z.array(z.string()),
});

export const TailorResultSchema = z.object({
  tailored_resume: ParsedResumeSchema,
  cover_letter: z.string(),
  change_summary: z.string().optional(),
});

export type ParsedResume = z.infer<typeof ParsedResumeSchema>;
export type ScoreResult = z.infer<typeof ScoreResultSchema>;
export type TailorResult = z.infer<typeof TailorResultSchema>;
