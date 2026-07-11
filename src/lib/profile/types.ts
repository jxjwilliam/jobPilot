import { z } from "zod";
import {
  ParsedResumeSchema,
  type ParsedResume,
} from "@/lib/llm/schemas";

export const PreferencesSchema = z.object({
  roles: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  remote_pref: z.string().default(""),
  salary_floor: z.number().nullable().default(null),
  excluded_industries: z.array(z.string()).default([]),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

export const emptyParsedResume = (): ParsedResume =>
  ParsedResumeSchema.parse({});

export const emptyPreferences = (): Preferences =>
  PreferencesSchema.parse({});
