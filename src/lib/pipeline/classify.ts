import { resumeFingerprint } from "./fingerprint";

export type ChangedProfileRow = {
  id: string;
  resume_parsed: unknown;
  preferences?: unknown;
  resume_fingerprint?: string | null;
};

/**
 * Pure classification of profiles by fingerprint — unit-testable.
 * - `backfill`: never scored before (NULL fingerprint) — store hash, no LLM.
 * - `changed`: fingerprint differs from current resume — needs force re-score.
 */
export function classifyProfiles(
  profiles: ChangedProfileRow[],
  options: { force?: boolean } = {}
): {
  backfill: ChangedProfileRow[];
  changed: { profile: ChangedProfileRow; fingerprint: string }[];
} {
  const backfill: ChangedProfileRow[] = [];
  const changed: { profile: ChangedProfileRow; fingerprint: string }[] = [];
  for (const p of profiles) {
    const fp = resumeFingerprint(p.resume_parsed);
    if (options.force) {
      changed.push({ profile: p, fingerprint: fp });
      continue;
    }
    if (!p.resume_fingerprint) {
      backfill.push(p);
      continue;
    }
    if (p.resume_fingerprint !== fp) {
      changed.push({ profile: p, fingerprint: fp });
    }
  }
  return { backfill, changed };
}
