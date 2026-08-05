import { describe, it, expect } from "vitest";
import {
  isPipelineStale,
  isLockLive,
  PIPELINE_TTL_MS,
  PIPELINE_LOCK_TIMEOUT_MS,
} from "@/lib/pipeline/state";
import { classifyProfiles } from "@/lib/pipeline/classify";
import { markAndFilterApplied } from "@/lib/matches/applied";

describe("isPipelineStale", () => {
  const now = 1_700_000_000_000;

  it("is stale when there has never been a poll", () => {
    expect(isPipelineStale(null, now)).toBe(true);
  });

  it("is not stale when the last poll is fresh", () => {
    expect(isPipelineStale(new Date(now - 1000).toISOString(), now)).toBe(false);
  });

  it("is stale when older than the TTL", () => {
    expect(
      isPipelineStale(new Date(now - PIPELINE_TTL_MS - 1000).toISOString(), now)
    ).toBe(true);
  });
});

describe("isLockLive", () => {
  const now = 1_700_000_000_000;

  it("is not live when not running", () => {
    expect(isLockLive(false, null, now)).toBe(false);
    expect(isLockLive(false, new Date(now).toISOString(), now)).toBe(false);
  });

  it("is live when running recently", () => {
    expect(isLockLive(true, new Date(now).toISOString(), now)).toBe(true);
  });

  it("is not live when running started too long ago (stale lock)", () => {
    expect(
      isLockLive(true, new Date(now - PIPELINE_LOCK_TIMEOUT_MS - 1000).toISOString(), now)
    ).toBe(false);
  });
});

describe("classifyProfiles", () => {
  const resumeA = { skills: ["TypeScript"] };
  const resumeB = { skills: ["Python"] };

  it("backfills profiles that have never been fingerprinted", () => {
    const { backfill, changed } = classifyProfiles([
      { id: "1", resume_parsed: resumeA, resume_fingerprint: null },
    ]);
    expect(backfill.map((p) => p.id)).toEqual(["1"]);
    expect(changed).toEqual([]);
  });

  it("flags profiles whose fingerprint differs from their current resume", () => {
    const fp = classifyProfiles([
      { id: "1", resume_parsed: resumeB, resume_fingerprint: "old-hash" },
    ]);
    expect(fp.changed.map((c) => c.profile.id)).toEqual(["1"]);
    expect(fp.changed[0].fingerprint).toBeTypeOf("string");
  });

  it("skips profiles whose fingerprint matches their current resume", () => {
    // Compute the real hash for resumeA, then classify a profile that already
    // stored it — it must not be flagged as changed.
    const hashOfA = classifyProfiles([{ id: "1", resume_parsed: resumeA }], {
      force: true,
    }).changed[0].fingerprint;
    const { backfill, changed } = classifyProfiles([
      { id: "1", resume_parsed: resumeA, resume_fingerprint: hashOfA },
    ]);
    expect(backfill).toEqual([]);
    expect(changed).toEqual([]);
  });

  it("forces everything to changed when force is set", () => {
    const { backfill, changed } = classifyProfiles(
      [
        { id: "1", resume_parsed: resumeA, resume_fingerprint: null },
        { id: "2", resume_parsed: resumeB, resume_fingerprint: "any" },
      ],
      { force: true }
    );
    expect(backfill).toEqual([]);
    expect(changed.map((c) => c.profile.id).sort()).toEqual(["1", "2"]);
  });
});

describe("markAndFilterApplied", () => {
  const rows = [
    { posting_id: "a", score: 80 },
    { posting_id: "b", score: 70 },
    { posting_id: "c", score: 60 },
  ];

  it("filters applied rows out by default", () => {
    const result = markAndFilterApplied(rows, ["a", "c"], false);
    expect(result.map((r) => r.posting_id)).toEqual(["b"]);
  });

  it("keeps and flags applied rows when includeApplied is true", () => {
    const result = markAndFilterApplied(rows, ["a", "c"], true);
    expect(result.map((r) => r.posting_id)).toEqual(["a", "b", "c"]);
    expect(result.find((r) => r.posting_id === "a")?.applied).toBe(true);
    expect(result.find((r) => r.posting_id === "b")?.applied).toBe(false);
  });

  it("handles an empty applied set", () => {
    const result = markAndFilterApplied(rows, [], false);
    expect(result.length).toBe(3);
    expect(result.every((r) => r.applied === false)).toBe(true);
  });
});
