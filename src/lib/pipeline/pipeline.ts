import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pollCompanies } from "@/lib/ingestion/poll";
import {
  scoreUnscoredBatch,
  scorePair,
  rankPostingsForProfile,
  isActiveProfile,
  type ScoreProfile,
  type ScorePosting,
} from "@/lib/scoring/score";
import { ParsedResumeSchema, type ParsedResume } from "@/lib/llm/schemas";
import { PreferencesSchema, type Preferences } from "@/lib/profile/types";
import { resumeFingerprint } from "./fingerprint";
import { classifyProfiles, type ChangedProfileRow } from "./classify";
import {
  acquirePipelineLock,
  releasePipelineLock,
  getPipelineState,
  isLockLive,
  isPipelineStale,
} from "./state";

const STALE_DAYS = 30;
const RESCORE_TOP_N = 50;
const RESCORE_MAX_PROFILES_PER_RUN = 5;
const RANK_CANDIDATE_LIMIT = 1200;

/** Deactivate postings not seen on any ATS board within `days`. Returns count. */
export async function deactivateStalePostings(
  admin: SupabaseClient,
  days = STALE_DAYS
): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("jp_postings")
    .update({ is_active: false })
    .eq("is_active", true)
    .lt("last_seen_at", cutoff)
    .select("id");
  if (error) throw new Error(`deactivateStalePostings: ${error.message}`);
  return data?.length ?? 0;
}

export type RescoreResult = {
  profilesChecked: number;
  backfilled: number;
  rescoredProfiles: number;
  rescoredPairs: number;
  errors: number;
};

async function loadTopRankedPostings(
  admin: SupabaseClient,
  resume: ParsedResume,
  preferences: Preferences,
  limit: number
): Promise<ScorePosting[]> {
  const { data, error } = await admin
    .from("jp_postings")
    .select(
      "id, company_name, title, location, employment_type, description_raw, salary_min, salary_max"
    )
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false })
    .limit(RANK_CANDIDATE_LIMIT);
  if (error) throw new Error(`loadTopRankedPostings: ${error.message}`);
  return rankPostingsForProfile((data ?? []) as ScorePosting[], resume, preferences).slice(
    0,
    limit
  );
}

/**
 * Force re-score the top-N ranked postings for profiles whose resume changed.
 * Loads ALL profiles, classifies, then processes up to `maxProfiles` changed
 * ones — so already-stamped profiles can't starve the rest of the queue.
 * Stamps the fingerprint only after the scoring attempt, so a transient error
 * doesn't re-trigger the full re-score on the next run.
 */
export async function rescoreChangedProfiles(
  admin: SupabaseClient,
  options: { limit?: number; maxProfiles?: number; force?: boolean } = {}
): Promise<RescoreResult> {
  const limit = options.limit ?? RESCORE_TOP_N;
  const maxProfiles = options.maxProfiles ?? RESCORE_MAX_PROFILES_PER_RUN;

  const { data: profiles, error } = await admin
    .from("jp_profiles")
    .select("id, resume_parsed, preferences, resume_fingerprint");
  if (error) throw new Error(`rescoreChangedProfiles: ${error.message}`);

  const rows = (profiles ?? []) as ChangedProfileRow[];
  const { backfill, changed } = classifyProfiles(rows, { force: options.force });

  // Backfill fingerprints for never-scored profiles (no LLM cost).
  for (const p of backfill) {
    await admin
      .from("jp_profiles")
      .update({ resume_fingerprint: resumeFingerprint(p.resume_parsed) })
      .eq("id", p.id);
  }

  let rescoredPairs = 0;
  let rescoredProfiles = 0;
  let errors = 0;

  for (const { profile, fingerprint } of changed.slice(0, maxProfiles)) {
    if (
      !isActiveProfile({
        id: profile.id,
        resume_parsed: profile.resume_parsed,
        preferences: profile.preferences,
      })
    ) {
      // Record the fingerprint so an empty resume isn't re-evaluated forever.
      await admin
        .from("jp_profiles")
        .update({ resume_fingerprint: fingerprint })
        .eq("id", profile.id);
      continue;
    }

    const resume = ParsedResumeSchema.parse(profile.resume_parsed ?? {});
    const preferences = PreferencesSchema.parse(profile.preferences ?? {});
    const postings = await loadTopRankedPostings(admin, resume, preferences, limit);
    const scoreProfile: ScoreProfile = {
      id: profile.id,
      resume_parsed: profile.resume_parsed,
      preferences: profile.preferences,
    };

    for (const posting of postings) {
      try {
        const outcome = await scorePair(admin, scoreProfile, posting, { force: true });
        if (!outcome.skipped) rescoredPairs += 1;
      } catch {
        errors += 1;
      }
    }

    rescoredProfiles += 1;
    await admin
      .from("jp_profiles")
      .update({ resume_fingerprint: fingerprint })
      .eq("id", profile.id);
  }

  return {
    profilesChecked: rows.length,
    backfilled: backfill.length,
    rescoredProfiles,
    rescoredPairs,
    errors,
  };
}

export type PipelineRunOptions = {
  /** Force re-score top-N for every profile regardless of fingerprint (expensive). Default off. */
  forceScore?: boolean;
  poll?: boolean;
  sweep?: boolean;
  score?: boolean;
  rescore?: boolean;
};

export type PipelineRunResult = {
  locked: boolean;
  polled: number;
  upserted: number;
  deactivated: number;
  scoredNew: number;
  rescoredPairs: number;
  backfilled: number;
  errors: number;
};

/**
 * One full pipeline cycle: poll ATS → deactivate stale → score new pairs →
 * re-score changed profiles. Serialized by the DB lock so concurrent triggers
 * never overlap. Idempotent at every step.
 */
export async function runPipeline(
  admin: SupabaseClient,
  options: PipelineRunOptions = {}
): Promise<PipelineRunResult> {
  const base: PipelineRunResult = {
    locked: false,
    polled: 0,
    upserted: 0,
    deactivated: 0,
    scoredNew: 0,
    rescoredPairs: 0,
    backfilled: 0,
    errors: 0,
  };

  const acquired = await acquirePipelineLock(admin);
  if (!acquired) return { ...base, locked: true };

  try {
    if (options.poll ?? true) {
      const r = await pollCompanies(admin);
      base.polled = r.polled;
      base.upserted = r.upserted;
      await admin
        .from("jp_pipeline_state")
        .update({ last_poll_at: new Date().toISOString() })
        .eq("id", 1);
    }
    if (options.sweep ?? true) {
      base.deactivated = await deactivateStalePostings(admin, STALE_DAYS);
      await admin
        .from("jp_pipeline_state")
        .update({ last_sweep_at: new Date().toISOString() })
        .eq("id", 1);
    }
    if (options.score ?? true) {
      const r = await scoreUnscoredBatch(admin, { limit: 50 });
      base.scoredNew = r.scored;
      base.errors += r.errors;
    }
    if (options.rescore ?? true) {
      const r = await rescoreChangedProfiles(admin, {
        limit: RESCORE_TOP_N,
        force: options.forceScore,
      });
      base.rescoredPairs = r.rescoredPairs;
      base.backfilled = r.backfilled;
      base.errors += r.errors;
    }
    await admin
      .from("jp_pipeline_state")
      .update({ last_score_at: new Date().toISOString() })
      .eq("id", 1);
    return base;
  } finally {
    await releasePipelineLock(admin);
  }
}

/**
 * Lazy background trigger for page-loaded routes: if the pipeline is stale
 * (>6h since last poll) and no live lock, register `runPipeline` to run after
 * the response is sent. Call this (and await it) from read routes like
 * `/api/stats` and `/api/postings/browse`. AWAIT it so `after()` is registered
 * while the request is still in flight; the lock serializes any duplicate
 * triggers, and runPipeline re-checks before running.
 */
export async function maybeTriggerPipeline(admin: SupabaseClient): Promise<boolean> {
  try {
    const state = await getPipelineState(admin);
    const running = isLockLive(state?.running ?? false, state?.running_at ?? null);
    if (!isPipelineStale(state?.last_poll_at ?? null) || running) return false;
    after(() =>
      runPipeline(admin).catch((err) =>
        console.error("[pipeline] lazy run failed", err)
      )
    );
    return true;
  } catch (err) {
    // Pipeline state table may not exist yet (pre-migration) — never 500 the caller.
    console.warn("[pipeline] lazy trigger skipped", err);
    return false;
  }
}
