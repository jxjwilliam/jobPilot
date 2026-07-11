import { describe, it, expect } from "vitest";
import { normalizeGreenhouseJob } from "@/lib/ingestion/greenhouse";
import { normalizeLeverPosting } from "@/lib/ingestion/lever";

describe("normalizeGreenhouseJob", () => {
  it("maps Greenhouse job JSON into NormalizedPosting", () => {
    const normalized = normalizeGreenhouseJob(
      {
        id: 7954688,
        title: "Account Executive, AI Sales (Grower)",
        absolute_url: "https://stripe.com/jobs/search?gh_jid=7954688",
        location: { name: "San Francisco, CA" },
        content:
          "&lt;h2&gt;Who we are&lt;/h2&gt;\n&lt;p&gt;Stripe is a financial infrastructure platform.&lt;/p&gt;",
        first_published: "2026-06-02T08:58:57-04:00",
        updated_at: "2026-06-26T17:05:44-04:00",
        company_name: "Stripe",
        metadata: [
          { name: "Employment Type", value: "Full-time" },
          { name: "Salary Min", value: "120000" },
          { name: "Salary Max", value: "180000" },
        ],
      },
      "Stripe"
    );

    expect(normalized).toEqual({
      external_id: "7954688",
      title: "Account Executive, AI Sales (Grower)",
      location: "San Francisco, CA",
      description_raw:
        "<h2>Who we are</h2>\n<p>Stripe is a financial infrastructure platform.</p>",
      apply_url: "https://stripe.com/jobs/search?gh_jid=7954688",
      posted_at: "2026-06-02T08:58:57-04:00",
      employment_type: "Full-time",
      salary_min: 120000,
      salary_max: 180000,
      company_name: "Stripe",
    });
  });

  it("falls back to companyName and updated_at when optional fields missing", () => {
    const normalized = normalizeGreenhouseJob(
      {
        id: "42",
        title: "Engineer",
        updated_at: "2026-01-01T00:00:00Z",
        content: null,
      },
      "Acme"
    );

    expect(normalized.external_id).toBe("42");
    expect(normalized.location).toBeNull();
    expect(normalized.description_raw).toBe("");
    expect(normalized.apply_url).toBeNull();
    expect(normalized.posted_at).toBe("2026-01-01T00:00:00Z");
    expect(normalized.company_name).toBe("Acme");
  });
});

describe("normalizeLeverPosting", () => {
  it("maps Lever posting JSON into NormalizedPosting", () => {
    const createdAt = 1_700_000_000_000;
    const normalized = normalizeLeverPosting(
      {
        id: "66acb66f-de37-4d95-a353-874db92838ef",
        text: "Advertiser Solutions Vendor Lead",
        hostedUrl:
          "https://jobs.lever.co/spotify/66acb66f-de37-4d95-a353-874db92838ef",
        applyUrl:
          "https://jobs.lever.co/spotify/66acb66f-de37-4d95-a353-874db92838ef/apply",
        createdAt,
        descriptionPlain: "Join the Advertiser Solutions team.",
        additionalPlain: "Spotify is an equal opportunity employer.",
        workplaceType: "hybrid",
        categories: {
          commitment: "Permanent",
          location: "London",
          department: "Advertising",
          team: "Sales",
        },
        salaryRange: { min: 90000, max: 130000, currency: "GBP", interval: "per-year-salary" },
      },
      "Spotify"
    );

    expect(normalized).toEqual({
      external_id: "66acb66f-de37-4d95-a353-874db92838ef",
      title: "Advertiser Solutions Vendor Lead",
      location: "London",
      description_raw:
        "Join the Advertiser Solutions team.\n\nSpotify is an equal opportunity employer.",
      apply_url:
        "https://jobs.lever.co/spotify/66acb66f-de37-4d95-a353-874db92838ef/apply",
      posted_at: new Date(createdAt).toISOString(),
      employment_type: "Permanent",
      salary_min: 90000,
      salary_max: 130000,
      company_name: "Spotify",
    });
  });

  it("uses allLocations and hostedUrl fallbacks", () => {
    const normalized = normalizeLeverPosting(
      {
        id: "abc",
        text: "Designer",
        hostedUrl: "https://jobs.lever.co/acme/abc",
        categories: { allLocations: ["Remote", "NYC"] },
        description: "<p>Hello</p>",
      },
      "Acme"
    );

    expect(normalized.location).toBe("Remote, NYC");
    expect(normalized.apply_url).toBe("https://jobs.lever.co/acme/abc");
    expect(normalized.description_raw).toBe("<p>Hello</p>");
    expect(normalized.posted_at).toBeNull();
  });
});
