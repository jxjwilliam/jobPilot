import { describe, it, expect } from "vitest";
import { normalizeGreenhouseJob } from "@/lib/ingestion/greenhouse";
import { normalizeLeverPosting } from "@/lib/ingestion/lever";
import { normalizeAshbyJob } from "@/lib/ingestion/ashby";
import { normalizeWorkableJob } from "@/lib/ingestion/workable";
import { normalizeRecruiteeOffer } from "@/lib/ingestion/recruitee";
import { normalizePersonioJob } from "@/lib/ingestion/personio";

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

describe("normalizeAshbyJob", () => {
  it("maps Ashby job JSON into NormalizedPosting", () => {
    const normalized = normalizeAshbyJob(
      {
        id: "a1b2c3d4",
        title: "Senior Software Engineer",
        location: "Remote (US)",
        descriptionPlain: "Build the future of hiring.",
        applyUrl: "https://jobs.ashbyhq.com/vercel/a1b2c3d4",
        publishedAt: "2026-07-01T12:00:00Z",
        employmentType: "Full-time",
        compensation: {
          salary: { min: 150000, max: 200000 },
        },
      },
      "Vercel"
    );

    expect(normalized).toEqual({
      external_id: "a1b2c3d4",
      title: "Senior Software Engineer",
      location: "Remote (US)",
      description_raw: "Build the future of hiring.",
      apply_url: "https://jobs.ashbyhq.com/vercel/a1b2c3d4",
      posted_at: "2026-07-01T12:00:00Z",
      employment_type: "Full-time",
      salary_min: 150000,
      salary_max: 200000,
      company_name: "Vercel",
    });
  });

  it("falls back to updatedAt and handles nulls", () => {
    const normalized = normalizeAshbyJob(
      {
        id: "x",
        title: "Designer",
        updatedAt: "2026-01-01T00:00:00Z",
        descriptionHtml: "<p>Design role</p>",
      },
      "Acme"
    );

    expect(normalized.description_raw).toBe("<p>Design role</p>");
    expect(normalized.posted_at).toBe("2026-01-01T00:00:00Z");
    expect(normalized.apply_url).toBeNull();
    expect(normalized.salary_min).toBeNull();
  });
});

describe("normalizeWorkableJob", () => {
  it("maps Workable job JSON into NormalizedPosting", () => {
    const normalized = normalizeWorkableJob(
      {
        id: "w123",
        title: "Product Manager",
        location: "New York, NY",
        description: "Lead product initiatives.",
        requirements: "5+ years experience",
        benefits: "Health, 401k",
        application_url: "https://apply.workable.com/acme/w123",
        published: "2026-06-15T10:00:00Z",
        employment_type: "Permanent",
        salary_from: 120000,
        salary_to: 160000,
      },
      "Acme Corp"
    );

    expect(normalized.external_id).toBe("w123");
    expect(normalized.title).toBe("Product Manager");
    expect(normalized.location).toBe("New York, NY");
    expect(normalized.description_raw).toContain("Lead product initiatives.");
    expect(normalized.description_raw).toContain("5+ years experience");
    expect(normalized.description_raw).toContain("Health, 401k");
    expect(normalized.apply_url).toBe("https://apply.workable.com/acme/w123");
    expect(normalized.salary_min).toBe(120000);
    expect(normalized.salary_max).toBe(160000);
    expect(normalized.employment_type).toBe("Permanent");
  });

  it("uses shortlink fallback for apply_url", () => {
    const normalized = normalizeWorkableJob(
      {
        id: "w456",
        title: "Engineer",
        shortlink: "https://acme.workable.com/j/w456",
      },
      "Acme"
    );

    expect(normalized.apply_url).toBe("https://acme.workable.com/j/w456");
    expect(normalized.description_raw).toBe("");
  });
});

describe("normalizeRecruiteeOffer", () => {
  it("maps Recruitee offer JSON into NormalizedPosting", () => {
    const normalized = normalizeRecruiteeOffer(
      {
        id: 9876,
        title: "Backend Developer",
        city: "Berlin",
        country: "Germany",
        description: "Join our engineering team.",
        requirements: "Node.js, PostgreSQL",
        offer_url: "https://acme.recruitee.com/o/backend-developer",
        published_at: "2026-05-20T08:00:00Z",
        employment_type: "Full-time",
        min_salary: 60000,
        max_salary: 80000,
      },
      "Acme GmbH"
    );

    expect(normalized.external_id).toBe("9876");
    expect(normalized.title).toBe("Backend Developer");
    expect(normalized.location).toBe("Berlin, Germany");
    expect(normalized.description_raw).toContain("Join our engineering team.");
    expect(normalized.apply_url).toBe("https://acme.recruitee.com/o/backend-developer");
    expect(normalized.salary_min).toBe(60000);
    expect(normalized.salary_max).toBe(80000);
    expect(normalized.employment_type).toBe("Full-time");
    expect(normalized.company_name).toBe("Acme GmbH");
  });

  it("handles missing city/country gracefully", () => {
    const normalized = normalizeRecruiteeOffer(
      { id: 1, title: "Remote Role", description: "Work from anywhere." },
      "RemoteCo"
    );

    expect(normalized.location).toBeNull();
    expect(normalized.posted_at).toBeNull();
    expect(normalized.salary_min).toBeNull();
  });
});

describe("normalizePersonioJob", () => {
  it("maps Personio job JSON into NormalizedPosting", () => {
    const normalized = normalizePersonioJob(
      {
        id: 5001,
        name: "Marketing Manager",
        office: "Munich",
        department: "Marketing",
        employment_type: "Full-time",
        description: "Drive our marketing strategy.",
        created_at: "2026-04-01T09:00:00Z",
        application_url: "https://acme.jobs.personio.com/job/5001",
      },
      "Acme AG"
    );

    expect(normalized.external_id).toBe("5001");
    expect(normalized.title).toBe("Marketing Manager");
    expect(normalized.location).toBe("Munich");
    expect(normalized.description_raw).toContain("Drive our marketing strategy.");
    expect(normalized.apply_url).toBe("https://acme.jobs.personio.com/job/5001");
    expect(normalized.posted_at).toBe("2026-04-01T09:00:00Z");
    expect(normalized.employment_type).toBe("Full-time");
    expect(normalized.company_name).toBe("Acme AG");
  });

  it("uses schedule as employment_type fallback", () => {
    const normalized = normalizePersonioJob(
      {
        id: 2,
        name: "Part-time Developer",
        schedule: "Part-time",
      },
      "FlexCo"
    );

    expect(normalized.employment_type).toBe("Part-time");
    expect(normalized.location).toBeNull();
    expect(normalized.apply_url).toBeNull();
  });
});
