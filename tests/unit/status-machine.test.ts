import { describe, it, expect } from "vitest";
import {
  ALLOWED,
  assertTransition,
  canTransition,
  nextStatuses,
} from "@/lib/applications/status";

describe("status machine", () => {
  it("exports ALLOWED transitions for each status", () => {
    expect(ALLOWED.discovered).toEqual(["reviewing", "archived"]);
    expect(ALLOWED.reviewing).toEqual(["applied", "archived"]);
    expect(ALLOWED.applied).toEqual(["screening", "rejected", "archived"]);
    expect(ALLOWED.screening).toEqual(["interview", "rejected", "archived"]);
    expect(ALLOWED.interview).toEqual(["offer", "rejected", "archived"]);
    expect(ALLOWED.offer).toEqual(["archived"]);
    expect(ALLOWED.rejected).toEqual(["archived"]);
    expect(ALLOWED.archived).toEqual([]);
  });

  it("allows valid transitions via canTransition", () => {
    expect(canTransition("discovered", "reviewing")).toBe(true);
    expect(canTransition("reviewing", "applied")).toBe(true);
    expect(canTransition("applied", "screening")).toBe(true);
    expect(canTransition("interview", "rejected")).toBe(true);
    expect(canTransition("offer", "archived")).toBe(true);
  });

  it("rejects invalid transitions via canTransition", () => {
    expect(canTransition("discovered", "applied")).toBe(false);
    expect(canTransition("archived", "reviewing")).toBe(false);
    expect(canTransition("offer", "interview")).toBe(false);
    expect(canTransition("unknown", "applied")).toBe(false);
  });

  it("assertTransition passes for allowed moves", () => {
    expect(() => assertTransition("reviewing", "applied")).not.toThrow();
    expect(() => assertTransition("applied", "rejected")).not.toThrow();
  });

  it("assertTransition throws for disallowed moves", () => {
    expect(() => assertTransition("discovered", "applied")).toThrow(
      "Invalid transition discovered -> applied"
    );
    expect(() => assertTransition("archived", "offer")).toThrow(
      "Invalid transition archived -> offer"
    );
  });

  it("nextStatuses mirrors ALLOWED", () => {
    expect(nextStatuses("screening")).toEqual([
      "interview",
      "rejected",
      "archived",
    ]);
    expect(nextStatuses("archived")).toEqual([]);
  });
});
