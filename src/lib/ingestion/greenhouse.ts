import {
  ATS_TIMEOUT_MS,
  ATS_USER_AGENT,
  AtsHttpError,
  type NormalizedPosting,
} from "./types";

export type GreenhouseJob = {
  id: number | string;
  title: string;
  absolute_url?: string | null;
  location?: { name?: string | null } | null;
  content?: string | null;
  first_published?: string | null;
  updated_at?: string | null;
  company_name?: string | null;
  metadata?: Array<{ name?: string | null; value?: unknown }> | null;
};

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) =>
      String.fromCharCode(Number.parseInt(n, 10))
    );
}

function metadataValue(
  metadata: GreenhouseJob["metadata"],
  names: string[]
): string | null {
  if (!Array.isArray(metadata)) return null;
  const lowered = names.map((n) => n.toLowerCase());
  for (const entry of metadata) {
    const name = entry?.name?.toLowerCase?.() ?? "";
    if (!lowered.includes(name)) continue;
    const value = entry.value;
    if (value == null) return null;
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map(String).join(", ");
    }
  }
  return null;
}

function parseSalaryNumber(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function normalizeGreenhouseJob(
  job: GreenhouseJob,
  companyName: string
): NormalizedPosting {
  const employment =
    metadataValue(job.metadata, [
      "employment type",
      "employment_type",
      "job type",
      "type",
    ]) ?? null;
  const salaryMin = parseSalaryNumber(
    metadataValue(job.metadata, ["salary min", "salary_min", "minimum salary"])
  );
  const salaryMax = parseSalaryNumber(
    metadataValue(job.metadata, ["salary max", "salary_max", "maximum salary"])
  );

  return {
    external_id: String(job.id),
    title: job.title,
    location: job.location?.name?.trim() || null,
    description_raw: decodeHtmlEntities(job.content ?? ""),
    apply_url: job.absolute_url ?? null,
    posted_at: job.first_published ?? job.updated_at ?? null,
    employment_type: employment,
    salary_min: salaryMin,
    salary_max: salaryMax,
    company_name: job.company_name?.trim() || companyName,
  };
}

export async function fetchGreenhouseJobs(
  boardSlug: string,
  companyName: string
): Promise<NormalizedPosting[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardSlug)}/jobs?content=true`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATS_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ATS_USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });

    if (res.status === 404 || res.status === 429) {
      throw new AtsHttpError(res.status, `Greenhouse ${res.status} for ${boardSlug}`);
    }
    if (!res.ok) {
      throw new AtsHttpError(res.status, `Greenhouse HTTP ${res.status} for ${boardSlug}`);
    }

    const body = (await res.json()) as { jobs?: GreenhouseJob[] };
    const jobs = Array.isArray(body.jobs) ? body.jobs : [];
    return jobs.map((job) => normalizeGreenhouseJob(job, companyName));
  } finally {
    clearTimeout(timer);
  }
}
