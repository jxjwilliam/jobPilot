import {
  ATS_TIMEOUT_MS,
  ATS_USER_AGENT,
  AtsHttpError,
  type NormalizedPosting,
} from "./types";

type PersonioJob = {
  id: number | string;
  name: string;
  short?: string | null;
  office?: string | null;
  department?: string | null;
  employment_type?: string | null;
  description?: string | null;
  recruiting_category?: string | null;
  schedule?: string | null;
  created_at?: string | null;
  application_url?: string | null;
};

type PersonioResponse = {
  data?: PersonioJob[];
  jobs?: PersonioJob[];
  results?: PersonioJob[];
};

export function normalizePersonioJob(
  job: PersonioJob,
  companyName: string
): NormalizedPosting {
  const description = [job.description, job.short]
    .filter(Boolean)
    .join("\n\n");

  return {
    external_id: String(job.id),
    title: job.name,
    location: job.office?.trim() || null,
    description_raw: description,
    apply_url: job.application_url ?? null,
    posted_at: job.created_at ?? null,
    employment_type:
      job.employment_type?.trim() ||
      job.schedule?.trim() ||
      null,
    company_name: companyName,
  };
}

export async function fetchPersonioJobs(
  boardSlug: string,
  companyName: string
): Promise<NormalizedPosting[]> {
  // Personio uses: {slug}.jobs.personio.com
  const url = `https://${encodeURIComponent(boardSlug)}.jobs.personio.com/search.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATS_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ATS_USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });

    // Personio sometimes returns 404 if the company doesn't use their job board
    if (res.status === 404 || res.status === 429) {
      throw new AtsHttpError(
        res.status,
        `Personio ${res.status} for ${boardSlug}`
      );
    }
    if (!res.ok) {
      throw new AtsHttpError(
        res.status,
        `Personio HTTP ${res.status} for ${boardSlug}`
      );
    }

    const body = (await res.json()) as PersonioJob[] | PersonioResponse;

    // Personio API response can be either a raw array or a wrapped object
    let jobs: PersonioJob[] = [];
    if (Array.isArray(body)) {
      jobs = body;
    } else if (body.data && Array.isArray(body.data)) {
      jobs = body.data;
    } else if (body.jobs && Array.isArray(body.jobs)) {
      jobs = body.jobs;
    } else if (body.results && Array.isArray(body.results)) {
      jobs = body.results;
    }

    return jobs.map((job) => normalizePersonioJob(job, companyName));
  } finally {
    clearTimeout(timer);
  }
}
