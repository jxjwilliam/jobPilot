import {
  ATS_TIMEOUT_MS,
  ATS_USER_AGENT,
  AtsHttpError,
  type NormalizedPosting,
} from "./types";

export type LeverPosting = {
  id: string;
  text: string;
  hostedUrl?: string | null;
  applyUrl?: string | null;
  createdAt?: number | null;
  descriptionPlain?: string | null;
  descriptionBodyPlain?: string | null;
  description?: string | null;
  openingPlain?: string | null;
  additionalPlain?: string | null;
  workplaceType?: string | null;
  categories?: {
    location?: string | null;
    commitment?: string | null;
    department?: string | null;
    team?: string | null;
    allLocations?: string[] | null;
  } | null;
  salaryRange?: {
    min?: number | null;
    max?: number | null;
    currency?: string | null;
    interval?: string | null;
  } | null;
};

function leverPostedAt(createdAt: number | null | undefined): string | null {
  if (createdAt == null || !Number.isFinite(createdAt)) return null;
  return new Date(createdAt).toISOString();
}

function leverLocation(posting: LeverPosting): string | null {
  const cats = posting.categories;
  if (!cats) return null;
  if (cats.location?.trim()) return cats.location.trim();
  if (Array.isArray(cats.allLocations) && cats.allLocations.length > 0) {
    return cats.allLocations.join(", ");
  }
  return null;
}

function leverDescription(posting: LeverPosting): string {
  const parts = [
    posting.descriptionPlain,
    posting.descriptionBodyPlain,
    posting.openingPlain,
    posting.additionalPlain,
  ].filter((p): p is string => Boolean(p && p.trim()));

  if (parts.length > 0) return parts.join("\n\n");
  return posting.description ?? "";
}

export function normalizeLeverPosting(
  posting: LeverPosting,
  companyName: string
): NormalizedPosting {
  return {
    external_id: posting.id,
    title: posting.text,
    location: leverLocation(posting),
    description_raw: leverDescription(posting),
    apply_url: posting.applyUrl ?? posting.hostedUrl ?? null,
    posted_at: leverPostedAt(posting.createdAt),
    employment_type:
      posting.categories?.commitment?.trim() ||
      posting.workplaceType?.trim() ||
      null,
    salary_min: posting.salaryRange?.min ?? null,
    salary_max: posting.salaryRange?.max ?? null,
    company_name: companyName,
  };
}

export async function fetchLeverPostings(
  boardSlug: string,
  companyName: string
): Promise<NormalizedPosting[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(boardSlug)}?mode=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATS_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ATS_USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });

    if (res.status === 404 || res.status === 429) {
      throw new AtsHttpError(res.status, `Lever ${res.status} for ${boardSlug}`);
    }
    if (!res.ok) {
      throw new AtsHttpError(res.status, `Lever HTTP ${res.status} for ${boardSlug}`);
    }

    const body = (await res.json()) as LeverPosting[];
    const postings = Array.isArray(body) ? body : [];
    return postings.map((p) => normalizeLeverPosting(p, companyName));
  } finally {
    clearTimeout(timer);
  }
}
