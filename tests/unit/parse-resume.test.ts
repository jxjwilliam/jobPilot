import { describe, it, expect } from "vitest";
import { extractJsonObject } from "@/lib/profile/parse-resume";

describe("extractJsonObject", () => {
  it("parses fenced json", () => {
    const raw =
      'Here:\n```json\n{"summary":"x","skills":["a"],"experience":[],"education":[]}\n```';
    expect(extractJsonObject(raw).skills).toEqual(["a"]);
  });
});
