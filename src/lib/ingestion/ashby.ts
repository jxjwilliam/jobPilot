import {
  ATS_TIMEOUT_MS,
  ATS_USER_AGENT,
  AtsHttpError,
  type NormalizedPosting,
} from "./types";

type AshbyJob = {
  id: string;
  title: string;
  location?: string | null;
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  applyUrl?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  employmentType?: string | null;
  department?: string | null;
  team?: string | null;
  compensation?: {
    summary?: string | null;
    salary?: { min?: number | null; max?: number | null } | null;
  } | null;
};

export function normalizeAshbyJob(
  job: AshbyJob,
  companyName: string
): NormalizedPosting {
  return {
    external_id: job.id,
    title: job.title,
    location: job.location?.trim() || null,
    description_raw: job.descriptionPlain ?? job.descriptionHtml ?? "",
    apply_url: job.applyUrl ?? null,
    posted_at: job.publishedAt ?? job.updatedAt ?? null,
    employment_type: job.employmentType?.trim() || null,
    salary_min: job.compensation?.salary?.min ?? null,
    salary_max: job.compensation?.salary?.max ?? null,
    company_name: companyName,
  };
}

export async function fetchAshbyJobs(
  boardSlug: string,
  companyName: string
): Promise<NormalizedPosting[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardSlug)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATS_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ATS_USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });

    if (res.status === 404 || res.status === 429) {
      throw new AtsHttpError(
        res.status,
        `Ashby ${res.status} for ${boardSlug}`
      );
    }
    if (!res.ok) {
      throw new AtsHttpError(
        res.status,
        `Ashby HTTP ${res.status} for ${boardSlug}`
      );
    }

    const body = (await res.json()) as { jobs?: AshbyJob[] };
    const jobs = Array.isArray(body.jobs) ? body.jobs : [];
    return jobs.map((job) => normalizeAshbyJob(job, companyName));
  } finally {
    clearTimeout(timer);
  }
}
