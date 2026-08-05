import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { maybeTriggerPipeline } from "@/lib/pipeline/pipeline";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const location = (searchParams.get("location") ?? "").trim().toLowerCase();
  const remoteOnly = searchParams.get("remote") === "1";
  const maxAgeDaysRaw = searchParams.get("max_age_days");
  const maxAgeDays =
    maxAgeDaysRaw != null && maxAgeDaysRaw !== ""
      ? Number(maxAgeDaysRaw)
      : null;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const perPage = Math.min(50, Math.max(10, Number(searchParams.get("per_page")) || 20));

  const admin = createAdminClient();

  let query = admin
    .from("jp_postings")
    .select(
      "id, company_name, title, location, employment_type, apply_url, posted_at, first_seen_at, last_seen_at, description_raw",
      { count: "exact" }
    )
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false });

  if (q) {
    query = query.or(
      `title.ilike.%${q}%,company_name.ilike.%${q}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = (data ?? []).map((p) => ({
    ...p,
    posted_at: p.posted_at ?? p.first_seen_at ?? p.last_seen_at,
  }));

  // Client-side filters (Supabase doesn't easily support ilike on location in the same query)
  if (location) {
    rows = rows.filter((row) =>
      (row.location ?? "").toLowerCase().includes(location)
    );
  }

  if (remoteOnly) {
    rows = rows.filter((row) => /remote/i.test(row.location ?? ""));
  }

  if (maxAgeDays != null && Number.isFinite(maxAgeDays) && maxAgeDays > 0) {
    const cutoff = daysAgoIso(maxAgeDays);
    rows = rows.filter((row) => {
      const candidates = [row.posted_at, row.first_seen_at, row.last_seen_at].filter(
        (v): v is string => Boolean(v)
      );
      if (candidates.length === 0) return false;
      return (candidates.sort().at(-1)!) >= cutoff;
    });
  }

  const total = rows.length;
  const from = (page - 1) * perPage;
  const paged = rows.slice(from, from + perPage);

  // Lazy background refresh: if the pipeline is stale, kick it off after the response.
  await maybeTriggerPipeline(admin);

  return NextResponse.json({
    postings: paged,
    page,
    per_page: perPage,
    total,
    total_pages: Math.ceil(total / perPage),
  });
}
