import { describe, it, expect } from "vitest";
import {
  buildScoringPrompt,
  extractScoreResult,
  filterByMinScore,
  DEFAULT_MIN_SCORE,
} from "@/lib/scoring/score";
import type { ParsedResume } from "@/lib/llm/schemas";
import type { Preferences } from "@/lib/profile/types";

const resume: ParsedResume = {
  summary: "Senior TypeScript engineer",
  skills: ["TypeScript", "React"],
  experience: [
    {
      title: "Engineer",
      company: "Acme",
      bullets: ["Built APIs"],
    },
  ],
  education: [],
};

const preferences: Preferences = {
  roles: ["Software Engineer"],
  locations: ["Remote"],
  remote_pref: "remote",
  salary_floor: 150000,
  excluded_industries: [],
};

describe("buildScoringPrompt", () => {
  it("includes JSON shape and posting fields", () => {
    const prompt = buildScoringPrompt(resume, preferences, {
      id: "p1",
      company_name: "Globex",
      title: "Staff Engineer",
      location: "Remote",
      employment_type: "full_time",
      description_raw: "Need TypeScript and React experience.",
      salary_min: 160000,
      salary_max: 200000,
    });

    expect(prompt).toContain('"score": number (0-100)');
    expect(prompt).toContain("matched_skills");
    expect(prompt).toContain("Globex");
    expect(prompt).toContain("Staff Engineer");
    expect(prompt).toContain("TypeScript");
    expect(prompt).toContain("Need TypeScript and React experience.");
  });
});

describe("filterByMinScore", () => {
  it("keeps rows at or above threshold", () => {
    const rows = [
      { score: 90, id: "a" },
      { score: 70, id: "b" },
      { score: 69, id: "c" },
    ];
    expect(filterByMinScore(rows, DEFAULT_MIN_SCORE).map((r) => r.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns empty when nothing meets threshold", () => {
    expect(filterByMinScore([{ score: 10 }], 70)).toEqual([]);
  });
});

describe("extractScoreResult", () => {
  it("parses fenced JSON score payload", () => {
    const raw = `\`\`\`json
{"score":88,"rationale":"Strong match","matched_skills":["TypeScript"],"gaps":["Go"]}
\`\`\``;
    const parsed = extractScoreResult(raw);
    expect(parsed.score).toBe(88);
    expect(parsed.matched_skills).toEqual(["TypeScript"]);
  });

  it("rejects invalid scores", () => {
    expect(() =>
      extractScoreResult(
        '{"score":101,"rationale":"x","matched_skills":[],"gaps":[]}'
      )
    ).toThrow();
  });
});
