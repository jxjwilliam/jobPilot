import { createHash } from "node:crypto";

/**
 * Deterministic canonical JSON (sorted object keys) so the fingerprint is
 * independent of key insertion order. Returns a JSON string.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`)
    .join(",")}}`;
}

/**
 * Cheap, stable fingerprint of a parsed resume. sha256 of canonical JSON —
 * deterministic, microseconds, no external deps. Used only for change
 * detection, not security.
 */
export function resumeFingerprint(resumeParsed: unknown): string {
  return createHash("sha256")
    .update(canonicalStringify(resumeParsed ?? {}))
    .digest("hex");
}
