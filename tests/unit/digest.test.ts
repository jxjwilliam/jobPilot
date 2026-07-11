import { describe, it, expect } from "vitest";
import { buildDigestForUser, type DigestData } from "@/lib/notifications/digest";

const baseData = (overrides: Partial<DigestData> = {}): DigestData => ({
  highFit: {
    count: 3,
    sampleTitles: ["Staff Engineer", "Senior TypeScript", "Platform Lead"],
  },
  reviewing: {
    count: 2,
    sampleTitles: ["Frontend Engineer", "Full Stack"],
  },
  quota: {
    tier: "free",
    limit: 5,
    count: 2,
  },
  ...overrides,
});

describe("buildDigestForUser", () => {
  it("builds subject with high-fit count when matches exist", () => {
    const { subject, html } = buildDigestForUser(
      { email: "ada@example.com" },
      baseData()
    );

    expect(subject).toBe("JobPilot weekly digest: 3 new high-fit roles");
    expect(html).toContain("ada@example.com");
    expect(html).toContain("<strong>3</strong>");
    expect(html).toContain("Staff Engineer");
    expect(html).toContain("Senior TypeScript");
    expect(html).toContain("<strong>2</strong>");
    expect(html).toContain("Frontend Engineer");
    expect(html).toContain("3 of 5");
    expect(html).toContain("2 used this period");
  });

  it("uses singular wording for one high-fit match", () => {
    const { subject, html } = buildDigestForUser(
      { email: "bob@example.com" },
      baseData({
        highFit: { count: 1, sampleTitles: ["Solo Role"] },
        reviewing: { count: 1, sampleTitles: ["Draft A"] },
      })
    );

    expect(subject).toBe("JobPilot weekly digest: 1 new high-fit role");
    expect(html).toContain("Solo Role");
    expect(html).toContain("<strong>1</strong> tailored application");
  });

  it("uses generic subject when no high-fit matches", () => {
    const { subject, html } = buildDigestForUser(
      { email: "c@example.com", name: "Casey" },
      baseData({
        highFit: { count: 0, sampleTitles: [] },
        reviewing: { count: 0, sampleTitles: [] },
      })
    );

    expect(subject).toBe("Your JobPilot weekly digest");
    expect(html).toContain("Hi Casey,");
    expect(html).toContain("<em>None</em>");
  });

  it("shows unlimited quota for pro", () => {
    const { html } = buildDigestForUser(
      { email: "pro@example.com" },
      baseData({
        quota: { tier: "pro", limit: null, count: 99 },
      })
    );

    expect(html).toContain("Unlimited");
    expect(html).not.toContain("used this period");
  });

  it("clamps free remaining at zero when over limit", () => {
    const { html } = buildDigestForUser(
      { email: "over@example.com" },
      baseData({
        quota: { tier: "free", limit: 5, count: 8 },
      })
    );

    expect(html).toContain("0 of 5");
  });

  it("escapes HTML in titles and greeting", () => {
    const { html } = buildDigestForUser(
      { email: "x@example.com", name: `<script>alert(1)</script>` },
      baseData({
        highFit: {
          count: 1,
          sampleTitles: [`Engineer <b>XSS</b>`],
        },
      })
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Engineer &lt;b&gt;XSS&lt;/b&gt;");
  });
});
