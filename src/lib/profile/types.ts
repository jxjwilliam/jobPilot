import { z } from "zod";
import {
  ParsedResumeSchema,
  type ParsedResume,
} from "@/lib/llm/schemas";

export const PreferencesSchema = z.object({
  roles: z.array(z.coerce.string()).default([]),
  locations: z.array(z.coerce.string()).default([]),
  remote_pref: z.coerce.string().default(""),
  salary_floor: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    }),
  excluded_industries: z.array(z.coerce.string()).default([]),
  // Essentials / quick-reference info
  full_name: z.coerce.string().default(""),
  photo_url: z.coerce.string().default(""),
  selfie_url: z.coerce.string().default(""),
  linkedin_url: z.coerce.string().default(""),
  github_url: z.coerce.string().default(""),
  portfolio_url: z.coerce.string().default(""),
  email: z.coerce.string().default(""),
  phone: z.coerce.string().default(""),
  postcode: z.coerce.string().default(""),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

export const emptyParsedResume = (): ParsedResume =>
  ParsedResumeSchema.parse({});

export const emptyPreferences = (): Preferences =>
  PreferencesSchema.parse({});
