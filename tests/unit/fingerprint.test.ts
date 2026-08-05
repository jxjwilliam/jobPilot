import { describe, it, expect } from "vitest";
import { canonicalStringify, resumeFingerprint } from "@/lib/pipeline/fingerprint";

describe("canonicalStringify", () => {
  it("is independent of object key order", () => {
    expect(canonicalStringify({ a: 1, b: 2 })).toBe(canonicalStringify({ b: 2, a: 1 }));
  });

  it("handles nested objects and arrays deterministically", () => {
    // Array element order is meaningful (canonical JSON preserves it); only
    // object key order must be normalized.
    const a = { x: [{ b: 1, a: 2 }, 3], y: "z" };
    const b = { y: "z", x: [{ a: 2, b: 1 }, 3] };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });

  it("serializes primitives and null", () => {
    expect(canonicalStringify(null)).toBe("null");
    expect(canonicalStringify("hi")).toBe('"hi"');
    expect(canonicalStringify(42)).toBe("42");
  });
});

describe("resumeFingerprint", () => {
  it("is deterministic for the same resume", () => {
    const resume = { skills: ["TypeScript", "React"], summary: "SWE" };
    expect(resumeFingerprint(resume)).toBe(resumeFingerprint(resume));
  });

  it("is stable across key-order differences", () => {
    const a = { skills: ["TypeScript"], summary: "SWE" };
    const b = { summary: "SWE", skills: ["TypeScript"] };
    expect(resumeFingerprint(a)).toBe(resumeFingerprint(b));
  });

  it("differs for different resumes", () => {
    expect(resumeFingerprint({ skills: ["React"] })).not.toBe(
      resumeFingerprint({ skills: ["Python"] })
    );
  });

  it("handles empty and null inputs", () => {
    expect(resumeFingerprint({})).toBe(resumeFingerprint(null));
    expect(resumeFingerprint(undefined)).toBe(resumeFingerprint({}));
    expect(typeof resumeFingerprint(null)).toBe("string");
  });
});
