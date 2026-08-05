import type { SupabaseClient } from "@supabase/supabase-js";

export const FREE_MONTHLY_LIMIT = 5;

export type SubscriptionTier = "free" | "pro" | "crunch";

export type UsageSnapshot = {
  tier: SubscriptionTier;
  tailoring_count: number;
  limit: number | null;
  reset_at: string;
};

type UsageCounterRow = {
  user_id: string;
  period_start: string;
  tailoring_count: number;
  reset_at: string;
};

export function canTailor(input: {
  tier: string;
  tailoring_count: number;
}): boolean {
  if (input.tier === "pro" || input.tier === "crunch") return true;
  return input.tailoring_count < FREE_MONTHLY_LIMIT;
}

function periodStartDate(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function nextMonthResetAt(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  ).toISOString();
}

function limitForTier(tier: SubscriptionTier): number | null {
  return tier === "free" ? FREE_MONTHLY_LIMIT : null;
}

/** Reset the usage period when `now >= reset_at`. Prefer admin client for writes. */
export async function ensureUsagePeriod(
  client: SupabaseClient,
  userId: string
): Promise<UsageCounterRow> {
  const { data, error } = await client
    .from("jp_usage_counters")
    .select("user_id, period_start, tailoring_count, reset_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const now = new Date();

  if (!data) {
    const row = {
      user_id: userId,
      period_start: periodStartDate(now),
      tailoring_count: 0,
      reset_at: nextMonthResetAt(now),
    };
    const { data: inserted, error: insertError } = await client
      .from("jp_usage_counters")
      .insert(row)
      .select("user_id, period_start, tailoring_count, reset_at")
      .single();
    if (insertError) throw new Error(insertError.message);
    return inserted as UsageCounterRow;
  }

  if (now >= new Date(data.reset_at)) {
    const { data: updated, error: updateError } = await client
      .from("jp_usage_counters")
      .update({
        period_start: periodStartDate(now),
        tailoring_count: 0,
        reset_at: nextMonthResetAt(now),
      })
      .eq("user_id", userId)
      .select("user_id, period_start, tailoring_count, reset_at")
      .single();
    if (updateError) throw new Error(updateError.message);
    return updated as UsageCounterRow;
  }

  return data as UsageCounterRow;
}

export async function getUsageForUser(
  client: SupabaseClient,
  userId: string
): Promise<UsageSnapshot> {
  const counter = await ensureUsagePeriod(client, userId);

  const { data: user, error } = await client
    .from("jp_users")
    .select("subscription_tier")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const tier = (user?.subscription_tier ?? "free") as SubscriptionTier;

  return {
    tier,
    tailoring_count: counter.tailoring_count,
    limit: limitForTier(tier),
    reset_at: counter.reset_at,
  };
}

/** Increment after ensuring the period is current. Prefer admin client (RLS is SELECT-only). */
export async function incrementTailoring(
  client: SupabaseClient,
  userId: string
): Promise<UsageCounterRow> {
  const counter = await ensureUsagePeriod(client, userId);

  const { data, error } = await client
    .from("jp_usage_counters")
    .update({ tailoring_count: counter.tailoring_count + 1 })
    .eq("user_id", userId)
    .select("user_id, period_start, tailoring_count, reset_at")
    .single();

  if (error) throw new Error(error.message);
  return data as UsageCounterRow;
}
