import { describe, it, expect } from "vitest";
import {
  buildTailorPrompt,
  TAILOR_NO_FABRICATION_GUARDRAIL,
} from "@/lib/tailoring/tailor";
import type { ParsedResume } from "@/lib/llm/schemas";

const resume: ParsedResume = {
  summary: "Senior TypeScript engineer",
  skills: ["TypeScript", "React"],
  experience: [
    {
      title: "Engineer",
      company: "Acme",
      start: "2020",
      end: "2024",
      bullets: ["Built APIs"],
    },
  ],
  education: [{ school: "State U", degree: "BS CS", year: "2019" }],
};

describe("buildTailorPrompt", () => {
  it("includes no-fabrication guardrail string", () => {
    const prompt = buildTailorPrompt({
      resume,
      posting: {
        id: "p1",
        company_name: "Globex",
        title: "Staff Engineer",
        location: "Remote",
        employment_type: "full_time",
        description_raw: "Need TypeScript and React experience.",
      },
      score: {
        score: 88,
        matched_skills: ["TypeScript"],
        gaps: ["Go"],
      },
    });

    expect(prompt).toContain(TAILOR_NO_FABRICATION_GUARDRAIL);
    expect(prompt.toLowerCase()).toContain("never fabricate");
    expect(prompt).toContain("Globex");
    expect(prompt).toContain("Staff Engineer");
    expect(prompt).toContain("TypeScript");
  });

  it("includes regenerate instruction when provided", () => {
    const prompt = buildTailorPrompt({
      resume,
      posting: {
        id: "p1",
        company_name: "Globex",
        title: "Staff Engineer",
        description_raw: "Need TypeScript.",
      },
      instruction: "Emphasize leadership and keep the cover letter under 200 words.",
    });

    expect(prompt).toContain(TAILOR_NO_FABRICATION_GUARDRAIL);
    expect(prompt).toContain("Emphasize leadership");
  });
});
