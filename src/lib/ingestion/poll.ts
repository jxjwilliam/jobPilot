import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGreenhouseJobs } from "./greenhouse";
import { fetchLeverPostings } from "./lever";
import { fetchAshbyJobs } from "./ashby";
import { fetchWorkableJobs } from "./workable";
import { fetchRecruiteeJobs } from "./recruitee";
import { fetchPersonioJobs } from "./personio";
import {
  MAX_CONSECUTIVE_FAILURES,
  POLL_BATCH_SIZE,
  AtsHttpError,
  type AtsSource,
  type CompanyRow,
  type NormalizedPosting,
  type PollResult,
} from "./types";

async function fetchForCompany(
  company: CompanyRow
): Promise<NormalizedPosting[]> {
  if (company.ats_source === "greenhouse") {
    return fetchGreenhouseJobs(company.board_slug, company.company_name);
  }
  if (company.ats_source === "lever") {
    return fetchLeverPostings(company.board_slug, company.company_name);
  }
  if (company.ats_source === "ashby") {
    return fetchAshbyJobs(company.board_slug, company.company_name);
  }
  if (company.ats_source === "workable") {
    return fetchWorkableJobs(company.board_slug, company.company_name);
  }
  if (company.ats_source === "recruitee") {
    return fetchRecruiteeJobs(company.board_slug, company.company_name);
  }
  if (company.ats_source === "personio") {
    return fetchPersonioJobs(company.board_slug, company.company_name);
  }
  throw new Error(`Unsupported ats_source: ${company.ats_source}`);
}

async function markCompanyFailure(
  adminClient: SupabaseClient,
  company: CompanyRow,
  nowIso: string
): Promise<void> {
  const failures = company.consecutive_failures + 1;
  const patch: Record<string, unknown> = {
    consecutive_failures: failures,
    last_polled_at: nowIso,
  };
  if (failures >= MAX_CONSECUTIVE_FAILURES) {
    patch.is_active = false;
  }
  await adminClient.from("jp_companies").update(patch).eq("id", company.id);
}

async function markCompanySuccess(
  adminClient: SupabaseClient,
  company: CompanyRow,
  nowIso: string
): Promise<void> {
  await adminClient
    .from("jp_companies")
    .update({
      consecutive_failures: 0,
      last_polled_at: nowIso,
      is_active: true,
    })
    .eq("id", company.id);
}

async function upsertPostings(
  adminClient: SupabaseClient,
  atsSource: AtsSource,
  postings: NormalizedPosting[],
  nowIso: string
): Promise<number> {
  if (postings.length === 0) return 0;

  const rows = postings.map((p) => ({
    ats_source: atsSource,
    external_id: p.external_id,
    company_name: p.company_name,
    title: p.title,
    location: p.location,
    employment_type: p.employment_type ?? null,
    description_raw: p.description_raw,
    salary_min: p.salary_min ?? null,
    salary_max: p.salary_max ?? null,
    apply_url: p.apply_url,
    posted_at: p.posted_at,
    last_seen_at: nowIso,
    is_active: true,
  }));

  // Upsert in chunks to avoid oversized payloads
  const chunkSize = 100;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error, count } = await adminClient.from("jp_postings").upsert(chunk, {
      onConflict: "ats_source,external_id",
      count: "exact",
    });
    if (error) {
      throw new Error(error.message);
    }
    upserted += count ?? chunk.length;
  }
  return upserted;
}

export async function pollCompanies(
  adminClient: SupabaseClient
): Promise<PollResult> {
  const result: PollResult = { polled: 0, upserted: 0, errors: [] };

  const { data: companies, error } = await adminClient
    .from("jp_companies")
    .select(
      "id, ats_source, board_slug, company_name, is_active, consecutive_failures, last_polled_at"
    )
    .eq("is_active", true)
    .order("last_polled_at", { ascending: true, nullsFirst: true });

  if (error) {
    throw new Error(`Failed to load companies: ${error.message}`);
  }

  const active = (companies ?? []) as CompanyRow[];

  for (let i = 0; i < active.length; i += POLL_BATCH_SIZE) {
    const batch = active.slice(i, i + POLL_BATCH_SIZE);

    for (const company of batch) {
      const nowIso = new Date().toISOString();
      result.polled += 1;

      try {
        const postings = await fetchForCompany(company);
        const upserted = await upsertPostings(
          adminClient,
          company.ats_source,
          postings,
          nowIso
        );
        result.upserted += upserted;
        await markCompanySuccess(adminClient, company, nowIso);
      } catch (err) {
        const message =
          err instanceof AtsHttpError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);

        result.errors.push({
          company: `${company.ats_source}/${company.board_slug}`,
          error: message,
        });

        // Catch 404/429 and other fetch failures — bump consecutive_failures
        await markCompanyFailure(adminClient, company, nowIso);
      }
    }
  }

  return result;
}
