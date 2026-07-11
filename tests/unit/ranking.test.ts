import { describe, it, expect } from "vitest";
import { rankPostingsForProfile, type ScorePosting } from "@/lib/scoring/score";
import type { ParsedResume } from "@/lib/llm/schemas";
import type { Preferences } from "@/lib/profile/types";

const resume: ParsedResume = {
  summary: "Senior full-stack engineer",
  skills: ["TypeScript", "React", "Python"],
  experience: [],
  education: [],
};

const preferences: Preferences = {
  roles: ["Senior Software Engineer", "Full-Stack Engineer"],
  locations: ["Remote"],
  remote_pref: "remote",
  salary_floor: 150000,
  excluded_industries: [],
};

function posting(
  partial: Partial<ScorePosting> & Pick<ScorePosting, "id" | "title">
): ScorePosting {
  return {
    company_name: partial.company_name ?? "Acme",
    location: partial.location ?? null,
    employment_type: null,
    description_raw: partial.description_raw ?? "",
    salary_min: null,
    salary_max: null,
    ...partial,
  };
}

describe("rankPostingsForProfile", () => {
  it("ranks software roles above unrelated aerospace noise", () => {
    const ranked = rankPostingsForProfile(
      [
        posting({
          id: "1",
          title: "Welder",
          company_name: "Hermeus",
          description_raw: "Weld aircraft parts",
        }),
        posting({
          id: "2",
          title: "Senior Software Engineer",
          company_name: "Stripe",
          location: "Remote",
          description_raw: "TypeScript React Python platform",
        }),
        posting({
          id: "3",
          title: "Flight Software Engineer",
          company_name: "Hermeus",
          description_raw: "Avionics C++",
        }),
      ],
      resume,
      preferences
    );

    expect(ranked[0].id).toBe("2");
    expect(ranked.map((p) => p.id).slice(-1)[0]).not.toBe("2");
  });
});
