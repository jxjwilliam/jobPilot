import {
  ATS_TIMEOUT_MS,
  ATS_USER_AGENT,
  AtsHttpError,
  type NormalizedPosting,
} from "./types";

type RecruiteeOffer = {
  id: number | string;
  title: string;
  slug?: string | null;
  city?: string | null;
  country?: string | null;
  remote?: boolean | null;
  description?: string | null;
  requirements?: string | null;
  careers_url?: string | null;
  offer_url?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  employment_type?: string | null;
  department?: string | null;
  min_salary?: number | null;
  max_salary?: number | null;
};

export function normalizeRecruiteeOffer(
  offer: RecruiteeOffer,
  companyName: string
): NormalizedPosting {
  const location = [offer.city, offer.country]
    .filter(Boolean)
    .join(", ")
    .trim();
  const description = [offer.description, offer.requirements]
    .filter(Boolean)
    .join("\n\n");

  return {
    external_id: String(offer.id),
    title: offer.title,
    location: location || null,
    description_raw: description,
    apply_url: offer.offer_url ?? offer.careers_url ?? null,
    posted_at: offer.published_at ?? offer.created_at ?? null,
    employment_type: offer.employment_type?.trim() || null,
    salary_min: offer.min_salary ?? null,
    salary_max: offer.max_salary ?? null,
    company_name: companyName,
  };
}

export async function fetchRecruiteeJobs(
  boardSlug: string,
  companyName: string
): Promise<NormalizedPosting[]> {
  // Recruitee uses subdomain pattern: {slug}.recruitee.com
  const url = `https://${encodeURIComponent(boardSlug)}.recruitee.com/api/offers`;
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
        `Recruitee ${res.status} for ${boardSlug}`
      );
    }
    if (!res.ok) {
      throw new AtsHttpError(
        res.status,
        `Recruitee HTTP ${res.status} for ${boardSlug}`
      );
    }

    const body = (await res.json()) as { offers?: RecruiteeOffer[] };
    const offers = Array.isArray(body.offers) ? body.offers : [];
    return offers.map((offer) => normalizeRecruiteeOffer(offer, companyName));
  } finally {
    clearTimeout(timer);
  }
}
