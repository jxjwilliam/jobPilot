import type { SupabaseClient } from "@supabase/supabase-js";

/** Lazy-trigger threshold: run the pipeline if it's been longer than this since last poll. */
export const PIPELINE_TTL_MS = 6 * 60 * 60 * 1000;
/** A lock older than this is considered dead and can be taken over. */
export const PIPELINE_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

export type PipelineState = {
  id: number;
  last_poll_at: string | null;
  last_sweep_at: string | null;
  last_score_at: string | null;
  running: boolean;
  running_at: string | null;
};

/** Pure TTL check — unit-testable. */
export function isPipelineStale(
  lastPollAt: string | null,
  now = Date.now(),
  ttlMs = PIPELINE_TTL_MS
): boolean {
  if (!lastPollAt) return true;
  return now - new Date(lastPollAt).getTime() > ttlMs;
}

/** Pure lock-liveness check — unit-testable. */
export function isLockLive(
  running: boolean,
  runningAt: string | null,
  now = Date.now(),
  timeoutMs = PIPELINE_LOCK_TIMEOUT_MS
): boolean {
  if (!running || !runningAt) return false;
  return now - new Date(runningAt).getTime() < timeoutMs;
}

export async function getPipelineState(
  admin: SupabaseClient
): Promise<PipelineState | null> {
  const { data, error } = await admin
    .from("jp_pipeline_state")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`getPipelineState: ${error.message}`);
  return (data as PipelineState) ?? null;
}

/**
 * Atomic lock via two conditional single-row UPDATEs. Under READ COMMITTED the
 * row lock serializes concurrent writers: only one caller wins the first
 * `.eq("running", false)`; a loser that then hits a still-live lock fails the
 * second UPDATE too. A stale `running_at` is takeable.
 */
export async function acquirePipelineLock(
  admin: SupabaseClient
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const cutoff = new Date(Date.now() - PIPELINE_LOCK_TIMEOUT_MS).toISOString();

  const { data: fresh } = await admin
    .from("jp_pipeline_state")
    .update({ running: true, running_at: nowIso })
    .eq("id", 1)
    .eq("running", false)
    .select("id")
    .maybeSingle();
  if (fresh) return true;

  const { data: stale } = await admin
    .from("jp_pipeline_state")
    .update({ running: true, running_at: nowIso })
    .eq("id", 1)
    .eq("running", true)
    .lt("running_at", cutoff)
    .select("id")
    .maybeSingle();
  return Boolean(stale);
}

export async function releasePipelineLock(admin: SupabaseClient): Promise<void> {
  await admin
    .from("jp_pipeline_state")
    .update({ running: false, running_at: null })
    .eq("id", 1);
}
