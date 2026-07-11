import { describe, it, expect } from "vitest";
import { canTailor, FREE_MONTHLY_LIMIT } from "@/lib/billing/quota";

describe("canTailor", () => {
  it("allows free user under limit", () => {
    expect(canTailor({ tier: "free", tailoring_count: 4 })).toBe(true);
  });
  it("blocks free user at limit", () => {
    expect(canTailor({ tier: "free", tailoring_count: FREE_MONTHLY_LIMIT })).toBe(
      false
    );
  });
  it("allows pro always", () => {
    expect(canTailor({ tier: "pro", tailoring_count: 999 })).toBe(true);
  });
});
