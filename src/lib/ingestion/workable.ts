import {
  ATS_TIMEOUT_MS,
  ATS_USER_AGENT,
  AtsHttpError,
  type NormalizedPosting,
} from "./types";

type WorkableJob = {
  id: string;
  title: string;
  full_title?: string | null;
  location?: string | null;
  description?: string | null;
  requirements?: string | null;
  benefits?: string | null;
  application_url?: string | null;
  shortlink?: string | null;
  published?: string | null;
  created_at?: string | null;
  employment_type?: string | null;
  department?: string | null;
  remote?: boolean | null;
  salary_from?: number | null;
  salary_to?: number | null;
};

export function normalizeWorkableJob(
  job: WorkableJob,
  companyName: string
): NormalizedPosting {
  const description = [
    job.description,
    job.requirements ? `Requirements:\n${job.requirements}` : null,
    job.benefits ? `Benefits:\n${job.benefits}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    external_id: job.id,
    title: job.title,
    location: job.location?.trim() || null,
    description_raw: description,
    apply_url: job.application_url ?? job.shortlink ?? null,
    posted_at: job.published ?? job.created_at ?? null,
    employment_type: job.employment_type?.trim() || null,
    salary_min: job.salary_from ?? null,
    salary_max: job.salary_to ?? null,
    company_name: companyName,
  };
}

export async function fetchWorkableJobs(
  boardSlug: string,
  companyName: string
): Promise<NormalizedPosting[]> {
  // Workable uses subdomain pattern: {slug}.workable.com
  const url = `https://${encodeURIComponent(boardSlug)}.workable.com/api/v3/jobs`;
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
        `Workable ${res.status} for ${boardSlug}`
      );
    }
    if (!res.ok) {
      throw new AtsHttpError(
        res.status,
        `Workable HTTP ${res.status} for ${boardSlug}`
      );
    }

    const body = (await res.json()) as { jobs?: WorkableJob[] };
    const jobs = Array.isArray(body.jobs) ? body.jobs : [];
    return jobs.map((job) => normalizeWorkableJob(job, companyName));
  } finally {
    clearTimeout(timer);
  }
}
