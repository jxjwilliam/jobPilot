import { describe, it, expect } from "vitest";
import { ScoreResultSchema, ParsedResumeSchema } from "@/lib/llm/schemas";

describe("ScoreResultSchema", () => {
  it("parses valid score payload", () => {
    const parsed = ScoreResultSchema.parse({
      score: 82,
      rationale: "Strong TypeScript match",
      matched_skills: ["TypeScript"],
      gaps: ["Kubernetes"],
    });
    expect(parsed.score).toBe(82);
  });

  it("rejects score out of range", () => {
    expect(() =>
      ScoreResultSchema.parse({ score: 120, rationale: "x", matched_skills: [], gaps: [] })
    ).toThrow();
  });
});

describe("ParsedResumeSchema", () => {
  it("accepts minimal resume", () => {
    const parsed = ParsedResumeSchema.parse({
      summary: "Engineer",
      skills: ["Go"],
      experience: [],
      education: [],
    });
    expect(parsed.skills).toEqual(["Go"]);
  });
});
