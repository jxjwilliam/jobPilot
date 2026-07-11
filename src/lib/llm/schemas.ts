import { z } from "zod";

const ExperienceItemSchema = z.object({
  title: z.coerce.string().default(""),
  company: z.coerce.string().default(""),
  start: z.coerce.string().optional(),
  end: z.coerce.string().optional(),
  bullets: z
    .array(z.coerce.string())
    .default([])
    .transform((items) => items.map((b) => b.trim()).filter(Boolean)),
});

const EducationItemSchema = z.object({
  school: z.coerce.string().default(""),
  degree: z.coerce.string().optional(),
  year: z.coerce.string().optional(),
});

export const ParsedResumeSchema = z.object({
  summary: z.coerce.string().default(""),
  skills: z.array(z.coerce.string()).default([]),
  experience: z.array(ExperienceItemSchema).default([]),
  education: z.array(EducationItemSchema).default([]),
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
