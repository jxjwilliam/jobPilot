import type { SupabaseClient } from "@supabase/supabase-js";
import { getUsageForUser } from "@/lib/billing/quota";
import { DEFAULT_MIN_SCORE } from "@/lib/scoring/score";

export type DigestUser = {
  email: string;
  name?: string;
};

export type DigestHighFit = {
  count: number;
  sampleTitles: string[];
};

export type DigestReviewing = {
  count: number;
  sampleTitles: string[];
};

export type DigestQuota = {
  tier: string;
  /** Monthly tailor limit; null means unlimited (pro/crunch). */
  limit: number | null;
  /** Tailors used in the current period. */
  count: number;
};

export type DigestData = {
  highFit: DigestHighFit;
  reviewing: DigestReviewing;
  quota: DigestQuota;
};

export type DigestEmail = {
  subject: string;
  html: string;
};

const SAMPLE_LIMIT = 5;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function quotaRemainingLabel(quota: DigestQuota): string {
  if (quota.limit == null || quota.tier === "pro" || quota.tier === "crunch") {
    return "Unlimited";
  }
  const remaining = Math.max(0, quota.limit - quota.count);
  return `${remaining} of ${quota.limit}`;
}

function listItems(titles: string[]): string {
  if (titles.length === 0) return "<li><em>None</em></li>";
  return titles.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
}

/**
 * Pure builder: subject + HTML digest from pre-gathered user data.
 * No network / DB access.
 */
export function buildDigestForUser(
  user: DigestUser,
  data: DigestData
): DigestEmail {
  const greeting = user.name
    ? `Hi ${escapeHtml(user.name)},`
    : `Hi ${escapeHtml(user.email)},`;

  const subject =
    data.highFit.count > 0
      ? `JobPilot weekly digest: ${data.highFit.count} new high-fit role${data.highFit.count === 1 ? "" : "s"}`
      : "Your JobPilot weekly digest";

  const remaining = quotaRemainingLabel(data.quota);

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <p>${greeting}</p>
  <p>Here's your JobPilot summary for the past week.</p>

  <h2>New high-fit matches</h2>
  <p><strong>${data.highFit.count}</strong> posting${data.highFit.count === 1 ? "" : "s"} scored at or above ${DEFAULT_MIN_SCORE}.</p>
  <ul>${listItems(data.highFit.sampleTitles)}</ul>

  <h2>Awaiting your review</h2>
  <p><strong>${data.reviewing.count}</strong> tailored application${data.reviewing.count === 1 ? "" : "s"} in <code>reviewing</code>.</p>
  <ul>${listItems(data.reviewing.sampleTitles)}</ul>

  <h2>Tailoring quota remaining</h2>
  <p>${escapeHtml(remaining)}${data.quota.limit == null ? "" : ` (${data.quota.count} used this period)`}.</p>

  <p style="margin-top: 2rem; color: #666; font-size: 0.9rem;">— JobPilot</p>
</body>
</html>`;

  return { subject, html };
}

function weekAgoIso(now = new Date()): string {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

type PostingTitleJoin = { title: string } | { title: string }[] | null;

function postingTitle(join: PostingTitleJoin): string | null {
  if (!join) return null;
  if (Array.isArray(join)) return join[0]?.title ?? null;
  return join.title ?? null;
}

export type DigestProfileRow = {
  profileId: string;
  userId: string;
  email: string;
};

/** Load users that have a profile row (digest recipients). */
export async function listDigestRecipients(
  adminClient: SupabaseClient
): Promise<DigestProfileRow[]> {
  const { data, error } = await adminClient
    .from("jp_profiles")
    .select("id, user_id, users!inner(id, email)");

  if (error) throw new Error(error.message);

  const rows: DigestProfileRow[] = [];
  for (const row of data ?? []) {
    const users = row.users as
      | { id: string; email: string }
      | { id: string; email: string }[]
      | null;
    const user = Array.isArray(users) ? users[0] : users;
    if (!user?.email) continue;
    rows.push({
      profileId: row.id as string,
      userId: row.user_id as string,
      email: user.email,
    });
  }
  return rows;
}

/** Gather digest inputs for one profile (DB reads only). */
export async function gatherDigestData(
  adminClient: SupabaseClient,
  profileId: string,
  userId: string,
  now = new Date()
): Promise<DigestData> {
  const since = weekAgoIso(now);

  const [{ data: scores, error: scoresError }, { data: apps, error: appsError }, usage] =
    await Promise.all([
      adminClient
        .from("jp_scores")
        .select("score, scored_at, postings(title)")
        .eq("profile_id", profileId)
        .gte("score", DEFAULT_MIN_SCORE)
        .gte("scored_at", since)
        .order("scored_at", { ascending: false }),
      adminClient
        .from("jp_applications")
        .select("id, postings(title)")
        .eq("profile_id", profileId)
        .eq("status", "reviewing"),
      getUsageForUser(adminClient, userId),
    ]);

  if (scoresError) throw new Error(scoresError.message);
  if (appsError) throw new Error(appsError.message);

  const highFitTitles: string[] = [];
  for (const row of scores ?? []) {
    const title = postingTitle(row.postings as PostingTitleJoin);
    if (title) highFitTitles.push(title);
  }

  const reviewingTitles: string[] = [];
  for (const row of apps ?? []) {
    const title = postingTitle(row.postings as PostingTitleJoin);
    if (title) reviewingTitles.push(title);
  }

  return {
    highFit: {
      count: (scores ?? []).length,
      sampleTitles: highFitTitles.slice(0, SAMPLE_LIMIT),
    },
    reviewing: {
      count: (apps ?? []).length,
      sampleTitles: reviewingTitles.slice(0, SAMPLE_LIMIT),
    },
    quota: {
      tier: usage.tier,
      limit: usage.limit,
      count: usage.tailoring_count,
    },
  };
}
